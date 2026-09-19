"use strict";

const coreLexicon = require("./core-lexicon");
const ecdict = require("./ecdict");

function normalizeWord(value) {
  return String(value || "").trim().toLowerCase().replace(/[’]/g, "'");
}

function singleEnglishWord(value) {
  const word = normalizeWord(value);
  return /^[a-z]+(?:['-][a-z]+)*$/.test(word) ? word : "";
}

function inflectionBases(word) {
  const value = normalizeWord(word);
  const forms = new Set([value]);
  if (value.length > 3 && value.endsWith("ies")) forms.add(value.slice(0, -3) + "y");
  if (value.length > 3 && value.endsWith("es")) {
    forms.add(value.slice(0, -2));
    forms.add(value.slice(0, -1));
  }
  if (value.length > 2 && value.endsWith("s")) forms.add(value.slice(0, -1));
  if (value.length > 4 && value.endsWith("ied")) forms.add(value.slice(0, -3) + "y");
  if (value.length > 3 && value.endsWith("ed")) {
    forms.add(value.slice(0, -2));
    forms.add(value.slice(0, -1));
  }
  if (value.length > 4 && value.endsWith("ing")) {
    forms.add(value.slice(0, -3));
    forms.add(value.slice(0, -3) + "e");
  }
  return [...forms].filter(Boolean);
}

function localWordKnown(word) {
  const value = singleEnglishWord(word);
  if (!value) return false;
  for (const candidate of inflectionBases(value)) {
    try {
      if (coreLexicon.lookupExact(candidate, "primary")) return true;
    } catch {}
    try {
      if (ecdict.lookupExact(candidate, "primary")) return true;
    } catch {}
  }
  return false;
}

function levenshtein(a, b) {
  const left = normalizeWord(a);
  const right = normalizeWord(b);
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const stored = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
      previous = stored;
    }
  }
  return row[right.length];
}

function verifySpellingCorrection({ span, replacement, lookupWord = localWordKnown } = {}) {
  const from = singleEnglishWord(span);
  const to = singleEnglishWord(replacement);
  if (!from || !to || from === to) return { verified: false, reason: "not-single-word-edit" };

  const originalKnown = Boolean(lookupWord(from));
  const replacementKnown = Boolean(lookupWord(to));
  if (originalKnown || !replacementKnown) {
    return { verified: false, reason: originalKnown ? "original-is-known" : "replacement-not-known" };
  }

  const distance = levenshtein(from, to);
  const maxDistance = from.length <= 4 ? 1 : 2;
  if (distance > maxDistance) return { verified: false, reason: "edit-distance-too-large", distance };

  return { verified: true, reason: "local-lexicon-confirmed", distance };
}

module.exports = {
  normalizeWord,
  singleEnglishWord,
  inflectionBases,
  localWordKnown,
  levenshtein,
  verifySpellingCorrection,
};
