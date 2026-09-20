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
  if (!db) return { available: false, path: resolveDatabasePath(), words: 0, senses: 0, zhAliases: 0, zhSemanticEvidence: 0, error: openError };
  return {
    available: true,
    path: databasePath,
    words: Number(metadata(db, "word_count") || 0),
    senses: Number(metadata(db, "sense_count") || 0),
    zhAliases: Number(metadata(db, "zh_alias_count") || 0),
    zhSemanticEvidence: Number(metadata(db, "zh_semantic_evidence_count") || 0),
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

const CHINESE_INTENT_EXPANSIONS = Object.freeze({
  "应对": Object.freeze({
    aliases: Object.freeze(["应对", "处理", "对付"]),
    preferredWords: Object.freeze(["address", "handle", "deal", "manage", "tackle", "cope"]),
    preferredPos: "verb",
  }),
});

function chineseIntent(query) {
  const q = clean(query);
  const configured = CHINESE_INTENT_EXPANSIONS[q];
  return configured ? { query: q, ...configured } : { query: q, aliases: [q], preferredWords: [], preferredPos: "" };
}

function chineseCandidateBaseScore(item, intent = chineseIntent(item?.alias)) {
  const learner = Math.max(0, Number(item?.learner_rank || 0));
  const alias = Math.max(0, Number(item?.rank || 0));
  const source = clean(item?.source).toLowerCase();
  const tokenCount = clean(item?.word).split(/\s+/).filter(Boolean).length;
  const phrasePenalty = Math.max(0, tokenCount - 1) * 180;
  const sourceBonus = source === "ecdict" ? 260 : source === "cc-cedict" ? -260 : 0;
  // Alias ranks from different source datasets are not directly comparable.
  // Compress that signal and let learner frequency/word familiarity dominate.
  const pos = clean(item?.pos_summary).toLowerCase().split("|");
  const preferredIndex = intent.preferredWords.indexOf(clean(item?.word).toLowerCase());
  const preferredWordBonus = preferredIndex < 0 ? 0 : 3200 - preferredIndex * 220;
  const preferredPosBonus = intent.preferredPos && pos.includes(intent.preferredPos) ? 380 : 0;
  const originalAliasBonus = clean(item?.alias) === intent.query ? 120 : 0;
  return learner * 2.2 + Math.min(alias, 1000) * 0.35 + sourceBonus - phrasePenalty
    + preferredWordBonus + preferredPosBonus + originalAliasBonus;
}

function chineseCandidates(query, limit = 5) {
  const db = getDatabase();
  const q = clean(query);
  if (!db || !q) return [];
  const intent = chineseIntent(q);
  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 12);
  try {
    const placeholders = intent.aliases.map(() => "?").join(",");
    const rows = db.prepare(`
      SELECT a.alias, a.word, a.rank, a.source, w.learner_rank, w.pos_summary
      FROM zh_aliases a
      JOIN words w ON w.word=a.word COLLATE NOCASE
      WHERE a.alias IN (${placeholders})
      ORDER BY w.learner_rank DESC, a.rank DESC, length(a.word) ASC
      LIMIT ?
    `).all(...intent.aliases, Math.max(36, safeLimit * intent.aliases.length * 4));
    const seen = new Set();
    return rows
      .map(item => ({ ...item, learning_score: chineseCandidateBaseScore(item, intent) }))
      .sort((a, b) => Number(b.learning_score || 0) - Number(a.learning_score || 0))
      .filter(item => {
        const word = clean(item.word).toLowerCase();
        if (seen.has(word)) return false;
        seen.add(word);
        return true;
      })
      .slice(0, safeLimit);
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

function chineseSenseMatchScore(sense, queryOrTerms) {
  const terms = (Array.isArray(queryOrTerms) ? queryOrTerms : [queryOrTerms]).map(clean).filter(Boolean);
  const meaning = clean(sense?.meaning_zh);
  if (!terms.length || !meaning) return 0;
  const tokens = chineseMeaningTokens(meaning);
  for(let index=0;index<terms.length;index++){
    if(tokens.includes(terms[index]))return index===0?3000:2400-index*40;
  }
  for(let index=0;index<terms.length;index++){
    if(meaning.includes(terms[index]))return index===0?1800:1400-index*40;
  }
  return 0;
}

function chineseSemanticEvidence(db, word, queryOrTerms) {
  const normalized = clean(word).toLowerCase();
  const terms = (Array.isArray(queryOrTerms) ? queryOrTerms : [queryOrTerms]).map(clean).filter(Boolean);
  if (!db || !normalized || !terms.length) return null;
  try {
    const placeholders = terms.map(() => "?").join(",");
    const rows = db.prepare(`
      SELECT alias, word, definition_en, rank, source
      FROM zh_semantic_evidence
      WHERE word=? COLLATE NOCASE AND alias IN (${placeholders})
      ORDER BY rank DESC
      LIMIT 24
    `).all(normalized, ...terms);
    if (!rows.length) return null;
    const scored = rows.map(row => {
      const termIndex = terms.indexOf(clean(row.alias));
      const queryPriority = termIndex < 0 ? 0 : Math.max(0, 1000 - termIndex * 80);
      return { ...row, evidenceScore: queryPriority + Number(row.rank || 0) };
    }).sort((a, b) => b.evidenceScore - a.evidenceScore);
    return scored[0] || null;
  } catch {
    return null;
  }
}

function lookupChineseCandidate(word, query, options = {}) {
  const db = getDatabase();
  const normalized = clean(word).toLowerCase();
  const q = clean(query);
  if (!db || !normalized || !q) return null;
  const matchTerms = Array.isArray(options.matchTerms) ? options.matchTerms : [q];
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
      const semantic = chineseSenseMatchScore(b, matchTerms) - chineseSenseMatchScore(a, matchTerms);
      if (semantic) return semantic;
      return Number(b.sense_rank || 0) - Number(a.sense_rank || 0);
    });
    const result = baseResult(wordRow, ordered, "primary", options);
    if (!result) return null;
    const chosen = ordered[0];
    const senseScore = chineseSenseMatchScore(chosen, matchTerms);
    const evidence = chineseSemanticEvidence(db, normalized, matchTerms);
    result.chineseSenseMatched = senseScore > 0;
    result.chineseAliasMatched = Boolean(evidence);
    result.chineseSemanticMatched = Boolean(result.chineseSenseMatched || result.chineseAliasMatched);
    result.chineseSemanticEvidence = evidence ? {
      alias: clean(evidence.alias),
      definitionEn: clean(evidence.definition_en),
      rank: Number(evidence.rank || 0),
      source: clean(evidence.source),
      type: result.chineseSenseMatched ? "sense+alias" : "alias",
    } : (result.chineseSenseMatched ? {
      alias: q,
      definitionEn: clean(chosen?.definition_en),
      rank: senseScore,
      source: clean(chosen?.source),
      type: "sense",
    } : null);
    if (result.senses?.[0] && result.chineseSemanticMatched) {
      const original = clean(result.senses[0].meaningZh);
      if (original && original !== q) result.senses[0].glossZh = original;
      result.senses[0].meaningZh = q;
      if (result.chineseSemanticEvidence?.definitionEn) {
        result.senses[0].semanticEvidenceEn = result.chineseSemanticEvidence.definitionEn;
      }
    }
    return result;
  } catch (err) {
    openError = String(err?.message || err || "LexiFlow Core Chinese sense lookup failed");
    return null;
  }
}

function lookupChineseWord(word, query) {
  const q = clean(query);
  const normalized = clean(word).toLowerCase();
  if (!q || !normalized) return null;
  const intent = chineseIntent(q);
  return lookupChineseCandidate(normalized, q, {
    sourceQuery: q,
    normalizedQuery: q,
    autoResolved: true,
    lookupPath: "core-zh",
    matchTerms: intent.aliases,
  });
}

function lookupChinese(query) {
  const q = clean(query);
  if (!q) return null;
  const startedAt = Date.now();
  const intent = chineseIntent(q);
  const candidates = chineseCandidates(q, 12);
  if (!candidates.length) return null;

  const resolved = candidates.map(item => {
    const result = lookupChineseCandidate(item.word, q, {
      sourceQuery: q,
      normalizedQuery: q,
      autoResolved: true,
      lookupPath: "core-zh",
      matchTerms: intent.aliases,
    });
    if (!result) return null;
    const semanticBoost = result.chineseSemanticMatched ? 900 : 0;
    return { item, result, effectiveRank: chineseCandidateBaseScore(item, intent) + semanticBoost };
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
  result.chineseLearningScore = Number(bestResolved.effectiveRank || 0);
  result.localSearchConfidence = result.chineseSemanticMatched
    ? (best.source === "cc-cedict" ? 0.94 : 0.97)
    : (best.source === "cc-cedict" ? 0.72 : 0.82);
  result.lookupAmbiguous = Boolean(resolved[1] && Math.abs(bestResolved.effectiveRank - resolved[1].effectiveRank) < 120);
  return result;
}

module.exports = { status, close, lookupExact, lookupChinese, lookupChineseWord, chineseCandidates };
