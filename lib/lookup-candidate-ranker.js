"use strict";

function clean(value) { return String(value ?? "").trim(); }
function wordKey(value) { return clean(value).toLowerCase().replace(/\s+/g, " "); }

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function candidateScore(item, preferredWord = "") {
  const surface = wordKey(item?.word);
  const canonical = wordKey(item?.canonicalWord || surface);
  if (!canonical) return Number.NEGATIVE_INFINITY;
  const preferred = wordKey(preferredWord);
  const tokenCount = canonical.split(/\s+/).filter(Boolean).length;
  let score = 0;
  score += numeric(item?.learningScore);
  score += numeric(item?.learnerRank) * 2.2;
  score += Math.min(1200, numeric(item?.aliasRank)) * 0.35;
  score += Math.min(1800, numeric(item?.localSearchScore)) * 0.5;
  score += Math.max(0, Math.min(1, numeric(item?.aiConfidence))) * 500;
  if (item?.semanticMatched === true) score += 900;
  if (preferred && (surface === preferred || canonical === preferred)) score += 100000;
  if (surface && canonical && surface === canonical) score += 260;
  else if (surface && canonical) score -= 900;
  score -= Math.max(0, tokenCount - 1) * 180;
  if (String(item?.source || "").toLowerCase().includes("ecdict")) score += 120;
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

module.exports = { candidateScore, rankChineseCandidates };
