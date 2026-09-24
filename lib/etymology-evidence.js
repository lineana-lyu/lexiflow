"use strict";

const crypto = require("crypto");
const {
  headingForLanguage,
  languageSection,
  etymologySectionsFromLanguageSection,
  extractEtymologyRelations,
} = require("./wiktionary-structure");

const WIKTIONARY_API = "https://en.wiktionary.org/w/api.php";
const WORD_RE = /^[a-z][a-z'-]{0,63}$/i;
const LOOKUP_TERM_RE = /^-?[a-z][a-z'-]{0,63}$/i;

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeWord(value) {
  const word = clean(value).toLowerCase();
  if (!WORD_RE.test(word)) {
    const err = new Error("Etymology lookup requires one English word");
    err.code = "ETYMOLOGY_INVALID_WORD";
    throw err;
  }
  return word;
}

function normalizeLookupTerm(value) {
  const term=clean(value).toLowerCase();
  if(!LOOKUP_TERM_RE.test(term)){
    const err=new Error("Invalid Wiktionary lookup term");
    err.code="ETYMOLOGY_INVALID_LOOKUP_TERM";
    throw err;
  }
  return term;
}

function normalizeHeadword(value) {
  return clean(value)
    .replace(/:[0-9]+$/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function entryMatchesWord(entry, word) {
  const wanted = normalizeWord(word);
  const ids = [
    entry?.meta?.id,
    entry?.hwi?.hw,
    ...(Array.isArray(entry?.meta?.stems) ? entry.meta.stems : []),
  ]
    .map(normalizeHeadword)
    .filter(Boolean);
  return ids.includes(wanted);
}

function cleanMerriamText(value) {
  return clean(value)
    .replace(/{bc}/g, ": ")
    .replace(/{it}|{\/it}|{b}|{\/b}/g, "")
    .replace(/{a_link\|([^}]+)}/g, "$1")
    .replace(/{d_link\|([^|}]+)(?:\|[^}]*)?}/g, "$1")
    .replace(/{et_link\|([^|}]+)(?:\|[^}]*)?}/g, "$1")
    .replace(/{ma\}/g, "")
    .replace(/{\/ma\}/g, "")
    .replace(/{sup\}([^{}]+){\/sup}/g, "$1")
    .replace(/{inf\}([^{}]+){\/inf}/g, "$1")
    .replace(/{[^{}]*}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function collectEtymologyArrays(node, out = [], seen = new Set()) {
  if (!node || typeof node !== "object" || seen.has(node)) return out;
  seen.add(node);
  if (Array.isArray(node.et)) out.push(node.et);
  if (Array.isArray(node)) {
    for (const item of node) collectEtymologyArrays(item, out, seen);
  } else {
    for (const value of Object.values(node)) collectEtymologyArrays(value, out, seen);
  }
  return out;
}

function etymologyArrayText(value) {
  if (!Array.isArray(value)) return "";
  const parts = [];
  for (const item of value) {
    if (Array.isArray(item)) {
      const tag = clean(item[0]).toLowerCase();
      if (tag === "text" || tag === "et_snote" || tag === "et_link") {
        const text = cleanMerriamText(item.slice(1).filter(x => typeof x === "string").join(" "));
        if (text) parts.push(text);
      } else {
        const nested = cleanMerriamText(item.filter(x => typeof x === "string").slice(1).join(" "));
        if (nested) parts.push(nested);
      }
    } else if (typeof item === "string") {
      const text = cleanMerriamText(item);
      if (text) parts.push(text);
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function extractMerriamWebsterEvidence(payload, inputWord) {
  const word = normalizeWord(inputWord);
  if (!Array.isArray(payload)) return null;
  const exactEntries = payload.filter(entry => entry && typeof entry === "object" && entryMatchesWord(entry, word));
  const facts = [];
  for (const entry of exactEntries) {
    const entryId = clean(entry?.meta?.id || entry?.hwi?.hw || word);
    const etArrays = collectEtymologyArrays(entry);
    for (const et of etArrays) {
      const text = etymologyArrayText(et);
      if (!text) continue;
      const key = text.toLowerCase();
      if (facts.some(item => item.text.toLowerCase() === key)) continue;
      facts.push({ entryId, text: text.slice(0, 2400) });
    }
  }
  if (!facts.length) return null;
  return {
    id: "mw",
    provider: "merriam-webster",
    title: "Merriam-Webster Dictionary API",
    word,
    url: "https://www.dictionaryapi.com/",
    evidenceType: "dictionary_etymology",
    facts,
  };
}

function englishSection(wikitext) {
  return languageSection(wikitext, "en");
}

function etymologySections(wikitext) {
  return etymologySectionsFromLanguageSection(englishSection(wikitext));
}

function definitionFacts(section) {
  const lines=String(section || "").split(/\r?\n/);
  const facts=[];
  for(const line of lines){
    if(!/^#(?![:*#])/.test(line))continue;
    const text=cleanWikitext(line.replace(/^#\s*/,""));
    if(!text)continue;
    facts.push(text.slice(0,900));
    if(facts.length>=4)break;
  }
  return facts;
}

function simplifyTemplate(template) {
  const body = clean(template).replace(/^\{\{|\}\}$/g, "");
  const parts = body.split("|").map(clean);
  const name = (parts.shift() || "").toLowerCase();
  const positional=[];
  const named={};

  for(const part of parts){
    const eq=part.indexOf("=");
    const key=eq>0 ? clean(part.slice(0,eq)).toLowerCase() : "";
    if(key && /^[a-z][a-z0-9_-]*$/i.test(key)){
      named[key]=clean(part.slice(eq+1));
    }else{
      positional.push(part);
    }
  }

  const strategies = new Map([
    ["bor", values=>values.slice(2)],
    ["inh", values=>values.slice(2)],
    ["der", values=>values.slice(2)],
    ["lbor", values=>values.slice(2)],
    ["learned borrowing", values=>values.slice(2)],
    ["prefix", values=>values.slice(1)],
    ["suffix", values=>values.slice(1)],
    ["compound", values=>values.slice(1)],
    ["confix", values=>values.slice(1)],
    ["affix", values=>values.slice(1)],
    ["af", values=>values.slice(1)],
    ["m", values=>values.slice(1)],
    ["mention", values=>values.slice(1)],
    ["l", values=>values.slice(1)],
    ["link", values=>values.slice(1)],
    ["etyl", values=>values.slice(0,1)],
  ]);

  const selected=(strategies.get(name)?.(positional) || positional).filter(Boolean);
  const joiner=["prefix","suffix","compound","confix","affix","af"].includes(name) ? " + " : " ";
  const gloss=clean(named.t || named.gloss);
  return selected.join(joiner) + (gloss ? " ("+gloss+")" : "");
}

function cleanWikitext(value) {
  let text = String(value || "");
  for (let pass = 0; pass < 6; pass++) {
    const next = text.replace(/\{\{[^{}]{1,1000}\}\}/g, match => simplifyTemplate(match));
    if (next === text) break;
    text = next;
  }
  return text
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref\b[^>]*\/>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'{2,5}/g, "")
    .replace(/^\s*[:*#;]+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchJsonWithTimeout(url, { fetchImpl = globalThis.fetch, timeoutMs = 8000, headers = {} } = {}) {
  if (typeof fetchImpl !== "function") {
    const err = new Error("Fetch implementation unavailable");
    err.code = "ETYMOLOGY_FETCH_UNAVAILABLE";
    throw err;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 8000));
  try {
    const response = await fetchImpl(url, { headers, signal: controller.signal });
    if (!response?.ok) {
      const err = new Error(`Etymology provider HTTP ${response?.status || 0}`);
      err.code = "ETYMOLOGY_PROVIDER_HTTP";
      throw err;
    }
    return await response.json();
  } catch (err) {
    if (err?.name === "AbortError") {
      const timeout = new Error("Etymology provider timed out");
      timeout.code = "ETYMOLOGY_PROVIDER_TIMEOUT";
      throw timeout;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWiktionaryEvidence(inputWord, options = {}) {
  const word = normalizeLookupTerm(inputWord);
  const languageCode=clean(options.languageCode || "en").toLowerCase();
  const params = new URLSearchParams({
    action: "parse",
    page: word,
    prop: "wikitext",
    format: "json",
    formatversion: "2",
    redirects: "1",
    origin: "*",
  });
  const payload = await fetchJsonWithTimeout(`${WIKTIONARY_API}?${params.toString()}`, {
    ...options,
    headers: {
      "Accept": "application/json",
      "User-Agent": "LexiFlow/0.8.7 etymology",
      ...(options.headers || {}),
    },
  });
  const raw = payload?.parse?.wikitext;
  const section=languageSection(raw, languageCode);
  if(!section)return null;

  const sections = etymologySectionsFromLanguageSection(section);
  const facts = sections
    .map((rawSection, index) => ({
      entryId: sections.length > 1 ? `${word}-etymology-${index + 1}` : word,
      kind:"etymology",
      text: cleanWikitext(rawSection).slice(0, 2400),
      rawSnippet: rawSection.slice(0, 5000),
    }))
    .filter(item => item.text);

  for(const [index,text] of definitionFacts(section).entries()){
    facts.push({
      entryId:`${word}-definition-${index+1}`,
      kind:"definition",
      text,
    });
  }

  if (!facts.length) return null;
  const sourceId=clean(options.sourceId) || (languageCode==="en" ? "wiktionary" : `wiktionary:${languageCode}:${word}`);
  return {
    id: sourceId,
    provider: "wiktionary",
    title: `Wiktionary · ${headingForLanguage(languageCode)}`,
    word,
    languageCode,
    language:headingForLanguage(languageCode),
    url: `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`,
    evidenceType: "community_lexicography_etymology",
    license: "CC BY-SA / GFDL",
    facts,
    relations:extractEtymologyRelations(sections),
  };
}

function evidenceFingerprint(sources) {
  const stable = (Array.isArray(sources) ? sources : [])
    .map(source => ({
      id: clean(source.id),
      provider: clean(source.provider),
      word: clean(source.word),
      facts: (source.facts || []).map(fact => clean(fact.text)),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return crypto.createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

module.exports = {
  WIKTIONARY_API,
  normalizeWord,
  normalizeLookupTerm,
  cleanMerriamText,
  extractMerriamWebsterEvidence,
  englishSection,
  etymologySections,
  cleanWikitext,
  fetchJsonWithTimeout,
  fetchWiktionaryEvidence,
  definitionFacts,
  evidenceFingerprint,
};
