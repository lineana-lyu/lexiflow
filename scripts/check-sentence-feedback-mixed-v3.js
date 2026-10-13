"use strict";

const assert = require("node:assert/strict");
const {
  classifySentenceLanguage,
  normalizeSentenceTranslations,
  normalizeSentenceDiagnostics,
} = require("../lib/sentence-feedback-contract");

const sentence = "The teacher 宣布 students will have a quiz tommorow";
assert.equal(classifySentenceLanguage(sentence), "mixed");
assert.equal(classifySentenceLanguage("老师宣布明天考试"), "zh");
assert.equal(classifySentenceLanguage("The teacher announced a quiz."), "en");

const translations = normalizeSentenceTranslations(sentence, [
  { span: "宣布", start: 12, end: 14, translation: "announced that" },
]);
assert.deepEqual(translations, [
  { span: "宣布", start: 12, end: 14, translation: "announced that" },
]);

const diagnostics = normalizeSentenceDiagnostics({
  sentence,
  issues: [
    { span: "宣布", start: 12, end: 14, reason: "contains Chinese", replacement: "announced that", category: "meaning", severity: "error" },
    { span: "tommorow", start: 41, end: 49, reason: "misspelled", replacement: "tomorrow", category: "spelling", severity: "error" },
  ],
  spellingVerifier: () => ({ verified: true }),
});
assert.equal(diagnostics.some(item => item.span === "宣布"), false, "Chinese belongs to translations, not errors");
assert.equal(diagnostics.some(item => item.span === "tommorow"), true);
console.log("Mixed-language sentence feedback checks passed.");
