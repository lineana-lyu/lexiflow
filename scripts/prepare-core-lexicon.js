"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const readline = require("readline");
const zlib = require("zlib");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const { DatabaseSync } = require("node:sqlite");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_ECDICT_DB = path.join(ROOT, "resources", "ecdict.sqlite");
const DEFAULT_OUTPUT = path.join(ROOT, "resources", "core-lexicon.sqlite");
const SIMPLE_WIKTIONARY_URL = "https://kaikki.org/simplewiktionary/raw-wiktextract-data.jsonl.gz";
const CC_CEDICT_URL = "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz";
const SCHEMA = "lexiflow-core-v3";

const POS_MAP = new Map([
  ["n", "noun"], ["noun", "noun"], ["proper_noun", "proper noun"],
  ["v", "verb"], ["vi", "verb"], ["vt", "verb"], ["verb", "verb"],
  ["adj", "adjective"], ["a", "adjective"], ["adjective", "adjective"],
  ["adv", "adverb"], ["ad", "adverb"], ["adverb", "adverb"],
  ["prep", "preposition"], ["preposition", "preposition"],
  ["pron", "pronoun"], ["pronoun", "pronoun"],
  ["conj", "conjunction"], ["conjunction", "conjunction"],
  ["num", "numeral"], ["numeral", "numeral"],
  ["art", "article"], ["article", "article"],
  ["int", "interjection"], ["interjection", "interjection"],
  ["aux", "auxiliary"], ["auxiliary", "auxiliary"],
]);

function clean(value) {
  return String(value ?? "").trim();
}

function normalizePos(value) {
  const raw = clean(value).toLowerCase().replace(/[-\s]+/g, "_");
  return POS_MAP.get(raw) || raw.replace(/_/g, " ");
}

function normalizeNewlines(value) {
  return clean(value).replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\n");
}

function hasChinese(value) {
  return /[\u3400-\u9fff]/.test(String(value || ""));
}

function downloadToFile(url, destination) {
  return (async () => {
    const response = await fetch(url, {
      headers: {
        Accept: "application/octet-stream,*/*;q=0.8",
        "User-Agent": "LexiFlow-Core-Lexicon/0.9",
      },
    });
    if (!response.ok || !response.body) throw new Error(`download failed: ${url} HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination));
  })();
}

function isValidDatabase(filePath) {
  if (!fs.existsSync(filePath)) return false;
  let db;
  try {
    db = new DatabaseSync(filePath, { readOnly: true });
    const schema = db.prepare("SELECT value FROM metadata WHERE key='schema'").get()?.value;
    const entries = Number(db.prepare("SELECT value FROM metadata WHERE key='word_count'").get()?.value || 0);
    return schema === SCHEMA && entries > 1000;
  } catch {
    return false;
  } finally {
    try { db?.close(); } catch {}
  }
}

function parseEcdictPosWeights(value) {
  const map = new Map();
  for (const token of clean(value).split(/[\s,/;|]+/)) {
    if (!token) continue;
    const [rawPos, rawWeight] = token.split(":");
    const pos = normalizePos(rawPos);
    if (!pos) continue;
    const weight = Number(rawWeight);
    map.set(pos, Number.isFinite(weight) ? weight : Math.max(map.get(pos) || 0, 1));
  }
  return map;
}

function translationLines(value) {
  return normalizeNewlines(value).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function parseTranslationLine(line) {
  const match = String(line || "").match(/^\s*(n|v|vi|vt|adj|a|adv|ad|prep|pron|conj|num|art|int|aux)\.?\s*(?=[:：\s]|$)\s*[:：]?\s*(.*)$/i);
  if (!match) return { pos: "", text: clean(line) };
  return { pos: normalizePos(match[1]), text: clean(match[2]) };
}

function conciseChineseMeaning(translation, pos = "") {
  const lines = translationLines(translation).map(parseTranslationLine);
  const normalizedPos = normalizePos(pos);
  const ordered = [
    ...lines.filter(item => normalizedPos && item.pos === normalizedPos),
    ...lines.filter(item => !normalizedPos || item.pos !== normalizedPos),
  ];
  for (const item of ordered) {
    const pieces = item.text
      .replace(/[（(][^）)]{0,40}[）)]/g, "")
      .split(/[；;]/)
      .map(x => x.trim())
      .filter(x => x && hasChinese(x));
    if (!pieces.length) continue;
    return pieces.slice(0, 2).join("；");
  }
  return "";
}

function learnerRank(row) {
  if (!row) return 0;
  let score = 0;
  const tags = ` ${clean(row.tag).toLowerCase()} `;
  if (row.oxford) score += 320;
  score += Math.min(Number(row.collins || 0), 5) * 45;
  if (/\bcet4\b/.test(tags)) score += 130;
  if (/\bgk\b/.test(tags)) score += 120;
  if (/\bzk\b/.test(tags)) score += 115;
  if (/\bcet6\b/.test(tags)) score += 95;
  if (/\bielts\b/.test(tags)) score += 70;
  if (/\btoefl\b/.test(tags)) score += 60;
  const frq = Number(row.frq || 0);
  const bnc = Number(row.bnc || 0);
  if (frq > 0) score += Math.max(0, 120 - Math.log10(frq + 1) * 24);
  if (bnc > 0) score += Math.max(0, 90 - Math.log10(bnc + 1) * 18);
  const length = clean(row.word).length;
  score += Math.max(0, 24 - Math.min(length, 24));
  return Math.round(score * 100) / 100;
}

function chooseSound(sounds) {
  const list = Array.isArray(sounds) ? sounds : [];
  const tagged = list.slice().sort((a, b) => {
    const aTags = (Array.isArray(a?.tags) ? a.tags : []).join(" ").toLowerCase();
    const bTags = (Array.isArray(b?.tags) ? b.tags : []).join(" ").toLowerCase();
    const aUs = /general american|us|united states|american/.test(aTags) ? 1 : 0;
    const bUs = /general american|us|united states|american/.test(bTags) ? 1 : 0;
    return bUs - aUs;
  });
  let phonetic = "";
  let audioUrl = "";
  for (const sound of tagged) {
    if (!phonetic && clean(sound?.ipa)) phonetic = clean(sound.ipa);
    if (!audioUrl && clean(sound?.mp3_url)) audioUrl = clean(sound.mp3_url);
    if (!audioUrl && clean(sound?.ogg_url)) audioUrl = clean(sound.ogg_url);
    if (phonetic && audioUrl) break;
  }
  return { phonetic, audioUrl };
}

function firstGoodSense(senses) {
  for (const sense of Array.isArray(senses) ? senses : []) {
    const tags = (Array.isArray(sense?.tags) ? sense.tags : []).map(String);
    if (tags.includes("form-of") || tags.includes("no-gloss")) continue;
    const gloss = clean(Array.isArray(sense?.glosses) ? sense.glosses[0] : "");
    if (!gloss) continue;
    const examples = Array.isArray(sense?.examples) ? sense.examples : [];
    const example = examples.map(item => clean(item?.text)).find(Boolean) || "";
    return { gloss, example };
  }
  return null;
}

function ccCedictEnglishCandidate(value) {
  let text = clean(value)
    .replace(/\([^)]{0,80}\)/g, "")
    .replace(/\[[^\]]{0,80}\]/g, "")
    .replace(/^to\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!text || text.length > 56) return "";
  if (/^(cl:|classifier|surname|variant of|abbr\.|see |old variant|also written|used in)/i.test(text)) return "";
  if (/[^a-z '\-]/i.test(text)) return "";
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 4) return "";
  if (["a", "an", "the", "one's", "sb", "sth"].includes(words[0])) return "";
  return text;
}

function tokenizeChineseAliases(translation) {
  const out = [];
  for (const line of translationLines(translation)) {
    const parsed = parseTranslationLine(line);
    for (const raw of parsed.text.split(/[；;、，,]/)) {
      const alias = clean(raw)
        .replace(/[（(][^）)]{0,40}[）)]/g, "")
        .replace(/[“”"'‘’]/g, "")
        .trim();
      if (!alias || alias.length > 12 || !hasChinese(alias)) continue;
      if (/[A-Za-z0-9]/.test(alias)) continue;
      if (!out.includes(alias)) out.push(alias);
      if (out.length >= 16) return out;
    }
  }
  return out;
}

async function prepareCoreLexicon({
  ecdictPath = DEFAULT_ECDICT_DB,
  outputPath = DEFAULT_OUTPUT,
  simpleSource = SIMPLE_WIKTIONARY_URL,
  cedictSource = CC_CEDICT_URL,
  force = false,
} = {}) {
  const output = path.resolve(outputPath);
  const ecdictFile = path.resolve(ecdictPath);
  if (!force && isValidDatabase(output)) return { outputPath: output, reused: true };
  if (!fs.existsSync(ecdictFile)) throw new Error(`ECDICT database not found: ${ecdictFile}`);

  await fsp.mkdir(path.dirname(output), { recursive: true });
  const simpleGz = `${output}.${process.pid}.simple.jsonl.gz`;
  const cedictGz = `${output}.${process.pid}.cedict.gz`;
  const tempDb = `${output}.${process.pid}.tmp`;
  await Promise.all([fsp.rm(simpleGz, { force: true }), fsp.rm(cedictGz, { force: true }), fsp.rm(tempDb, { force: true })]);

  console.log("LexiFlow Core: downloading Simple English Wiktionary...");
  await downloadToFile(simpleSource, simpleGz);
  console.log("LexiFlow Core: downloading CC-CEDICT...");
  await downloadToFile(cedictSource, cedictGz);

  const ecdict = new DatabaseSync(ecdictFile, { readOnly: true });
  ecdict.exec("PRAGMA query_only = ON");
  const ecdictLookup = ecdict.prepare(`
    SELECT word, phonetic, definition, translation, pos, collins, oxford, tag, bnc, frq, exchange
    FROM entries WHERE word = ? COLLATE NOCASE LIMIT 1
  `);

  const db = new DatabaseSync(tempDb);
  db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    PRAGMA temp_store = MEMORY;
    CREATE TABLE words (
      word TEXT PRIMARY KEY COLLATE NOCASE,
      phonetic TEXT NOT NULL DEFAULT '',
      audio_url TEXT NOT NULL DEFAULT '',
      learner_rank REAL NOT NULL DEFAULT 0,
      pos_summary TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      collins INTEGER NOT NULL DEFAULT 0,
      oxford INTEGER NOT NULL DEFAULT 0,
      bnc INTEGER NOT NULL DEFAULT 0,
      frq INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'simplewiktionary'
    );
    CREATE TABLE senses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL COLLATE NOCASE,
      pos TEXT NOT NULL DEFAULT '',
      definition_en TEXT NOT NULL DEFAULT '',
      meaning_zh TEXT NOT NULL DEFAULT '',
      example_en TEXT NOT NULL DEFAULT '',
      sense_rank REAL NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'simplewiktionary',
      UNIQUE(word, pos, definition_en)
    );
    CREATE INDEX idx_senses_word_rank ON senses(word COLLATE NOCASE, sense_rank DESC);
    CREATE TABLE zh_aliases (
      alias TEXT NOT NULL,
      word TEXT NOT NULL COLLATE NOCASE,
      rank REAL NOT NULL DEFAULT 0,
      source TEXT NOT NULL,
      PRIMARY KEY(alias, word)
    );
    CREATE INDEX idx_zh_alias_rank ON zh_aliases(alias, rank DESC);
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);

  const upsertWord = db.prepare(`
    INSERT INTO words(word, phonetic, audio_url, learner_rank, pos_summary, tags, collins, oxford, bnc, frq, source)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(word) DO UPDATE SET
      phonetic=CASE WHEN words.phonetic='' THEN excluded.phonetic ELSE words.phonetic END,
      audio_url=CASE WHEN words.audio_url='' THEN excluded.audio_url ELSE words.audio_url END,
      learner_rank=MAX(words.learner_rank, excluded.learner_rank),
      pos_summary=CASE WHEN instr('|' || words.pos_summary || '|', '|' || excluded.pos_summary || '|')>0 THEN words.pos_summary ELSE trim(words.pos_summary || CASE WHEN words.pos_summary='' THEN '' ELSE '|' END || excluded.pos_summary) END,
      tags=CASE WHEN words.tags='' THEN excluded.tags ELSE words.tags END,
      collins=MAX(words.collins, excluded.collins), oxford=MAX(words.oxford, excluded.oxford),
      bnc=CASE WHEN words.bnc=0 THEN excluded.bnc WHEN excluded.bnc=0 THEN words.bnc ELSE MIN(words.bnc, excluded.bnc) END,
      frq=CASE WHEN words.frq=0 THEN excluded.frq WHEN excluded.frq=0 THEN words.frq ELSE MIN(words.frq, excluded.frq) END
  `);
  const insertSense = db.prepare(`
    INSERT OR IGNORE INTO senses(word,pos,definition_en,meaning_zh,example_en,sense_rank,source)
    VALUES(?,?,?,?,?,?,?)
  `);
  const upsertAlias = db.prepare(`
    INSERT INTO zh_aliases(alias,word,rank,source) VALUES(?,?,?,?)
    ON CONFLICT(alias,word) DO UPDATE SET rank=MAX(zh_aliases.rank,excluded.rank), source=CASE WHEN excluded.rank>=zh_aliases.rank THEN excluded.source ELSE zh_aliases.source END
  `);
  const wordExists = db.prepare("SELECT learner_rank FROM words WHERE word=? COLLATE NOCASE LIMIT 1");

  function ensureCcCandidateWord(candidate, alias, definition) {
    const normalized = clean(candidate).toLowerCase();
    if (!/^[a-z][a-z '\-]{0,55}$/i.test(normalized)) return null;
    const existing = wordExists.get(normalized);
    if (existing) return existing;

    const exactRow = ecdictLookup.get(normalized);
    if (exactRow) {
      const pos = normalizePos(clean(exactRow.pos).split(/[\s,/;|]+/)[0]?.split(":")[0]) || (normalized.includes(" ") ? "phrase" : "word");
      const meaningZh = conciseChineseMeaning(exactRow.translation, pos) || conciseChineseMeaning(exactRow.translation, "") || alias;
      const rank = learnerRank(exactRow);
      upsertWord.run(normalized, clean(exactRow.phonetic), "", rank, pos, clean(exactRow.tag), Number(exactRow.collins || 0), Number(exactRow.oxford || 0), Number(exactRow.bnc || 0), Number(exactRow.frq || 0), "cc-cedict+ecdict");
      const definitionEn = normalizeNewlines(exactRow.definition).split(/\r?\n/).map(x => x.trim()).filter(Boolean)[0] || definition;
      insertSense.run(normalized, pos, definitionEn, meaningZh, "", rank, "cc-cedict+ecdict");
      coreWords += 1;
      return wordExists.get(normalized);
    }

    const tokens = normalized.split(/\s+/).filter(Boolean);
    const tokenRanks = tokens.map(token => Number(wordExists.get(token)?.learner_rank || 0));
    const tokenRank = tokenRanks.length ? Math.max(...tokenRanks) : 0;
    const rank = Math.max(80, Math.min(520, tokenRank || 160));
    const pos = tokens.length > 1 ? "phrase" : "word";
    upsertWord.run(normalized, "", "", rank, pos, "", 0, 0, 0, 0, "cc-cedict");
    insertSense.run(normalized, pos, definition, alias, "", rank, "cc-cedict");
    coreWords += 1;
    return wordExists.get(normalized);
  }

  let wiktionaryRecords = 0;
  let coreWords = 0;
  db.exec("BEGIN");
  try {
    const input = fs.createReadStream(simpleGz).pipe(zlib.createGunzip());
    const rl = readline.createInterface({ input, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      let item;
      try { item = JSON.parse(line); } catch { continue; }
      const langCode = clean(item?.lang_code).toLowerCase();
      if (langCode && langCode !== "en") continue;
      const word = clean(item?.word).toLowerCase();
      if (!/^[a-z][a-z '\-]{0,47}$/i.test(word)) continue;
      const pos = normalizePos(item?.pos || "word") || "word";
      const primary = firstGoodSense(item?.senses);
      if (!primary) continue;

      const row = ecdictLookup.get(word);
      if (!row) continue;
      const meaningZh = conciseChineseMeaning(row.translation, pos);
      if (!meaningZh) continue;
      const sound = chooseSound(item?.sounds);
      const rank = learnerRank(row);
      const posWeights = parseEcdictPosWeights(row.pos);
      const posWeight = Number(posWeights.get(pos) || 0);
      const senseRank = rank + posWeight * 2;

      const existed = Boolean(wordExists.get(word));
      upsertWord.run(
        word,
        sound.phonetic || clean(row.phonetic),
        sound.audioUrl,
        rank,
        pos,
        clean(row.tag),
        Number(row.collins || 0), Number(row.oxford || 0), Number(row.bnc || 0), Number(row.frq || 0),
        "simplewiktionary+ecdict"
      );
      if (!existed) coreWords += 1;
      insertSense.run(word, pos, primary.gloss, meaningZh, primary.example, senseRank, "simplewiktionary+ecdict");
      wiktionaryRecords += 1;
      if (wiktionaryRecords % 5000 === 0) console.log(`LexiFlow Core: parsed ${wiktionaryRecords} dictionary records...`);
    }
    db.exec("COMMIT");
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch {}
    throw err;
  }

  // Add a high-value ECDICT fallback layer so common learner words missing from
  // Simple Wiktionary still resolve locally without putting all 770k entries on
  // the critical path.
  const commonRows = ecdict.prepare(`
    SELECT word, phonetic, definition, translation, pos, collins, oxford, tag, bnc, frq, exchange
    FROM entries
    WHERE oxford>0 OR collins>0 OR tag LIKE '%cet4%' OR tag LIKE '%cet6%' OR tag LIKE '%gk%' OR tag LIKE '%zk%'
  `).all();
  db.exec("BEGIN");
  try {
    for (const row of commonRows) {
      const word = clean(row.word).toLowerCase();
      if (!/^[a-z][a-z '\-]{0,47}$/i.test(word)) continue;
      const existed = Boolean(wordExists.get(word));
      const pos = normalizePos(clean(row.pos).split(/[\s,/;|]+/)[0]?.split(":")[0]) || (word.includes(" ") ? "phrase" : "word");
      const meaningZh = conciseChineseMeaning(row.translation, pos) || conciseChineseMeaning(row.translation, "");
      if (!meaningZh) continue;
      const rank = learnerRank(row);
      upsertWord.run(word, clean(row.phonetic), "", rank, pos, clean(row.tag), Number(row.collins || 0), Number(row.oxford || 0), Number(row.bnc || 0), Number(row.frq || 0), "ecdict-fallback");
      if (!existed) coreWords += 1;
      const definition = normalizeNewlines(row.definition).split(/\r?\n/).map(x => x.trim()).filter(Boolean)[0] || "";
      insertSense.run(word, pos, definition, meaningZh, "", rank, "ecdict-fallback");
    }
    db.exec("COMMIT");
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch {}
    throw err;
  }

  // Low-priority Chinese aliases from ECDICT. Exact aliases only; no `%term%`
  // scan is used at runtime.
  const coreList = db.prepare("SELECT word, learner_rank FROM words").all();
  db.exec("BEGIN");
  try {
    for (const item of coreList) {
      const row = ecdictLookup.get(item.word);
      if (!row) continue;
      const aliases = tokenizeChineseAliases(row.translation);
      aliases.forEach((alias, index) => upsertAlias.run(alias, item.word, 450 + Number(item.learner_rank || 0) - index * 18, "ecdict"));
    }
    db.exec("COMMIT");
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch {}
    throw err;
  }

  // CC-CEDICT is Chinese-headword-first, so it provides a much better local
  // Chinese -> English candidate order than scanning English translation text.
  let cedictRows = 0;
  db.exec("BEGIN");
  try {
    const input = fs.createReadStream(cedictGz).pipe(zlib.createGunzip());
    const rl = readline.createInterface({ input, crlfDelay: Infinity });
    for await (const raw of rl) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const match = line.match(/^(\S+)\s+(\S+)\s+\[[^\]]*\]\s+\/(.*)\/$/);
      if (!match) continue;
      const traditional = clean(match[1]);
      const simplified = clean(match[2]);
      const defs = String(match[3] || "").split("/").map(x => x.trim()).filter(Boolean);
      const aliases = traditional === simplified ? [simplified] : [simplified, traditional];
      defs.forEach((def, index) => {
        const candidate = ccCedictEnglishCandidate(def);
        if (!candidate) return;
        const hit = ensureCcCandidateWord(candidate, simplified, def);
        if (!hit) return;
        // Prefer compact learner-friendly words/phrases, but never discard the
        // primary CC-CEDICT phrase just because it is multiword.
        const phrasePenalty = Math.max(0, candidate.split(/\s+/).length - 1) * 80;
        const rank = 1800 - index * 90 + Math.min(Number(hit.learner_rank || 0), 350) - phrasePenalty;
        for (const alias of aliases) {
          if (alias && alias.length <= 16) upsertAlias.run(alias, candidate, rank, "cc-cedict");
        }
      });
      cedictRows += 1;
      if (cedictRows % 30000 === 0) console.log(`LexiFlow Core: parsed ${cedictRows} CC-CEDICT entries...`);
    }
    db.exec("COMMIT");
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch {}
    throw err;
  }

  const wordCount = Number(db.prepare("SELECT COUNT(*) AS c FROM words").get()?.c || 0);
  const senseCount = Number(db.prepare("SELECT COUNT(*) AS c FROM senses").get()?.c || 0);
  const aliasCount = Number(db.prepare("SELECT COUNT(*) AS c FROM zh_aliases").get()?.c || 0);
  const meta = db.prepare("INSERT OR REPLACE INTO metadata(key,value) VALUES(?,?)");
  meta.run("schema", SCHEMA);
  meta.run("word_count", String(wordCount));
  meta.run("sense_count", String(senseCount));
  meta.run("zh_alias_count", String(aliasCount));
  meta.run("simple_wiktionary_source", simpleSource);
  meta.run("cc_cedict_source", cedictSource);
  meta.run("prepared_at", new Date().toISOString());
  db.exec("ANALYZE");
  db.close();
  ecdict.close();

  await fsp.rm(output, { force: true });
  await fsp.rename(tempDb, output);
  await Promise.all([fsp.rm(simpleGz, { force: true }), fsp.rm(cedictGz, { force: true })]);
  console.log(`LexiFlow Core prepared: ${wordCount} words, ${senseCount} senses, ${aliasCount} Chinese aliases`);
  return { outputPath: output, reused: false, wordCount, senseCount, aliasCount };
}

function parseArgs(argv) {
  const result = { ecdictPath: DEFAULT_ECDICT_DB, outputPath: DEFAULT_OUTPUT, simpleSource: SIMPLE_WIKTIONARY_URL, cedictSource: CC_CEDICT_URL, force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--ecdict") result.ecdictPath = argv[++i];
    else if (arg === "--output") result.outputPath = argv[++i];
    else if (arg === "--simple-source") result.simpleSource = argv[++i];
    else if (arg === "--cedict-source") result.cedictSource = argv[++i];
    else if (arg === "--force") result.force = true;
  }
  return result;
}

if (require.main === module) {
  prepareCoreLexicon(parseArgs(process.argv.slice(2))).catch(err => {
    console.error("LexiFlow Core preparation failed:", err?.stack || err?.message || err);
    process.exitCode = 1;
  });
}

module.exports = { prepareCoreLexicon, isValidDatabase, DEFAULT_OUTPUT, SIMPLE_WIKTIONARY_URL, CC_CEDICT_URL, SCHEMA };
