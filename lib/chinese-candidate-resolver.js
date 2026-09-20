"use strict";

const coreLexicon = require("./core-lexicon");
const ecdict = require("./ecdict");
const lexemeIdentity = require("./lexeme-identity");
const { rankChineseCandidates } = require("./lookup-candidate-ranker");

function clean(value) {
  return String(value ?? "").trim();
}

function canonicalCandidate(surface, sourceQuery = "") {
  const word = clean(surface).toLowerCase();
  if (!word) return { word:"", canonicalWord:"", morphology:null };
  const morphology = /\s/.test(word)
    ? null
    : ecdict.lookupExact(word, "primary", { sourceQuery, autoResolved:Boolean(sourceQuery) });
  return {
    word,
    canonicalWord: lexemeIdentity.exchangeBaseForm(morphology) || word,
    morphology,
  };
}

function coreEvidenceForCanonical(canonicalWord, query = "") {
  const canonical = clean(canonicalWord).toLowerCase();
  const q = clean(query);
  if (!canonical) return null;
  if (q) return coreLexicon.lookupChineseWord(canonical, q);
  return coreLexicon.lookupExact(canonical, "primary", {
    sourceQuery:q,
    normalizedQuery:q,
    autoResolved:false,
    lookupPath:"candidate-evidence",
  });
}

function trustedChineseCandidates(query, preferredWord = "") {
  const q = clean(query);
  const core = coreLexicon.chineseCandidates(q, 12).map(item => {
    const identity = canonicalCandidate(item.word, q);
    const evidence = coreEvidenceForCanonical(identity.canonicalWord, q);
    return {
      ...item,
      ...identity,
      learnerRank:Number(evidence?.coreRank || item.learner_rank || 0),
      learningScore:Number(item.learning_score || 0),
      aliasRank:Number(item.rank || 0),
      dictionaryResult:evidence || null,
      coreEvidence:Boolean(evidence),
      semanticMatched:evidence?.chineseSemanticMatched === true,
      source:item.source || "core-lexicon",
    };
  });

  const local = ecdict.searchChinese(q, 8).map(item => {
    const identity = canonicalCandidate(item?.result?.word, q);
    const evidence = coreEvidenceForCanonical(identity.canonicalWord, q);
    return {
      ...identity,
      localSearchScore:Number(item.score || 0),
      learnerRank:Number(evidence?.coreRank || 0),
      dictionaryResult:evidence || item.result || null,
      fallbackResult:item.result,
      coreEvidence:Boolean(evidence),
      semanticMatched:evidence?.chineseSemanticMatched === true,
      source:"ecdict-reverse",
    };
  });

  const preferred = clean(preferredWord).toLowerCase();
  if (preferred && ![...core, ...local].some(item => item.word === preferred || item.canonicalWord === preferred)) {
    const identity = canonicalCandidate(preferred, q);
    const evidence = coreEvidenceForCanonical(identity.canonicalWord, q);
    core.push({
      ...identity,
      learnerRank:Number(evidence?.coreRank || 0),
      dictionaryResult:evidence || null,
      coreEvidence:Boolean(evidence),
      semanticMatched:evidence?.chineseSemanticMatched === true,
      source:"explicit-user-choice",
    });
  }

  return rankChineseCandidates([...core, ...local], {
    preferredWord:preferred,
    limit:12,
  });
}

module.exports = {
  canonicalCandidate,
  coreEvidenceForCanonical,
  trustedChineseCandidates,
};
