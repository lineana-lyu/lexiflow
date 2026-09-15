"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const readline = require("readline");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const { createGunzip } = require("zlib");
const { createHash } = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_SOURCE_URL = "https://github.com/ahpxex/open-dictionary/releases/download/v2.0/distribution.jsonl.gz";
const DEFAULT_SOURCE_SHA256 = "69af69cdc685b5dce465613d1cc8fffb598eb46714f57cf73bd6606c2ceb7e43";
const DEFAULT_OUTPUT = path.join(ROOT, "resources", "phrase-dictionary.sqlite");
const PHRASE_SCHEMA = "lexiflow-open-dictionary-phrases-v2-whole-ipa";

function clean(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeHeadword(value) {
  return clean(value).toLowerCase();
}

function expressionParts(value) {
  return clean(value).match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g) || [];
}

function ipaParts(value) {
  const raw = clean(value).replace(/^\/+|\/+$/g, "").replace(/^\[+|\]+$/g, "");
  return raw.split(/\s+/).map(part => part.trim()).filter(Boolean);
}

function isWholeExpressionIpa(headword, ipa) {
  const words = expressionParts(headword);
  const phones = ipaParts(ipa);
  return words.length >= 2 && phones.length >= words.length;
}

function priorityRank(value) {
  const p = clean(value).toLowerCase();
  return p === "core" ? 0 : p === "common" ? 1 : 2;
}

function isUsPronunciation(item) {
  const tags = Array.isArray(item?.tags) ? item.tags.join(" ") : "";
  return /(^|\b)(us|u\.s\.|usa|american|general american|ga)(\b|$)/i.test(tags);
}

function compactEntry(entry) {
  const headword = clean(entry?.headword || entry?.normalized_headword);
  const normalized = normalizeHeadword(entry?.normalized_headword || headword);
  if (!headword || !normalized || !/\s/.test(normalized)) return null;

  const pronunciations = [];
  const senses = [];
  let order = 0;
  for (const group of Array.isArray(entry?.pos_groups) ? entry.pos_groups : []) {
    const pos = clean(group?.pos) || "phrase";
    for (const pronunciation of Array.isArray(group?.pronunciations) ? group.pronunciations : []) {
      const ipa = clean(pronunciation?.ipa || pronunciation?.text);
      if (!ipa || !isWholeExpressionIpa(normalized, ipa)) continue;
      pronunciations.push({ ipa, us:isUsPronunciation(pronunciation) });
    }
    for (const meaning of Array.isArray(group?.meanings) ? group.meanings : []) {
      const meaningZh = clean(meaning?.short_gloss || meaning?.learner_explanation);
      if (!meaningZh) continue;
      const examples = Array.isArray(meaning?.examples) ? meaning.examples : [];
      const firstExample = examples.find(item => clean(item?.text)) || {};
      senses.push({
        id:clean(meaning?.sense_id) || `${normalized}-${order + 1}`,
        pos,
        priority:["core","common","rare"].includes(clean(meaning?.priority).toLowerCase()) ? clean(meaning.priority).toLowerCase() : "rare",
        meaningZh,
        learnerExplanationZh:clean(meaning?.learner_explanation),
        usageNoteZh:clean(meaning?.usage_note || group?.usage_note),
        exampleEn:clean(firstExample?.text),
        exampleZh:clean(firstExample?.translation),
        order:order++,
      });
    }
  }
  if (!senses.length) return null;

  senses.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.order - b.order);
  const deduped = [];
  const seen = new Set();
  for (const sense of senses) {
    const key = `${sense.pos}\u0000${sense.meaningZh}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { order: _order, ...cleanSense } = sense;
    deduped.push(cleanSense);
    if (deduped.length >= 6) break;
  }

  const uniquePronunciations = [];
  const seenIpa = new Set();
  for (const item of pronunciations) {
    if (seenIpa.has(item.ipa)) continue;
    seenIpa.add(item.ipa);
    uniquePronunciations.push(item);
  }
  const us = uniquePronunciations.find(item => item.us)?.ipa || "";
  const any = uniquePronunciations[0]?.ipa || "";
  return {
    normalizedHeadword:normalized,
    headword,
    phoneticUs:us,
    phoneticAny:any,
    senses:deduped,
  };
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const input = fs.createReadStream(filePath);
    input.on("data", chunk => hash.update(chunk));
    input.on("error", reject);
    input.on("end", resolve);
  });
  return hash.digest("hex");
}

async function downloadToFile(url, destination) {
  const response = await fetch(url, {
    redirect:"follow",
    headers:{Accept:"application/gzip,application/octet-stream,*/*;q=0.8", "User-Agent":"LexiFlow-PhraseDictionary/1.0"},
  });
  if (!response.ok || !response.body) throw new Error(`Open Dictionary download failed: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination));
}

function isValidDatabase(filePath) {
  if (!fs.existsSync(filePath)) return false;
  let db;
  try {
    db = new DatabaseSync(filePath, { readOnly:true });
    const count = Number(db.prepare("SELECT value FROM metadata WHERE key='phrase_count'").get()?.value || 0);
    const schema = String(db.prepare("SELECT value FROM metadata WHERE key='schema'").get()?.value || "");
    return count > 0 && schema === PHRASE_SCHEMA;
  } catch {
    return false;
  } finally {
    try { db?.close(); } catch {}
  }
}

async function importJsonlGzipToSqlite(gzipPath, outputPath, sourceLabel) {
  await fsp.mkdir(path.dirname(outputPath), { recursive:true });
  const tempDb = `${outputPath}.${process.pid}.tmp`;
  await fsp.rm(tempDb, { force:true });
  const db = new DatabaseSync(tempDb);
  db.exec(`
    PRAGMA journal_mode=OFF;
    PRAGMA synchronous=OFF;
    PRAGMA temp_store=MEMORY;
    CREATE TABLE phrases (
      normalized_headword TEXT PRIMARY KEY COLLATE NOCASE,
      headword TEXT NOT NULL,
      phonetic_us TEXT NOT NULL DEFAULT '',
      phonetic_any TEXT NOT NULL DEFAULT '',
      senses_json TEXT NOT NULL
    );
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  const insert = db.prepare(`
    INSERT OR REPLACE INTO phrases(normalized_headword, headword, phonetic_us, phonetic_any, senses_json)
    VALUES (?, ?, ?, ?, ?)
  `);
  const input = fs.createReadStream(gzipPath).pipe(createGunzip());
  const rl = readline.createInterface({ input, crlfDelay:Infinity });
  let count = 0;
  let scanned = 0;
  db.exec("BEGIN");
  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      scanned += 1;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      const compact = compactEntry(entry);
      if (!compact) continue;
      insert.run(compact.normalizedHeadword, compact.headword, compact.phoneticUs, compact.phoneticAny, JSON.stringify(compact.senses));
      count += 1;
      if (count % 2500 === 0) db.exec("COMMIT; BEGIN");
    }
    db.exec("COMMIT");
    const meta = db.prepare("INSERT OR REPLACE INTO metadata(key,value) VALUES (?,?)");
    meta.run("phrase_count", String(count));
    meta.run("source", String(sourceLabel || DEFAULT_SOURCE_URL));
    meta.run("source_sha256", DEFAULT_SOURCE_SHA256);
    meta.run("schema", PHRASE_SCHEMA);
    meta.run("prepared_at", new Date().toISOString());
    meta.run("scanned_entries", String(scanned));
    db.exec("ANALYZE");
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch {}
    throw err;
  } finally {
    db.close();
  }
  await fsp.rm(outputPath, { force:true });
  await fsp.rename(tempDb, outputPath);
  return { outputPath, count, scanned };
}

async function preparePhraseDictionary({ source=DEFAULT_SOURCE_URL, outputPath=DEFAULT_OUTPUT, force=false }={}) {
  const resolvedOutput = path.resolve(outputPath);
  if (!force && isValidDatabase(resolvedOutput)) return { outputPath:resolvedOutput, reused:true };
  await fsp.mkdir(path.dirname(resolvedOutput), { recursive:true });
  const remote = /^https?:\/\//i.test(source);
  let gzipPath = source;
  let temporary = false;
  if (remote) {
    gzipPath = `${resolvedOutput}.${process.pid}.jsonl.gz.tmp`;
    temporary = true;
    await fsp.rm(gzipPath, { force:true });
    await downloadToFile(source, gzipPath);
    if (source === DEFAULT_SOURCE_URL) {
      const digest = await sha256File(gzipPath);
      if (digest !== DEFAULT_SOURCE_SHA256) throw new Error(`Open Dictionary SHA256 mismatch: ${digest}`);
    }
  } else {
    gzipPath = path.resolve(source);
    if (!fs.existsSync(gzipPath)) throw new Error(`Open Dictionary artifact not found: ${gzipPath}`);
  }
  try {
    const result = await importJsonlGzipToSqlite(gzipPath, resolvedOutput, source);
    return { ...result, reused:false };
  } finally {
    if (temporary) await fsp.rm(gzipPath, { force:true }).catch(() => {});
  }
}

function parseArgs(argv) {
  const result = { source:DEFAULT_SOURCE_URL, outputPath:DEFAULT_OUTPUT, force:false, required:false };
  for (let i=0;i<argv.length;i+=1) {
    const arg=argv[i];
    if (arg === "--source") result.source=argv[++i];
    else if (arg === "--output") result.outputPath=argv[++i];
    else if (arg === "--force") result.force=true;
    else if (arg === "--required") result.required=true;
  }
  return result;
}

if (require.main === module) {
  const args=parseArgs(process.argv.slice(2));
  preparePhraseDictionary(args)
    .then(result => console.log(result.reused
      ? `Phrase dictionary ready: ${result.outputPath}`
      : `Phrase dictionary prepared: ${result.outputPath} (${result.count} phrases from ${result.scanned} entries)`))
    .catch(err => {
      console.error("Phrase dictionary preparation failed:", err?.message || err);
      if (args.required) process.exitCode=1;
      else console.warn("LexiFlow will keep running; unknown phrases can still use the AI fallback.");
    });
}

module.exports = {
  DEFAULT_SOURCE_URL,
  DEFAULT_SOURCE_SHA256,
  DEFAULT_OUTPUT,
  PHRASE_SCHEMA,
  isWholeExpressionIpa,
  compactEntry,
  isValidDatabase,
  importJsonlGzipToSqlite,
  preparePhraseDictionary,
};
