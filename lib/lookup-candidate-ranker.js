"use strict";

function clean(value) { return String(value ?? "").trim(); }
function wordKey(value) { return clean(value).toLowerCase().replace(/\s+/g, " "); }

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function learnerSignal(result) {
  if (!result) return 0;
  const frequency = result.frequency || {};
  const tags = new Set(Array.isArray(result.tags) ? result.tags.map(value => String(value).toLowerCase()) : []);
  let score = 0;
  if (Number(frequency.oxford || 0)) score += 320;
  score += Math.min(5, Number(frequency.collins || 0)) * 45;
  if (tags.has("cet4")) score += 130;
  if (tags.has("gk")) score += 120;
  if (tags.has("zk")) score += 115;
  if (tags.has("cet6")) score += 95;
  if (tags.has("ielts")) score += 70;
  if (tags.has("toefl")) score += 60;
  const frq = Number(frequency.frq || 0);
  const bnc = Number(frequency.bnc || 0);
  if (frq > 0) score += Math.max(0, 120 - Math.log10(frq + 1) * 24);
  if (bnc > 0) score += Math.max(0, 90 - Math.log10(bnc + 1) * 18);
  return score;
}

function candidateScore(item, preferredWord = "") {
  const surface = wordKey(item?.word);
  const canonical = wordKey(item?.canonicalWord || surface);
  if (!canonical) return Number.NEGATIVE_INFINITY;
  const preferred = wordKey(preferredWord);
  const tokenCount = canonical.split(/\s+/).filter(Boolean).length;
  const learner = numeric(item?.learnerRank) || learnerSignal(item?.dictionaryResult || item?.fallbackResult || item?.morphology);
  let score = 0;
  score += learner * 4;
  score += Math.min(7000, numeric(item?.learningScore)) * 0.8;
  score += Math.min(1200, numeric(item?.aliasRank)) * 0.25;
  score += Math.min(1800, numeric(item?.localSearchScore)) * 0.55;
  score += Math.max(0, Math.min(1, numeric(item?.aiConfidence))) * 500;
  if (item?.semanticMatched === true) score += 900;
  if (preferred && (surface === preferred || canonical === preferred)) score += 100000;
  if (surface && canonical && surface === canonical) score += 300;
  else if (surface && canonical) score -= 1200;
  score -= Math.max(0, tokenCount - 1) * 180;
  const source = String(item?.source || "").toLowerCase();
  if (source.includes("ecdict")) score += 120;
  if (source.includes("cc-cedict")) score -= 120;
  return score;
}
function mergeCanonicalEvidence(previous, candidate) {
  if (!previous) {
    return {
      ...candidate,
      sources:Array.from(new Set([candidate.source].filter(Boolean))),
    };
  }
  const previousCanonicalSurface = previous.word === previous.canonicalWord;
  const candidateCanonicalSurface = candidate.word === candidate.canonicalWord;
  const preferredSurface = candidateCanonicalSurface && !previousCanonicalSurface ? candidate.word : previous.word;
  const preferredDictionary = candidate.coreEvidence && !previous.coreEvidence
    ? candidate.dictionaryResult
    : (previous.dictionaryResult || candidate.dictionaryResult);
  return {
    ...previous,
    word:preferredSurface,
    learnerRank:Math.max(numeric(previous.learnerRank), numeric(candidate.learnerRank)),
    learningScore:Math.max(numeric(previous.learningScore), numeric(candidate.learningScore)),
    aliasRank:Math.max(numeric(previous.aliasRank), numeric(candidate.aliasRank)),
    localSearchScore:Math.max(numeric(previous.localSearchScore), numeric(candidate.localSearchScore)),
    aiConfidence:Math.max(numeric(previous.aiConfidence), numeric(candidate.aiConfidence)),
    semanticMatched:previous.semanticMatched === true || candidate.semanticMatched === true,
    coreEvidence:previous.coreEvidence === true || candidate.coreEvidence === true,
    dictionaryResult:preferredDictionary,
    fallbackResult:previous.fallbackResult || candidate.fallbackResult,
    morphology:previous.morphology || candidate.morphology,
    sources:Array.from(new Set([
      ...(previous.sources || [previous.source]).filter(Boolean),
      candidate.source,
      ...(candidate.sources || []),
    ].filter(Boolean))),
  };
}

function rankChineseCandidates(items, { preferredWord = "", limit = 12 } = {}) {
  const byCanonical = new Map();
  for (const raw of Array.isArray(items) ? items : []) {
    const surface = wordKey(raw?.word);
    const canonical = wordKey(raw?.canonicalWord || surface);
    if (!surface || !canonical) continue;
    const candidate = { ...raw, word: surface, canonicalWord: canonical };
    byCanonical.set(canonical, mergeCanonicalEvidence(byCanonical.get(canonical), candidate));
  }
  return Array.from(byCanonical.values())
    .map(candidate => ({ ...candidate, rankScore:candidateScore(candidate, preferredWord) }))
    .sort((a, b) => b.rankScore - a.rankScore || a.canonicalWord.localeCompare(b.canonicalWord))
    .slice(0, Math.max(1, Number(limit) || 12));
}

module.exports = { learnerSignal, candidateScore, mergeCanonicalEvidence, rankChineseCandidates };
