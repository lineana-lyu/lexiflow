from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]


def write(rel, text):
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def replace_once(rel, old, new, label):
    path = ROOT / rel
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise RuntimeError(f"{label}: source snippet not found")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


write("lib/phrase-dictionary.js", r'''"use strict";

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
''')

write("scripts/prepare-phrase-dictionary.js", r'''"use strict";

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

function clean(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeHeadword(value) {
  return clean(value).toLowerCase();
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
      if (!ipa) continue;
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
    return Number(db.prepare("SELECT value FROM metadata WHERE key='phrase_count'").get()?.value || 0) > 0;
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
    meta.run("schema", "lexiflow-open-dictionary-phrases-v1");
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
  compactEntry,
  isValidDatabase,
  importJsonlGzipToSqlite,
  preparePhraseDictionary,
};
''')

write("scripts/check-phrase-dictionary-v5.js", r'''"use strict";

const assert = require("assert");
const { compactEntry } = require("./prepare-phrase-dictionary");
const { rowToResult } = require("../lib/phrase-dictionary");

const compact = compactEntry({
  headword:"hang out",
  normalized_headword:"hang out",
  pos_groups:[{
    pos:"verb",
    pronunciations:[
      { ipa:"hæŋ aʊt", tags:["US"] },
      { ipa:"hæŋ aʊt", tags:["UK"] },
    ],
    meanings:[
      {
        sense_id:"s-literal",
        priority:"rare",
        short_gloss:"挂出",
        learner_explanation:"把某物悬挂在外面。",
        examples:[{text:"Hang out the flag.",translation:"把旗子挂出去。"}],
      },
      {
        sense_id:"s-common",
        priority:"core",
        short_gloss:"闲逛；一起待着",
        learner_explanation:"和朋友轻松地待在一起或消磨时间。",
        examples:[{text:"We often hang out after class.",translation:"我们下课后经常一起待着。"}],
      },
    ],
  }],
});

assert(compact, "multiword Open Dictionary entry should compact");
assert.strictEqual(compact.phoneticUs, "hæŋ aʊt", "US whole-expression IPA should be retained");
assert(/闲逛|一起待着/.test(compact.senses[0].meaningZh), "core learner sense must outrank a rare literal sense");
assert(!/挂出/.test(compact.senses[0].meaningZh), "literal component-like meaning must not become the primary learning sense when a core idiomatic sense exists");

const result = rowToResult({
  normalized_headword:compact.normalizedHeadword,
  headword:compact.headword,
  phonetic_us:compact.phoneticUs,
  phonetic_any:compact.phoneticAny,
  senses_json:JSON.stringify(compact.senses),
});
assert(result?.phraseCard && result?.dictionaryExact, "phrase result should be an exact local phrase card");
assert.strictEqual(result.phonetic, "/hæŋ aʊt/", "whole phrase IPA must be displayed as a single phrase transcription");
assert(/闲逛|一起待着/.test(result.senses[0].meaningZh), "phrase lookup must expose learner-oriented idiomatic meaning");
assert.strictEqual(result.audioUrl, "", "Open Dictionary supplies IPA/meaning, not fake component audio");
console.log("Phrase dictionary V5 checks passed");
''')

replace_once(
    "server-runtime.js",
    'const coreLexicon = require("./lib/core-lexicon");\n',
    'const coreLexicon = require("./lib/core-lexicon");\nconst phraseDictionary = require("./lib/phrase-dictionary");\n',
    "import phrase dictionary",
)

replace_once(
    "server-runtime.js",
    '''function localChineseResult(query) {\n  return coreLexicon.lookupChinese(query);\n}\n''',
    '''function localPhraseResult(phrase, mode = "primary") {\n  return phraseDictionary.lookupExact(phrase, mode, { sourceQuery:phrase });\n}\n\nfunction localChineseResult(query) {\n  return coreLexicon.lookupChinese(query);\n}\n''',
    "local phrase helper",
)

replace_once(
    "server-runtime.js",
    '''    if (queryKind === "word" && /^[A-Za-z][A-Za-z\\s'-]*$/.test(query)) {\n      result = localLookupResult(query.toLowerCase(), "primary", query);\n    }\n''',
    '''    if (queryKind === "word" && /^[A-Za-z][A-Za-z\\s'-]*$/.test(query)) {\n      result = localLookupResult(query.toLowerCase(), "primary", query);\n    } else if (queryKind === "phrase" && /^[A-Za-z][A-Za-z\\s'-]*$/.test(query)) {\n      result = localPhraseResult(query.toLowerCase(), "primary");\n    }\n''',
    "smart phrase local lookup",
)

replace_once(
    "server-runtime.js",
    '''    if (queryKind === "phrase") {\n      try {\n        const result = await expressionQuery.resolveEnglishExpression(word);\n        if (!result) return false;\n        writeJson(res, 200, { ok: true, result: { ...result, localLookup: false, expressionLookup: true, examplesPending: result.senses?.some(s => !s.exampleEn || !s.exampleZh) } });\n        console.log("LexiFlow expression dictionary lookup: " + word);\n      } catch (err) {\n        writeJson(res, 503, {\n          ok: false,\n          code: err?.code || "EXPRESSION_QUERY_UNAVAILABLE",\n          error: "完整短语暂时没有解析完成",\n          userError: {\n            code: err?.code || "EXPRESSION_QUERY_UNAVAILABLE",\n            title: "短语解析暂时不可用",\n            message: "LexiFlow 不会退回逐词字面义。请确认 AI 连接后重试。",\n          },\n        });\n      }\n      return true;\n    }\n''',
    '''    if (queryKind === "phrase") {\n      const localPhrase = localPhraseResult(word, mode);\n      if (localPhrase) {\n        writeJson(res, 200, { ok:true, result:{ ...localPhrase, examplesPending:localPhrase.senses?.some(s => !s.exampleEn || !s.exampleZh) } });\n        console.log("LexiFlow phrase dictionary lookup: " + word);\n        return true;\n      }\n      try {\n        const result = await expressionQuery.resolveEnglishExpression(word);\n        if (!result) return false;\n        writeJson(res, 200, { ok: true, result: { ...result, localLookup: false, expressionLookup: true, examplesPending: result.senses?.some(s => !s.exampleEn || !s.exampleZh) } });\n        console.log("LexiFlow expression dictionary fallback: " + word);\n      } catch (err) {\n        writeJson(res, 503, {\n          ok: false,\n          code: err?.code || "EXPRESSION_QUERY_UNAVAILABLE",\n          error: "完整短语暂时没有解析完成",\n          userError: {\n            code: err?.code || "EXPRESSION_QUERY_UNAVAILABLE",\n            title: "短语暂未收录",\n            message: "本地短语词典暂未收录这个表达，AI 补充解析也没有完成。LexiFlow 不会退回逐词字面义。",\n          },\n        });\n      }\n      return true;\n    }\n''',
    "direct phrase local first",
)

replace_once(
    "server-runtime.js",
    '''  const queryKind = expressionQuery.classifyEnglishQuery(query);\n  if (!new Set(["phrase", "sentence"]).has(queryKind)) return false;\n  try {\n''',
    '''  const queryKind = expressionQuery.classifyEnglishQuery(query);\n  if (!new Set(["phrase", "sentence"]).has(queryKind)) return false;\n  if (queryKind === "phrase") {\n    const localPhrase = localPhraseResult(query, "primary");\n    if (localPhrase) {\n      writeJson(res, 200, { ok:true, result:localPhrase });\n      console.log(`LexiFlow phrase dictionary: ${query}`);\n      return true;\n    }\n  }\n  try {\n''',
    "expression local phrase first",
)

replace_once(
    "server-runtime.js",
    '''  // Multi-word expressions must never inherit a single component's local ECDICT phonetic/audio.\n  // Whole-phrase exact dictionary audio is resolved remotely; otherwise synthesize the complete expression.\n  const local = queryKind === "phrase" ? null : localLookupResult(word, "primary", word);\n''',
    '''  // Multi-word expressions get whole-phrase IPA from the local Open Dictionary subset.\n  // Audio still prefers an exact whole-expression dictionary recording; component recordings never own phrase playback.\n  const local = queryKind === "phrase" ? localPhraseResult(word, "primary") : localLookupResult(word, "primary", word);\n''',
    "phrase pronunciation local IPA",
)

replace_once(
    "server-runtime.js",
    '''          phonetic: clean(pronunciation.phonetic) || local?.phonetic || "",\n''',
    '''          phonetic: queryKind === "phrase"\n            ? (clean(local?.phonetic) || clean(pronunciation.phonetic))\n            : (clean(pronunciation.phonetic) || clean(local?.phonetic)),\n''',
    "prefer exact phrase IPA",
)

replace_once(
    "server-runtime.js",
    '''  if (local?.phonetic && !/\\s/.test(word)) {\n''',
    '''  if (local?.phonetic) {\n''',
    "allow local phrase IPA fallback",
)

replace_once(
    "server-runtime.js",
    '''        pronunciationSource: "ecdict-phonetic",\n        exactMatch: true,\n''',
    '''        pronunciationSource: queryKind === "phrase" ? (local.pronunciationSource || "open-dictionary-wiktionary-ipa") : "ecdict-phonetic",\n        exactMatch: true,\n        wholeExpressionAudio: queryKind !== "phrase",\n''',
    "phrase pronunciation source",
)

# Update regression checks to lock the new authority order.
check_path = ROOT / "scripts/check-expression-query-v4.js"
check = check_path.read_text(encoding="utf-8")
check = check.replace(
    'const expressionQuery = require("../lib/expression-query");\n',
    'const expressionQuery = require("../lib/expression-query");\n',
)
check = check.replace(
    'assert(runtime.includes(\'require("./lib/expression-query")\'), "server runtime must own whole-expression routing");',
    'assert(runtime.includes(\'require("./lib/expression-query")\')&&runtime.includes(\'require("./lib/phrase-dictionary")\'), "server runtime must own phrase dictionary plus whole-expression fallback routing");'
)
check = check.replace(
    'assert(!runtime.includes(\'result = coreLexicon.lookupExact(query.toLowerCase(), "primary"\'), "multiword search must not short-circuit through local Core/ECDICT phrase semantics before expression resolution");',
    'assert(!runtime.includes(\'result = coreLexicon.lookupExact(query.toLowerCase(), "primary"\')&&runtime.includes(\'result = localPhraseResult(query.toLowerCase(), "primary")\'), "multiword search must use the curated local phrase dictionary rather than raw Core/ECDICT phrase semantics");'
)
check = check.replace(
    'assert(runtime.includes(\'if (queryKind === "phrase")\')&&runtime.includes(\'expressionQuery.resolveEnglishExpression(word)\'), "direct dictionary phrase lookup must use whole-expression semantics rather than raw ECDICT");',
    'assert(runtime.includes(\'const localPhrase = localPhraseResult(word, mode)\')&&runtime.includes(\'expressionQuery.resolveEnglishExpression(word)\'), "direct phrase lookup must use local phrase dictionary first and AI whole-expression resolution only as fallback");'
)
check = check.replace(
    'assert(runtime.includes(\'local?.phonetic && !/\\\\s/.test(word)\'), "multiword phrases must not display a one-component ECDICT phonetic fallback");',
    'assert(runtime.includes(\'const local = queryKind === "phrase" ? localPhraseResult(word, "primary")\')&&runtime.includes(\'if (local?.phonetic)\'), "multiword phrases must prefer exact local whole-phrase IPA instead of a one-component ECDICT phonetic");'
)
check = check.replace(
    'assert(runtime.includes(\'const local = queryKind === "phrase" ? null : localLookupResult\')&&runtime.includes(\'const componentOnly = queryKind === "phrase" && pronunciation?.exactMatch !== true\')&&runtime.includes(\'wholeExpressionAudio\'), "phrase pronunciation must reject component recordings and reserve audio ownership for exact whole-expression recordings");',
    'assert(runtime.includes(\'const local = queryKind === "phrase" ? localPhraseResult(word, "primary")\')&&runtime.includes(\'const componentOnly = queryKind === "phrase" && pronunciation?.exactMatch !== true\')&&runtime.includes(\'wholeExpressionAudio\'), "phrase pronunciation must combine exact whole-phrase IPA with exact-recording-only audio ownership");'
)
check_path.write_text(check, encoding="utf-8")

# Package integration.
pkg_path = ROOT / "package.json"
pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
pkg["scripts"]["prepare:dictionary"] = "node scripts/prepare-ecdict.js && node scripts/prepare-core-lexicon.js && node scripts/prepare-phrase-dictionary.js"
pkg["scripts"]["build:win"] = "npm run prepare:dictionary && node scripts/prepare-phrase-dictionary.js --required && electron-builder --win nsis portable --x64 --publish never"
check_cmd = pkg["scripts"]["check"]
check_cmd = check_cmd.replace("node --check lib/core-lexicon.js", "node --check lib/core-lexicon.js && node --check lib/phrase-dictionary.js")
check_cmd = check_cmd.replace("node --check scripts/prepare-core-lexicon.js", "node --check scripts/prepare-core-lexicon.js && node --check scripts/prepare-phrase-dictionary.js && node --check scripts/check-phrase-dictionary-v5.js")
check_cmd = check_cmd.replace("node scripts/check-dictionary-payload-bridge-v3.js && node scripts/check-expression-query-v4.js", "node scripts/check-dictionary-payload-bridge-v3.js && node scripts/check-phrase-dictionary-v5.js && node scripts/check-expression-query-v4.js")
pkg["scripts"]["check"] = check_cmd
resources = pkg["build"].setdefault("extraResources", [])
if not any(item.get("to") == "phrase-dictionary.sqlite" for item in resources):
    resources.append({"from":"resources/phrase-dictionary.sqlite","to":"phrase-dictionary.sqlite"})
pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# Keep generated DB out of Git.
gitignore = ROOT / ".gitignore"
gi = gitignore.read_text(encoding="utf-8")
if "resources/phrase-dictionary.sqlite" not in gi:
    gi = gi.replace("resources/core-lexicon.sqlite\n", "resources/core-lexicon.sqlite\nresources/phrase-dictionary.sqlite\n")
    gitignore.write_text(gi, encoding="utf-8")

# Attribution for the derived local phrase subset.
notice_path = ROOT / "THIRD_PARTY_NOTICES.md"
notice = notice_path.read_text(encoding="utf-8")
if "## Open Dictionary phrase subset" not in notice:
    notice += r'''

## Open Dictionary phrase subset

LexiFlow can build a compact local phrase-only SQLite database from Open
Dictionary v2.0. The upstream distribution is a learner-oriented English
Dictionary derived from English Wiktionary/Wiktextract and enriched with
Simplified-Chinese learner explanations, sense priorities, bilingual examples,
and US/UK IPA transcriptions.

- Project: `ahpxex/open-dictionary`
- Source: https://github.com/ahpxex/open-dictionary
- Release used: v2.0 `distribution.jsonl.gz`
- Upstream artifact SHA-256:
  `69af69cdc685b5dce465613d1cc8fffb598eb46714f57cf73bd6606c2ceb7e43`
- Data license: Creative Commons Attribution-ShareAlike 4.0 International
  (CC BY-SA 4.0)
- Upstream source content: English Wiktionary contributors, extracted with
  Wiktextract and transformed by the Open Dictionary pipeline.

The generated `phrase-dictionary.sqlite` is a derived subset containing only
multiword entries needed by LexiFlow. Redistributors of that data file or a
modified version must preserve attribution and comply with CC BY-SA 4.0,
including the ShareAlike requirement. This data license does not replace the
licenses of LexiFlow's separately distributed source code or runtime components.
'''
    notice_path.write_text(notice, encoding="utf-8")

print("Local learner phrase dictionary integration staged.")
