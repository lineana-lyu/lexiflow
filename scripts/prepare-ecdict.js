"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const readline = require("readline");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const { DatabaseSync } = require("node:sqlite");

const DEFAULT_SOURCE_URL = "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv";
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT = path.join(ROOT, "resources", "ecdict.sqlite");
const EXPECTED_COLUMNS = [
  "word",
  "phonetic",
  "definition",
  "translation",
  "pos",
  "collins",
  "oxford",
  "tag",
  "bnc",
  "frq",
  "exchange",
  "detail",
  "audio",
];

function parseCsvLine(line) {
  const out = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (ch === "," && !quoted) {
      out.push(value);
      value = "";
      continue;
    }
    value += ch;
  }
  out.push(value);
  return out;
}

function normalizeEscapedNewlines(value) {
  return String(value || "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .trim();
}

function asInt(value) {
  const n = Number.parseInt(String(value || "0"), 10);
  return Number.isFinite(n) ? n : 0;
}

async function downloadToFile(url, destination) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/csv,*/*;q=0.8",
      "User-Agent": "LexiFlow-ECDICT/0.9",
    },
  });
  if (!response.ok || !response.body) {
    throw new Error(`ECDICT download failed: HTTP ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination));
}

function isValidDatabase(filePath) {
  if (!fs.existsSync(filePath)) return false;
  let db;
  try {
    db = new DatabaseSync(filePath, { readOnly: true });
    const row = db.prepare("SELECT value FROM metadata WHERE key = 'entry_count'").get();
    return Number(row?.value || 0) > 0;
  } catch {
    return false;
  } finally {
    try { db?.close(); } catch {}
  }
}

async function importCsvToSqlite(csvPath, outputPath, sourceLabel = DEFAULT_SOURCE_URL) {
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  const tempDb = `${outputPath}.${process.pid}.tmp`;
  await fsp.rm(tempDb, { force: true });

  const db = new DatabaseSync(tempDb);
  db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    PRAGMA temp_store = MEMORY;
    CREATE TABLE entries (
      word TEXT PRIMARY KEY COLLATE NOCASE,
      phonetic TEXT NOT NULL DEFAULT '',
      definition TEXT NOT NULL DEFAULT '',
      translation TEXT NOT NULL DEFAULT '',
      pos TEXT NOT NULL DEFAULT '',
      collins INTEGER NOT NULL DEFAULT 0,
      oxford INTEGER NOT NULL DEFAULT 0,
      tag TEXT NOT NULL DEFAULT '',
      bnc INTEGER NOT NULL DEFAULT 0,
      frq INTEGER NOT NULL DEFAULT 0,
      exchange TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX idx_entries_frq ON entries(frq);
    CREATE INDEX idx_entries_bnc ON entries(bnc);
    CREATE TABLE metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const input = fs.createReadStream(csvPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let header = null;
  let indexes = null;
  let count = 0;
  let batch = 0;

  const insert = db.prepare(`
    INSERT OR REPLACE INTO entries
      (word, phonetic, definition, translation, pos, collins, oxford, tag, bnc, frq, exchange)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    for await (const rawLine of rl) {
      const line = rawLine.replace(/^\uFEFF/, "");
      if (!line.trim()) continue;
      const cols = parseCsvLine(line);
      if (!header) {
        header = cols.map(x => x.trim());
        indexes = Object.fromEntries(EXPECTED_COLUMNS.map(name => [name, header.indexOf(name)]));
        if (indexes.word < 0 || indexes.translation < 0) {
          throw new Error("ECDICT CSV header is not recognized");
        }
        continue;
      }

      const get = name => {
        const idx = indexes[name];
        return idx >= 0 && idx < cols.length ? cols[idx] : "";
      };
      const word = String(get("word") || "").trim();
      if (!word) continue;

      insert.run(
        word,
        normalizeEscapedNewlines(get("phonetic")),
        normalizeEscapedNewlines(get("definition")),
        normalizeEscapedNewlines(get("translation")),
        normalizeEscapedNewlines(get("pos")),
        asInt(get("collins")),
        asInt(get("oxford")),
        String(get("tag") || "").trim(),
        asInt(get("bnc")),
        asInt(get("frq")),
        String(get("exchange") || "").trim()
      );
      count += 1;
      batch += 1;
      if (batch >= 5000) {
        db.exec("COMMIT; BEGIN");
        batch = 0;
      }
    }
    db.exec("COMMIT");

    const meta = db.prepare("INSERT OR REPLACE INTO metadata(key, value) VALUES (?, ?)");
    meta.run("entry_count", String(count));
    meta.run("source", String(sourceLabel || DEFAULT_SOURCE_URL));
    meta.run("schema", "lexiflow-ecdict-v1");
    meta.run("prepared_at", new Date().toISOString());
    db.exec("ANALYZE");
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch {}
    throw err;
  } finally {
    db.close();
  }

  await fsp.rm(outputPath, { force: true });
  await fsp.rename(tempDb, outputPath);
  return { outputPath, count };
}

async function prepareEcdictDatabase({ source = DEFAULT_SOURCE_URL, outputPath = DEFAULT_OUTPUT, force = false } = {}) {
  const resolvedOutput = path.resolve(outputPath);
  if (!force && isValidDatabase(resolvedOutput)) {
    return { outputPath: resolvedOutput, reused: true };
  }

  await fsp.mkdir(path.dirname(resolvedOutput), { recursive: true });
  const isRemote = /^https?:\/\//i.test(source);
  let csvPath = source;
  let temporaryCsv = false;

  if (isRemote) {
    csvPath = `${resolvedOutput}.${process.pid}.csv.tmp`;
    temporaryCsv = true;
    await fsp.rm(csvPath, { force: true });
    await downloadToFile(source, csvPath);
  } else {
    csvPath = path.resolve(source);
    if (!fs.existsSync(csvPath)) throw new Error(`ECDICT CSV not found: ${csvPath}`);
  }

  try {
    const result = await importCsvToSqlite(csvPath, resolvedOutput, source);
    return { ...result, reused: false };
  } finally {
    if (temporaryCsv) await fsp.rm(csvPath, { force: true }).catch(() => {});
  }
}

function parseArgs(argv) {
  const result = { source: DEFAULT_SOURCE_URL, outputPath: DEFAULT_OUTPUT, force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source") result.source = argv[++i];
    else if (arg === "--output") result.outputPath = argv[++i];
    else if (arg === "--force") result.force = true;
  }
  return result;
}

if (require.main === module) {
  prepareEcdictDatabase(parseArgs(process.argv.slice(2)))
    .then(result => {
      console.log(result.reused
        ? `ECDICT database ready: ${result.outputPath}`
        : `ECDICT database prepared: ${result.outputPath} (${result.count} entries)`);
    })
    .catch(err => {
      console.error("ECDICT preparation failed:", err.message || err);
      process.exitCode = 1;
    });
}

module.exports = {
  DEFAULT_SOURCE_URL,
  DEFAULT_OUTPUT,
  parseCsvLine,
  prepareEcdictDatabase,
  isValidDatabase,
};