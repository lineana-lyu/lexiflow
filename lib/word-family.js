"use strict";

const wordnet = require("wordnet");
const ecdict = require("./ecdict");

const POS_ORDER = ["noun", "verb", "adjective"];
const POS_LABELS = Object.freeze({
  noun: "名词",
  verb: "动词",
  adjective: "形容词",
});
const RELATION_SYMBOLS = new Set(["+", "\\", "<"]);
const MAX_DEPTH = 2;
const MAX_VISITED = 14;
const MAX_PER_POS = 3;

let initPromise = null;
const cache = new Map();

function clean(value) {
  return String(value || "").trim();
}

function normalizeLemma(value) {
  return clean(value).toLowerCase().replace(/\s+/g, "_");
}

function displayLemma(value) {
  return clean(value).replace(/_/g, " ").toLowerCase();
}

function normalizePos(value) {
  const raw = clean(value).toLowerCase();
  if (raw === "noun") return "noun";
  if (raw === "verb") return "verb";
  if (raw === "adjective" || raw === "adjective satellite") return "adjective";
  return "";
}

function ensureReady() {
  if (!initPromise) {
    initPromise = wordnet.init().catch(err => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

function pointerIndexes(pointer) {
  const raw = clean(pointer?.sourceTargetHex).padStart(4, "0");
  if (!/^[0-9a-fA-F]{4}$/.test(raw)) return { source: 0, target: 0 };
  return {
    source: Number.parseInt(raw.slice(0, 2), 16) || 0,
    target: Number.parseInt(raw.slice(2, 4), 16) || 0,
  };
}

function sourceWordIndex(definition, lemma) {
  const words = Array.isArray(definition?.meta?.words) ? definition.meta.words : [];
  const normalized = normalizeLemma(lemma);
  return words.findIndex(item => normalizeLemma(item?.word) === normalized);
}

function pointerLemma(pointer) {
  const words = Array.isArray(pointer?.data?.meta?.words) ? pointer.data.meta.words : [];
  if (!words.length) return "";
  const { target } = pointerIndexes(pointer);
  if (target > 0 && words[target - 1]?.word) return displayLemma(words[target - 1].word);
  if (words.length === 1) return displayLemma(words[0].word);
  return "";
}

function commonness(word) {
  const hit = ecdict.lookupExact(word, "primary");
  if (!hit) return 0;
  const frequency = hit.frequency || {};
  const tags = new Set(Array.isArray(hit.tags) ? hit.tags.map(x => String(x).toLowerCase()) : []);
  let score = Number(frequency.oxford || 0) ? 180 : 0;
  score += Math.min(5, Number(frequency.collins || 0)) * 24;
  if (tags.has("cet4")) score += 80;
  if (tags.has("cet6")) score += 60;
  if (tags.has("gk")) score += 50;
  if (tags.has("zk")) score += 45;
  const frq = Number(frequency.frq || 0);
  const bnc = Number(frequency.bnc || 0);
  if (frq > 0) score += Math.max(0, 90 - Math.log10(frq + 1) * 18);
  if (bnc > 0) score += Math.max(0, 70 - Math.log10(bnc + 1) * 14);
  return score;
}

function candidateScore(candidate, sourceWord) {
  let score = candidate.depth === 0 ? 1200 : candidate.depth === 1 ? 700 : 420;
  if (candidate.word === sourceWord) score += 500;
  score += commonness(candidate.word);
  score -= Math.max(0, candidate.word.length - sourceWord.length) * 2;
  return score;
}

async function safeLookup(word) {
  try {
    return await wordnet.lookup(word);
  } catch {
    return [];
  }
}

async function lookup(word) {
  const sourceWord = clean(word).toLowerCase();
  if (!/^[a-z][a-z'-]*$/i.test(sourceWord)) return [];
  if (cache.has(sourceWord)) return cache.get(sourceWord);

  await ensureReady();

  const queue = [{ word: sourceWord, depth: 0 }];
  const visited = new Set();
  const candidates = [];

  while (queue.length && visited.size < MAX_VISITED) {
    const current = queue.shift();
    const lemma = clean(current?.word).toLowerCase();
    if (!lemma || visited.has(lemma)) continue;
    visited.add(lemma);

    const definitions = await safeLookup(lemma);
    for (const definition of definitions) {
      const pos = normalizePos(definition?.meta?.synsetType);
      const sourceIndex = sourceWordIndex(definition, lemma);
      if (pos && sourceIndex >= 0) {
        candidates.push({ word: lemma, pos, depth: current.depth });
      }

      if (current.depth >= MAX_DEPTH || sourceIndex < 0) continue;
      for (const pointer of Array.isArray(definition?.meta?.pointers) ? definition.meta.pointers : []) {
        if (!RELATION_SYMBOLS.has(clean(pointer?.pointerSymbol))) continue;
        const indexes = pointerIndexes(pointer);
        if (indexes.source > 0 && indexes.source !== sourceIndex + 1) continue;
        const related = pointerLemma(pointer);
        const relatedPos = normalizePos(pointer?.data?.meta?.synsetType);
        if (!related || !relatedPos || !/^[a-z][a-z'-]*$/i.test(related)) continue;
        candidates.push({ word: related, pos: relatedPos, depth: current.depth + 1 });
        if (!visited.has(related)) queue.push({ word: related, depth: current.depth + 1 });
      }
    }
  }

  const grouped = new Map(POS_ORDER.map(pos => [pos, new Map()]));
  for (const candidate of candidates) {
    if (!grouped.has(candidate.pos)) continue;
    const group = grouped.get(candidate.pos);
    const previous = group.get(candidate.word);
    if (!previous || candidate.depth < previous.depth) group.set(candidate.word, candidate);
  }

  const result = POS_ORDER.map(pos => {
    const items = Array.from(grouped.get(pos).values())
      .map(item => ({ ...item, score: candidateScore(item, sourceWord) }))
      .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word))
      .slice(0, MAX_PER_POS)
      .map(item => item.word);
    return items.length ? { pos, label: POS_LABELS[pos], words: items } : null;
  }).filter(Boolean);

  cache.set(sourceWord, result);
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return result;
}

module.exports = { lookup };
