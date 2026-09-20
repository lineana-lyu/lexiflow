"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_SEED = path.join(ROOT, "data", "morphology-seed.json");
const DEFAULT_OUTPUT = path.join(ROOT, "resources", "morphology.sqlite");
const SCHEMA_VERSION = "lexiflow-morphology-v1";

function clean(value) {
  return String(value ?? "").trim();
}

function readSeed(seedPath = DEFAULT_SEED) {
  const raw = fs.readFileSync(seedPath, "utf8");
  return { raw, data: JSON.parse(raw) };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sourceKindsFor(ids, sourceMap) {
  return new Set((ids || []).map(id => sourceMap.get(id)?.kind).filter(Boolean));
}

function validateSeed(seed) {
  if (!seed || typeof seed !== "object") throw new Error("Morphology seed must be an object");
  if (seed.schema !== "lexiflow-morphology-seed-v1") throw new Error("Unsupported morphology seed schema");

  const sources = Array.isArray(seed.sources) ? seed.sources : [];
  const morphemes = Array.isArray(seed.morphemes) ? seed.morphemes : [];
  const words = Array.isArray(seed.words) ? seed.words : [];
  if (!sources.length || !morphemes.length) throw new Error("Morphology seed has no sources or morphemes");

  const sourceMap = new Map();
  for (const source of sources) {
    const id = clean(source.id);
    if (!id || sourceMap.has(id)) throw new Error(`Duplicate or empty source id: ${id}`);
    if (!clean(source.name) || !clean(source.kind) || !clean(source.url)) throw new Error(`Incomplete source: ${id}`);
    sourceMap.set(id, source);
  }

  const morphemeMap = new Map();
  for (const item of morphemes) {
    const id = clean(item.id).toLowerCase();
    if (!id || morphemeMap.has(id)) throw new Error(`Duplicate or empty morpheme id: ${id}`);
    if (!["root", "prefix", "suffix", "combining_form"].includes(clean(item.type))) {
      throw new Error(`Unsupported morpheme type for ${id}`);
    }
    if (!clean(item.meaningZh) || !clean(item.meaningEn) || !clean(item.language)) {
      throw new Error(`Incomplete morpheme semantics: ${id}`);
    }
    const narrative = clean(item.narrativeZh);
    if (narrative.length < 30 || narrative.length > 260) {
      throw new Error(`Root narrative length out of range: ${id}`);
    }
    for (const sourceId of item.sourceIds || []) {
      if (!sourceMap.has(sourceId)) throw new Error(`Unknown source ${sourceId} for morpheme ${id}`);
    }
    morphemeMap.set(id, item);
  }

  const requiredKinds = Array.isArray(seed.policy?.verifiedWordRequires)
    ? seed.policy.verifiedWordRequires
    : ["classical_dictionary", "english_etymology"];
  const wordSet = new Set();

  for (const item of words) {
    const word = clean(item.word).toLowerCase();
    if (!/^[a-z][a-z'-]*$/.test(word)) throw new Error(`Invalid morphology word: ${word}`);
    if (wordSet.has(word)) throw new Error(`Duplicate morphology word: ${word}`);
    wordSet.add(word);

    const confidence = clean(item.confidence);
    if (!["verified", "supported", "uncertain"].includes(confidence)) {
      throw new Error(`Unsupported confidence for ${word}`);
    }
    if (!["decomposition", "association"].includes(clean(item.mode))) {
      throw new Error(`Unsupported analysis mode for ${word}`);
    }

    for (const sourceId of item.sourceIds || []) {
      if (!sourceMap.has(sourceId)) throw new Error(`Unknown source ${sourceId} for word ${word}`);
    }
    for (const rootId of item.rootStoryIds || []) {
      if (!morphemeMap.has(clean(rootId).toLowerCase())) {
        throw new Error(`Unknown root story ${rootId} for word ${word}`);
      }
    }
    for (const part of item.parts || []) {
      if (part.morphemeId && !morphemeMap.has(clean(part.morphemeId).toLowerCase())) {
        throw new Error(`Unknown morpheme ${part.morphemeId} in ${word}`);
      }
      if (!clean(part.text) || !clean(part.role) || !clean(part.meaningZh)) {
        throw new Error(`Incomplete word part in ${word}`);
      }
    }

    if (confidence === "verified") {
      const kinds = sourceKindsFor(item.sourceIds, sourceMap);
      for (const kind of requiredKinds) {
        if (!kinds.has(kind)) {
          throw new Error(`Verified word ${word} is missing required source kind: ${kind}`);
        }
      }
    }
  }

  return {
    sourceCount: sources.length,
    morphemeCount: morphemes.length,
    wordCount: words.length,
  };
}

function metadata(db, key) {
  try {
    return db.prepare("SELECT value FROM metadata WHERE key=?").get(key)?.value || "";
  } catch {
    return "";
  }
}

function isValidDatabase(outputPath, expectedSeedHash = "") {
  if (!fs.existsSync(outputPath)) return false;
  let db;
  try {
    db = new DatabaseSync(outputPath, { readOnly: true });
    const schema = metadata(db, "schema");
    const words = Number(metadata(db, "word_count") || 0);
    const roots = Number(metadata(db, "morpheme_count") || 0);
    const hash = metadata(db, "seed_sha256");
    return schema === SCHEMA_VERSION && words > 0 && roots > 0 && (!expectedSeedHash || hash === expectedSeedHash);
  } catch {
    return false;
  } finally {
    try { db?.close(); } catch {}
  }
}

async function buildDatabase(seed, outputPath, seedHash) {
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.${process.pid}.tmp`;
  await fsp.rm(tempPath, { force: true });

  const db = new DatabaseSync(tempPath);
  try {
    db.exec(`
      PRAGMA journal_mode = OFF;
      PRAGMA synchronous = OFF;
      PRAGMA temp_store = MEMORY;

      CREATE TABLE sources (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        headword TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL,
        license TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE morphemes (
        id TEXT PRIMARY KEY COLLATE NOCASE,
        display TEXT NOT NULL,
        type TEXT NOT NULL,
        language TEXT NOT NULL,
        meaning_en TEXT NOT NULL,
        meaning_zh TEXT NOT NULL,
        narrative_zh TEXT NOT NULL
      );

      CREATE TABLE morpheme_sources (
        morpheme_id TEXT NOT NULL COLLATE NOCASE,
        source_id TEXT NOT NULL,
        PRIMARY KEY (morpheme_id, source_id)
      );

      CREATE TABLE word_morphology (
        word TEXT PRIMARY KEY COLLATE NOCASE,
        confidence TEXT NOT NULL,
        mode TEXT NOT NULL,
        literal_en TEXT NOT NULL DEFAULT '',
        literal_zh TEXT NOT NULL DEFAULT '',
        meaning_bridge_zh TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE word_parts (
        word TEXT NOT NULL COLLATE NOCASE,
        position INTEGER NOT NULL,
        text TEXT NOT NULL,
        role TEXT NOT NULL,
        meaning_en TEXT NOT NULL DEFAULT '',
        meaning_zh TEXT NOT NULL,
        morpheme_id TEXT COLLATE NOCASE,
        PRIMARY KEY (word, position)
      );

      CREATE TABLE word_roots (
        word TEXT NOT NULL COLLATE NOCASE,
        position INTEGER NOT NULL,
        morpheme_id TEXT NOT NULL COLLATE NOCASE,
        PRIMARY KEY (word, morpheme_id)
      );

      CREATE TABLE word_related (
        word TEXT NOT NULL COLLATE NOCASE,
        position INTEGER NOT NULL,
        related_word TEXT NOT NULL COLLATE NOCASE,
        PRIMARY KEY (word, related_word)
      );

      CREATE TABLE word_sources (
        word TEXT NOT NULL COLLATE NOCASE,
        source_id TEXT NOT NULL,
        PRIMARY KEY (word, source_id)
      );

      CREATE TABLE metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX idx_word_parts_word ON word_parts(word);
      CREATE INDEX idx_word_roots_word ON word_roots(word);
      CREATE INDEX idx_word_related_word ON word_related(word);
    `);

    const insertSource = db.prepare("INSERT INTO sources(id,kind,name,headword,url,license) VALUES (?,?,?,?,?,?)");
    const insertMorpheme = db.prepare("INSERT INTO morphemes(id,display,type,language,meaning_en,meaning_zh,narrative_zh) VALUES (?,?,?,?,?,?,?)");
    const insertMorphemeSource = db.prepare("INSERT INTO morpheme_sources(morpheme_id,source_id) VALUES (?,?)");
    const insertWord = db.prepare("INSERT INTO word_morphology(word,confidence,mode,literal_en,literal_zh,meaning_bridge_zh) VALUES (?,?,?,?,?,?)");
    const insertPart = db.prepare("INSERT INTO word_parts(word,position,text,role,meaning_en,meaning_zh,morpheme_id) VALUES (?,?,?,?,?,?,?)");
    const insertRoot = db.prepare("INSERT INTO word_roots(word,position,morpheme_id) VALUES (?,?,?)");
    const insertRelated = db.prepare("INSERT INTO word_related(word,position,related_word) VALUES (?,?,?)");
    const insertWordSource = db.prepare("INSERT INTO word_sources(word,source_id) VALUES (?,?)");
    const insertMeta = db.prepare("INSERT INTO metadata(key,value) VALUES (?,?)");

    db.exec("BEGIN");
    for (const source of seed.sources) {
      insertSource.run(source.id, source.kind, source.name, clean(source.headword), source.url, clean(source.license));
    }
    for (const item of seed.morphemes) {
      const id = clean(item.id).toLowerCase();
      insertMorpheme.run(id, item.display, item.type, item.language, item.meaningEn, item.meaningZh, item.narrativeZh);
      for (const sourceId of item.sourceIds || []) insertMorphemeSource.run(id, sourceId);
    }
    for (const item of seed.words) {
      const word = clean(item.word).toLowerCase();
      insertWord.run(word, item.confidence, item.mode, clean(item.literalEn), clean(item.literalZh), clean(item.meaningBridgeZh));
      (item.parts || []).forEach((part, index) => {
        insertPart.run(
          word,
          index,
          part.text,
          part.role,
          clean(part.meaningEn),
          part.meaningZh,
          part.morphemeId ? clean(part.morphemeId).toLowerCase() : null
        );
      });
      (item.rootStoryIds || []).forEach((rootId, index) => insertRoot.run(word, index, clean(rootId).toLowerCase()));
      (item.relatedWords || []).forEach((related, index) => insertRelated.run(word, index, clean(related).toLowerCase()));
      for (const sourceId of item.sourceIds || []) insertWordSource.run(word, sourceId);
    }

    const meta = {
      schema: SCHEMA_VERSION,
      seed_schema: seed.schema,
      seed_sha256: seedHash,
      source_count: String(seed.sources.length),
      morpheme_count: String(seed.morphemes.length),
      word_count: String(seed.words.length),
      prepared_at: new Date().toISOString(),
      narrative_policy: clean(seed.policy?.narrativeRule),
    };
    for (const [key, value] of Object.entries(meta)) insertMeta.run(key, value);
    db.exec("COMMIT; ANALYZE");
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch {}
    throw err;
  } finally {
    db.close();
  }

  await fsp.rm(outputPath, { force: true });
  await fsp.rename(tempPath, outputPath);
}

async function prepareMorphologyDatabase({ seedPath = DEFAULT_SEED, outputPath = DEFAULT_OUTPUT, force = false } = {}) {
  const resolvedSeed = path.resolve(seedPath);
  const resolvedOutput = path.resolve(outputPath);
  if (!fs.existsSync(resolvedSeed)) throw new Error(`Morphology seed not found: ${resolvedSeed}`);

  const { raw, data } = readSeed(resolvedSeed);
  const validation = validateSeed(data);
  const seedHash = sha256(raw);

  if (!force && isValidDatabase(resolvedOutput, seedHash)) {
    return { outputPath: resolvedOutput, reused: true, ...validation };
  }

  await buildDatabase(data, resolvedOutput, seedHash);
  return { outputPath: resolvedOutput, reused: false, ...validation };
}

function parseArgs(argv) {
  const result = { seedPath: DEFAULT_SEED, outputPath: DEFAULT_OUTPUT, force: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--seed") result.seedPath = argv[++i];
    else if (argv[i] === "--output") result.outputPath = argv[++i];
    else if (argv[i] === "--force") result.force = true;
  }
  return result;
}

if (require.main === module) {
  prepareMorphologyDatabase(parseArgs(process.argv.slice(2)))
    .then(result => {
      const verb = result.reused ? "ready" : "prepared";
      console.log(`Morphology database ${verb}: ${result.outputPath} (${result.morphemeCount} morphemes, ${result.wordCount} words)`);
    })
    .catch(err => {
      console.error("Morphology preparation failed:", err.message || err);
      process.exitCode = 1;
    });
}

module.exports = {
  DEFAULT_SEED,
  DEFAULT_OUTPUT,
  SCHEMA_VERSION,
  validateSeed,
  prepareMorphologyDatabase,
  isValidDatabase,
};
