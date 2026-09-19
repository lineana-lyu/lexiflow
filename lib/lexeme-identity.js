"use strict";

const LEXEME_SCHEMA = "lexeme-v1";

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeForm(value) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

function uniqueForms(values) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    const form = normalizeForm(value);
    if (!form || seen.has(form)) continue;
    seen.add(form);
    out.push(form);
  }
  return out;
}

function exchangeBaseForm(morphology) {
  const forms = Array.isArray(morphology?.wordForms) ? morphology.wordForms : [];
  const base = forms.find(item => String(item?.type || "") === "0" && clean(item?.form));
  return normalizeForm(base?.form || "");
}

function acceptedFormsFromEvidence({ lemma, candidateSurface, result, morphology } = {}) {
  const forms = [
    lemma,
    candidateSurface,
    result?.word,
    morphology?.word,
    ...(Array.isArray(result?.wordForms) ? result.wordForms.map(item => item?.form) : []),
    ...(Array.isArray(morphology?.wordForms) ? morphology.wordForms.map(item => item?.form) : []),
    ...(Array.isArray(result?.lexeme?.acceptedForms) ? result.lexeme.acceptedForms : []),
  ];
  return uniqueForms(forms);
}

function buildLexemeIdentity({ result, candidateSurface = "", morphology = null, source = "" } = {}) {
  if (!result) return null;
  const existingLemma = normalizeForm(result?.lexeme?.lemma);
  const morphologyBase = exchangeBaseForm(morphology);
  const resultBase = exchangeBaseForm(result);
  const resultWord = normalizeForm(result.word);
  const lemma = existingLemma || morphologyBase || resultBase || resultWord;
  if (!lemma) return null;

  return {
    schema: LEXEME_SCHEMA,
    lemma,
    candidateSurface: normalizeForm(candidateSurface || resultWord),
    acceptedForms: acceptedFormsFromEvidence({ lemma, candidateSurface, result, morphology }),
    source: clean(source || result?.lexeme?.source || result?.dictionarySource || result?.lookupPath || "dictionary"),
  };
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\return String(value || "").replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&");");
}

function containsWholeForm(text, form) {
  const source = String(text || "");
  const target = normalizeForm(form);
  if (!source || !target) return false;
  const pattern = escapeRegExp(target).replace(/\s+/g, "\\s+");
  return new RegExp("(^|[^A-Za-z])" + pattern + "(?=$|[^A-Za-z])", "i").test(source);
}

function textContainsLexeme(text, lexemeOrResult) {
  const lexeme = lexemeOrResult?.lexeme || lexemeOrResult;
  const forms = uniqueForms([
    lexeme?.lemma,
    ...(Array.isArray(lexeme?.acceptedForms) ? lexeme.acceptedForms : []),
  ]);
  return forms.some(form => containsWholeForm(text, form));
}

function attachLexemeIdentity(result, options = {}) {
  if (!result) return result;
  const lexeme = buildLexemeIdentity({ result, ...options });
  if (!lexeme) return result;
  return { ...result, word: lexeme.lemma, lexeme };
}

function sanitizeLexemeExamples(result) {
  if (!result?.lexeme || !Array.isArray(result.senses)) return result;
  let changed = false;
  const senses = result.senses.map(sense => {
    const example = clean(sense?.exampleEn);
    if (!example || textContainsLexeme(example, result.lexeme)) return sense;
    changed = true;
    return { ...sense, exampleEn: "", exampleZh: "", exampleRejectedByLexeme: true };
  });
  return changed ? { ...result, senses, examplesPending: true } : result;
}

function validateLexemeContract(result, { requireExampleMembership = true } = {}) {
  if (!result || typeof result !== "object") return false;
  const lexeme = result.lexeme;
  if (!lexeme || lexeme.schema !== LEXEME_SCHEMA) return false;
  const lemma = normalizeForm(lexeme.lemma);
  if (!lemma || normalizeForm(result.word) !== lemma) return false;
  const forms = uniqueForms(lexeme.acceptedForms);
  if (!forms.includes(lemma)) return false;

  if (requireExampleMembership) {
    const senses = Array.isArray(result.senses) ? result.senses : [];
    for (const sense of senses) {
      const example = clean(sense?.exampleEn);
      if (example && !textContainsLexeme(example, lexeme)) return false;
    }
  }
  return true;
}

function lexemeKey(value) {
  const lexeme = value?.lexeme || value;
  return normalizeForm(lexeme?.lemma || value?.word || value);
}

module.exports = {
  LEXEME_SCHEMA,
  normalizeForm,
  exchangeBaseForm,
  acceptedFormsFromEvidence,
  buildLexemeIdentity,
  attachLexemeIdentity,
  containsWholeForm,
  textContainsLexeme,
  sanitizeLexemeExamples,
  validateLexemeContract,
  lexemeKey,
};
