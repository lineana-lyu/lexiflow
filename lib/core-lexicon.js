"use strict";

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

let database = null;
let databasePath = "";
let openError = "";

function clean(value) {
  return String(value ?? "").trim();
}

function candidatePaths() {
  return Array.from(new Set([
    process.env.LEXIFLOW_CORE_DB || "",
    path.join(__dirname, "..", "resources", "core-lexicon.sqlite"),
    process.resourcesPath ? path.join(process.resourcesPath, "core-lexicon.sqlite") : "",
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
    openError = "LexiFlow Core database not found";
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
    openError = String(err?.message || err || "LexiFlow Core open failed");
    close();
    return null;
  }
}

function metadata(db, key) {
  try { return db.prepare("SELECT value FROM metadata WHERE key=?").get(key)?.value || ""; } catch { return ""; }
}

function status() {
  const db = getDatabase();
  if (!db) return { available: false, path: resolveDatabasePath(), words: 0, senses: 0, zhAliases: 0, error: openError };
  return {
    available: true,
    path: databasePath,
    words: Number(metadata(db, "word_count") || 0),
    senses: Number(metadata(db, "sense_count") || 0),
    zhAliases: Number(metadata(db, "zh_alias_count") || 0),
    preparedAt: metadata(db, "prepared_at"),
    error: "",
  };
}

function formatPhonetic(value) {
  const raw = clean(value).replace(/^\/+|\/+$/g, "");
  return raw ? `/${raw}/` : "";
}

function senseId(word, id) {
  return `core-${String(word || "word").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${id}`;
}

function baseResult(wordRow, senses, mode, options = {}) {
  const chosen = mode === "expanded" ? senses.slice(0, 3) : senses.slice(0, 1);
  if (!chosen.length) return null;
  const started = Number(options.startedAt || Date.now());
  return {
    word: clean(wordRow.word).toLowerCase(),
    phonetic: formatPhonetic(wordRow.phonetic),
    audioUrl: clean(wordRow.audio_url),
    audioUrls: clean(wordRow.audio_url) ? [clean(wordRow.audio_url)] : [],
    pronunciationSource: clean(wordRow.audio_url) ? "wikimedia-commons" : (clean(wordRow.phonetic) ? "core-phonetic" : ""),
    dictionaryExact: true,
    exactMatch: true,
    mode,
    hasMore: senses.length > chosen.length,
    suggestions: [],
    aiEnriched: false,
    dictionarySource: "LexiFlow Core",
    localLookup: true,
    offline: true,
    sourceQuery: clean(options.sourceQuery || wordRow.word),
    normalizedQuery: clean(options.normalizedQuery),
    autoResolved: Boolean(options.autoResolved),
    alternatives: Array.isArray(options.alternatives) ? options.alternatives : [],
    coreRank: Number(wordRow.learner_rank || 0),
    lookupPath: clean(options.lookupPath || "core-en"),
    lookupMs: Math.max(0, Date.now() - started),
    senses: chosen.map(sense => ({
      id: senseId(wordRow.word, sense.id),
      pos: clean(sense.pos) || "word",
      meaningZh: clean(sense.meaning_zh),
      exampleEn: clean(sense.example_en),
      exampleZh: "",
      commonForLearner: true,
      translationConfidence: 1,
      senseIntentEn: clean(sense.definition_en),
      avoidVisualEn: [],
      source: clean(sense.source),
    })),
  };
}

function lookupExact(word, mode = "primary", options = {}) {
  const db = getDatabase();
  const normalized = clean(word).toLowerCase();
  if (!db || !normalized) return null;
  const startedAt = Date.now();
  try {
    const wordRow = db.prepare(`
      SELECT word, phonetic, audio_url, learner_rank, pos_summary, tags, collins, oxford, bnc, frq, source
      FROM words WHERE word=? COLLATE NOCASE LIMIT 1
    `).get(normalized);
    if (!wordRow) return null;
    const senses = db.prepare(`
      SELECT id, word, pos, definition_en, meaning_zh, example_en, sense_rank, source
      FROM senses WHERE word=? COLLATE NOCASE AND meaning_zh<>''
      ORDER BY sense_rank DESC, id ASC LIMIT 8
    `).all(normalized);
    return baseResult(wordRow, senses, mode === "expanded" ? "expanded" : "primary", {
      ...options,
      startedAt,
      lookupPath: options.lookupPath || "core-en",
    });
  } catch (err) {
    openError = String(err?.message || err || "LexiFlow Core lookup failed");
    return null;
  }
}

function chineseCandidates(query, limit = 5) {
  const db = getDatabase();
  const q = clean(query);
  if (!db || !q) return [];
  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 8);
  try {
    return db.prepare(`
      SELECT a.alias, a.word, a.rank, a.source, w.learner_rank
      FROM zh_aliases a
      JOIN words w ON w.word=a.word COLLATE NOCASE
      WHERE a.alias=?
      ORDER BY a.rank DESC, w.learner_rank DESC, length(a.word) ASC
      LIMIT ?
    `).all(q, safeLimit);
  } catch (err) {
    openError = String(err?.message || err || "LexiFlow Core Chinese lookup failed");
    return [];
  }
}

function chineseMeaningTokens(value) {
  return clean(value)
    .split(/[；;、，,。/（）()\s]+/)
    .map(token => token.trim())
    .filter(Boolean);
}

function chineseSenseMatchScore(sense, query) {
  const q = clean(query);
  const meaning = clean(sense?.meaning_zh);
  if (!q || !meaning) return 0;
  const tokens = chineseMeaningTokens(meaning);
  if (tokens.includes(q)) return 3000;
  if (meaning.includes(q)) return 1800;
  return 0;
}

function lookupChineseCandidate(word, query, options = {}) {
  const db = getDatabase();
  const normalized = clean(word).toLowerCase();
  const q = clean(query);
  if (!db || !normalized || !q) return null;
  try {
    const wordRow = db.prepare(`
      SELECT word, phonetic, audio_url, learner_rank, pos_summary, tags, collins, oxford, bnc, frq, source
      FROM words WHERE word=? COLLATE NOCASE LIMIT 1
    `).get(normalized);
    if (!wordRow) return null;
    const senses = db.prepare(`
      SELECT id, word, pos, definition_en, meaning_zh, example_en, sense_rank, source
      FROM senses WHERE word=? COLLATE NOCASE AND meaning_zh<>''
      ORDER BY sense_rank DESC, id ASC LIMIT 12
    `).all(normalized);
    const ordered = senses.slice().sort((a, b) => {
      const semantic = chineseSenseMatchScore(b, q) - chineseSenseMatchScore(a, q);
      if (semantic) return semantic;
      return Number(b.sense_rank || 0) - Number(a.sense_rank || 0);
    });
    const result = baseResult(wordRow, ordered, "primary", options);
    if (!result) return null;
    const chosen = ordered[0];
    result.chineseSenseMatched = chineseSenseMatchScore(chosen, q) > 0;
    if (result.senses?.[0] && result.chineseSenseMatched) {
      const original = clean(result.senses[0].meaningZh);
      if (original && original !== q) result.senses[0].glossZh = original;
      result.senses[0].meaningZh = q;
    }
    return result;
  } catch (err) {
    openError = String(err?.message || err || "LexiFlow Core Chinese sense lookup failed");
    return null;
  }
}

function lookupChinese(query) {
  const q = clean(query);
  if (!q) return null;
  const startedAt = Date.now();
  const candidates = chineseCandidates(q, 8);
  if (!candidates.length) return null;

  const resolved = candidates.map(item => {
    const result = lookupChineseCandidate(item.word, q, {
      sourceQuery: q,
      normalizedQuery: q,
      autoResolved: true,
      lookupPath: "core-zh",
    });
    if (!result) return null;
    const semanticBoost = result.chineseSenseMatched ? 520 : 0;
    return { item, result, effectiveRank: Number(item.rank || 0) + semanticBoost };
  }).filter(Boolean).sort((a, b) => b.effectiveRank - a.effectiveRank);

  if (!resolved.length) return null;
  const bestResolved = resolved[0];
  const best = bestResolved.item;
  const alternatives = resolved.slice(1, 4).map(({ item, result }) => ({
    word: clean(item.word),
    meaningZh: clean(result.senses?.[0]?.meaningZh) || q,
    source: clean(item.source),
  }));
  const result = bestResolved.result;
  result.alternatives = alternatives;
  result.lookupMs = Math.max(0, Date.now() - startedAt);
  result.chineseAliasSource = clean(best.source);
  result.chineseAliasRank = Number(best.rank || 0);
  result.localSearchConfidence = result.chineseSenseMatched
    ? (best.source === "cc-cedict" ? 0.99 : 0.94)
    : (best.source === "cc-cedict" ? 0.76 : 0.72);
  result.lookupAmbiguous = Boolean(resolved[1] && Math.abs(bestResolved.effectiveRank - resolved[1].effectiveRank) < 90);
  return result;
}

module.exports = { status, close, lookupExact, lookupChinese, chineseCandidates };
