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
  const learner = numeric(item?.learnerRank) || learnerSignal(item?.dictionaryResult || item?.fallbackResult);
  let score = 0;
  score += learner * 4;
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
function rankChineseCandidates(items, { preferredWord = "", limit = 12 } = {}) {
  const byCanonical = new Map();
  for (const raw of Array.isArray(items) ? items : []) {
    const surface = wordKey(raw?.word);
    const canonical = wordKey(raw?.canonicalWord || surface);
    if (!surface || !canonical) continue;
    const candidate = { ...raw, word: surface, canonicalWord: canonical };
    candidate.rankScore = candidateScore(candidate, preferredWord);
    const previous = byCanonical.get(canonical);
    if (!previous || candidate.rankScore > previous.rankScore) {
      byCanonical.set(canonical, candidate);
    } else {
      previous.sources = Array.from(new Set([...(previous.sources || [previous.source]).filter(Boolean), raw?.source].filter(Boolean)));
    }
  }
  return Array.from(byCanonical.values())
    .sort((a, b) => b.rankScore - a.rankScore || a.canonicalWord.localeCompare(b.canonicalWord))
    .slice(0, Math.max(1, Number(limit) || 12));
}

module.exports = { learnerSignal, candidateScore, rankChineseCandidates };
