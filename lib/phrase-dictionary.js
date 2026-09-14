"use strict";

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

let database = null;
let databasePath = "";
let openError = "";

function clean(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeHeadword(value) {
  return clean(value).toLowerCase();
}

function candidatePaths() {
  return Array.from(new Set([
    process.env.LEXIFLOW_PHRASE_DB || "",
    path.join(__dirname, "..", "resources", "phrase-dictionary.sqlite"),
    process.resourcesPath ? path.join(process.resourcesPath, "phrase-dictionary.sqlite") : "",
  ].filter(Boolean).map(value => path.resolve(value))));
}

function resolveDatabasePath() {
  for (const candidate of candidatePaths()) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return "";
}

function close() {
  try { database?.close(); } catch {}
  database = null;
  databasePath = "";
}

function getDatabase() {
  const resolved = resolveDatabasePath();
  if (!resolved) {
    openError = "Phrase dictionary database not found";
    close();
    return null;
  }
  if (database && databasePath === resolved) return database;
  close();
  try {
    database = new DatabaseSync(resolved, { readOnly: true });
    database.exec("PRAGMA query_only = ON");
    databasePath = resolved;
    openError = "";
    return database;
  } catch (err) {
    openError = String(err?.message || err || "Phrase dictionary open failed");
    close();
    return null;
  }
}

function metadata(db, key) {
  try { return db.prepare("SELECT value FROM metadata WHERE key=?").get(key)?.value || ""; } catch { return ""; }
}

function status() {
  const db = getDatabase();
  if (!db) return { available:false, path:resolveDatabasePath(), phrases:0, error:openError };
  return {
    available:true,
    path:databasePath,
    phrases:Number(metadata(db, "phrase_count") || 0),
    source:metadata(db, "source"),
    preparedAt:metadata(db, "prepared_at"),
    error:"",
  };
}

function formatPhonetic(value) {
  const raw = clean(value);
  if (!raw) return "";
  if ((raw.startsWith("/") && raw.endsWith("/")) || (raw.startsWith("[") && raw.endsWith("]"))) return raw;
  return `/${raw.replace(/^\/+|\/+$/g, "")}/`;
}

function parseSenses(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function rowToResult(row, mode = "primary", options = {}) {
  if (!row) return null;
  const senses = parseSenses(row.senses_json);
  if (!senses.length) return null;
  const safeMode = mode === "expanded" ? "expanded" : "primary";
  const chosen = safeMode === "expanded" ? senses.slice(0, 3) : senses.slice(0, 1);
  const word = clean(row.headword || row.normalized_headword).toLowerCase();
  return {
    word,
    phonetic:formatPhonetic(row.phonetic_us || row.phonetic_any),
    audioUrl:"",
    audioUrls:[],
    pronunciationSource:(row.phonetic_us || row.phonetic_any) ? "open-dictionary-wiktionary-ipa" : "",
    dictionaryExact:true,
    exactMatch:true,
    phraseCard:true,
    queryKind:"phrase",
    mode:safeMode,
    hasMore:senses.length > chosen.length,
    suggestions:[],
    aiEnriched:false,
    dictionarySource:"Open Dictionary / Wiktionary",
    localLookup:true,
    offline:true,
    sourceQuery:clean(options.sourceQuery || word),
    normalizedQuery:word,
    autoResolved:false,
    alternatives:[],
    senses:chosen.map((sense, index) => ({
      id:clean(sense.id) || `phrase-${word.replace(/[^a-z0-9]+/g, "-")}-${index + 1}`,
      pos:clean(sense.pos) || "phrase",
      meaningZh:clean(sense.meaningZh),
      exampleEn:clean(sense.exampleEn),
      exampleZh:clean(sense.exampleZh),
      commonForLearner:String(sense.priority || "core") !== "rare",
      translationConfidence:1,
      senseIntentEn:"",
      learnerExplanationZh:clean(sense.learnerExplanationZh),
      usageNoteZh:clean(sense.usageNoteZh),
      priority:clean(sense.priority) || "core",
      avoidVisualEn:[],
      source:"open-dictionary-v2",
    })),
  };
}

function lookupExact(word, mode = "primary", options = {}) {
  const db = getDatabase();
  const normalized = normalizeHeadword(word);
  if (!db || !normalized || !/\s/.test(normalized)) return null;
  try {
    const row = db.prepare(`
      SELECT normalized_headword, headword, phonetic_us, phonetic_any, senses_json
      FROM phrases
      WHERE normalized_headword=? COLLATE NOCASE
      LIMIT 1
    `).get(normalized);
    return rowToResult(row, mode, options);
  } catch (err) {
    openError = String(err?.message || err || "Phrase dictionary lookup failed");
    return null;
  }
}

module.exports = { status, close, lookupExact, rowToResult, formatPhonetic };
