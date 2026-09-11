"use strict";

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

let database = null;
let databasePath = "";
let openError = "";

const POS_MAP = new Map([
  ["n", "noun"],
  ["v", "verb"],
  ["vi", "verb"],
  ["vt", "verb"],
  ["adj", "adjective"],
  ["a", "adjective"],
  ["adv", "adverb"],
  ["ad", "adverb"],
  ["prep", "preposition"],
  ["pron", "pronoun"],
  ["conj", "conjunction"],
  ["num", "numeral"],
  ["art", "article"],
  ["int", "interjection"],
  ["aux", "auxiliary"],
]);

function candidatePaths() {
  return Array.from(new Set([
    process.env.LEXIFLOW_ECDICT_DB || "",
    path.join(__dirname, "..", "resources", "ecdict.sqlite"),
    process.resourcesPath ? path.join(process.resourcesPath, "ecdict.sqlite") : "",
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
    openError = "ECDICT database not found";
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
    openError = String(err?.message || err || "ECDICT open failed");
    close();
    return null;
  }
}

function status() {
  const db = getDatabase();
  if (!db) {
    return {
      available: false,
      path: resolveDatabasePath(),
      entries: 0,
      error: openError,
    };
  }
  try {
    const meta = db.prepare("SELECT value FROM metadata WHERE key = 'entry_count'").get();
    return {
      available: true,
      path: databasePath,
      entries: Number(meta?.value || 0),
      error: "",
    };
  } catch (err) {
    return {
      available: true,
      path: databasePath,
      entries: 0,
      error: String(err?.message || err || ""),
    };
  }
}

function normalizePhonetic(value) {
  const raw = String(value || "").trim().replace(/^\/+|\/+$/g, "");
  return raw ? `/${raw}/` : "";
}

function normalizePos(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const candidates = [];
  for (const part of raw.split(/[\s,/;|]+/)) {
    const key = part.split(":")[0].trim().toLowerCase();
    if (!key) continue;
    const mapped = POS_MAP.get(key) || key;
    if (!candidates.includes(mapped)) candidates.push(mapped);
  }
  return candidates.slice(0, 3).join(" · ");
}

function translationPos(value, index = 0) {
  const lines = String(value || "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const ordered = [lines[index], ...lines].filter(Boolean);
  for (const line of ordered) {
    const match = line.match(/^\s*(n|v|vi|vt|adj|a|adv|ad|prep|pron|conj|num|art|int|aux)\.?\s*(?=[:：\s]|$)/i);
    if (!match) continue;
    const mapped = POS_MAP.get(match[1].toLowerCase()) || match[1].toLowerCase();
    if (mapped) return mapped;
  }
  return "";
}

function resolvedPos(row, index = 0) {
  const direct = normalizePos(row?.pos);
  if (direct) return direct;
  const translated = translationPos(row?.translation, index);
  if (translated) return translated;
  return String(row?.word || "").includes(" ") ? "phrase" : "word";
}

function splitTranslation(value) {
  const raw = String(value || "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const output = [];
  for (const line of lines) {
    const cleaned = line
      .replace(/^\s*(?:n|v|vi|vt|adj|adv|prep|pron|conj|num|art|int|aux)\.?\s*/i, "")
      .replace(/^\s*[①②③④⑤⑥⑦⑧⑨⑩]\s*/, "")
      .trim();
    if (!cleaned) continue;
    const pieces = cleaned.split(/[；;]/).map(x => x.trim()).filter(Boolean);
    for (const piece of pieces) {
      if (!output.includes(piece)) output.push(piece);
      if (output.length >= 4) return output;
    }
  }
  return output;
}

function definitions(value) {
  return String(value || "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);
}

function makeSenseId(word, index) {
  return `ecdict-${String(word || "word").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index + 1}`;
}

function rowToResult(row, mode = "primary", options = {}) {
  if (!row) return null;
  const meanings = splitTranslation(row.translation);
  const defs = definitions(row.definition);
  const safeMode = mode === "expanded" ? "expanded" : "primary";
  const count = safeMode === "expanded" ? Math.min(3, Math.max(meanings.length, 1)) : 1;
  const senses = [];

  for (let index = 0; index < count; index += 1) {
    const meaning = meanings[index] || meanings[0] || "暂无中文释义";
    const definitionEn = defs[index] || defs[0] || "";
    senses.push({
      id: makeSenseId(row.word, index),
      pos: resolvedPos(row, index),
      meaningZh: meaning,
      exampleEn: "",
      exampleZh: "",
      commonForLearner: true,
      translationConfidence: 1,
      senseIntentEn: definitionEn,
      avoidVisualEn: [],
    });
  }

  return {
    word: String(row.word || "").trim().toLowerCase(),
    phonetic: normalizePhonetic(row.phonetic),
    audioUrl: "",
    audioUrls: [],
    pronunciationSource: row.phonetic ? "ecdict-phonetic" : "",
    dictionaryExact: true,
    exactMatch: true,
    mode: safeMode,
    hasMore: meanings.length > senses.length,
    suggestions: [],
    aiEnriched: false,
    dictionarySource: "ECDICT",
    offline: true,
    tags: String(row.tag || "").split(/\s+/).filter(Boolean),
    frequency: {
      bnc: Number(row.bnc || 0),
      frq: Number(row.frq || 0),
      collins: Number(row.collins || 0),
      oxford: Number(row.oxford || 0),
    },
    exchange: String(row.exchange || ""),
    sourceQuery: String(options.sourceQuery || "").trim(),
    normalizedQuery: String(options.normalizedQuery || "").trim(),
    autoResolved: Boolean(options.autoResolved),
    alternatives: Array.isArray(options.alternatives) ? options.alternatives : [],
    senses,
  };
}

function lookupExact(word, mode = "primary", options = {}) {
  const db = getDatabase();
  if (!db) return null;
  const normalized = String(word || "").trim().toLowerCase();
  if (!normalized) return null;
  try {
    const row = db.prepare(`
      SELECT word, phonetic, definition, translation, pos, collins, oxford, tag, bnc, frq, exchange
      FROM entries
      WHERE word = ? COLLATE NOCASE
      LIMIT 1
    `).get(normalized);
    return rowToResult(row, mode, options);
  } catch (err) {
    openError = String(err?.message || err || "ECDICT lookup failed");
    return null;
  }
}

function rankChineseRow(row, query) {
  const translation = String(row.translation || "");
  const q = String(query || "").trim();
  if (!q || !translation) return 0;
  let score = 0;
  const lines = translation.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const cleaned = lines.map(line => line.replace(/^\s*(?:n|v|vi|vt|adj|adv|prep|pron|conj|num|art|int|aux)\.?\s*/i, ""));
  if (cleaned.some(line => line === q)) score += 1000;
  if (cleaned.some(line => line.split(/[；;、，,]/).map(x => x.trim()).includes(q))) score += 800;
  if (translation.includes(q)) score += 400;
  if (String(row.tag || "").includes("zk")) score += 12;
  if (String(row.tag || "").includes("gk")) score += 12;
  if (String(row.tag || "").includes("cet4")) score += 10;
  if (String(row.tag || "").includes("cet6")) score += 8;
  score += Math.min(Number(row.collins || 0), 5) * 8;
  score += Number(row.oxford || 0) ? 15 : 0;
  const frq = Number(row.frq || 0);
  const bnc = Number(row.bnc || 0);
  if (frq > 0) score += Math.max(0, 30 - Math.log10(frq + 1) * 6);
  if (bnc > 0) score += Math.max(0, 20 - Math.log10(bnc + 1) * 4);
  score -= Math.min(String(row.word || "").length, 24) * 0.25;
  return score;
}

function searchChinese(query, limit = 8) {
  const db = getDatabase();
  const q = String(query || "").trim();
  if (!db || !q) return [];
  const safeLimit = Math.min(Math.max(Number(limit) || 8, 1), 20);
  try {
    const rows = db.prepare(`
      SELECT word, phonetic, definition, translation, pos, collins, oxford, tag, bnc, frq, exchange
      FROM entries
      WHERE translation LIKE ?
      LIMIT 120
    `).all(`%${q}%`);
    return rows
      .map(row => ({ row, score: rankChineseRow(row, q) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, safeLimit)
      .map(item => ({
        score: item.score,
        result: rowToResult(item.row, "primary", {
          sourceQuery: q,
          normalizedQuery: q,
          autoResolved: true,
        }),
      }));
  } catch (err) {
    openError = String(err?.message || err || "ECDICT Chinese search failed");
    return [];
  }
}

function bestChineseLookup(query) {
  const candidates = searchChinese(query, 6);
  if (!candidates.length) return null;
  const best = candidates[0];
  const alternatives = candidates.slice(1, 4).map(item => ({
    word: item.result.word,
    meaningZh: item.result.senses?.[0]?.meaningZh || String(query || ""),
  }));
  return {
    ...best.result,
    alternatives,
    localSearchScore: best.score,
  };
}

module.exports = {
  status,
  close,
  lookupExact,
  searchChinese,
  bestChineseLookup,
};