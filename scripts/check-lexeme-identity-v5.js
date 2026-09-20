"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const lexeme = require("../lib/lexeme-identity");
const { rankChineseCandidates } = require("../lib/lookup-candidate-ranker");

const morphology = {
  word:"unguents",
  wordForms:[
    { type:"0", form:"unguent" },
    { type:"s", form:"unguents" },
  ],
};
const raw = {
  word:"unguents",
  dictionarySource:"fixture",
  senses:[{ id:"1", exampleEn:"The doctor applied an unguent to the wound." }],
};
const canonical = lexeme.attachLexemeIdentity(raw,{ candidateSurface:"unguents", morphology });
assert.strictEqual(canonical.word,"unguent","an inflected surface must not become the learning-card identity when morphology supplies a base form");
assert.deepStrictEqual(new Set(canonical.lexeme.acceptedForms),new Set(["unguent","unguents"]),"lexeme identity must retain both lemma and attested surface forms");
assert(lexeme.textContainsLexeme("The doctor applied an unguent to the wound.",canonical),"lemma examples must belong to an inflected query lexeme");
assert(lexeme.textContainsLexeme("Several unguents were stored safely.",canonical),"inflected examples must belong to the same lexeme");
assert(!lexeme.textContainsLexeme("The doctor applied an ointment.",canonical),"semantic synonyms must not be mistaken for the same lexeme");
assert(lexeme.validateLexemeContract(canonical),"canonical lookup result must satisfy the cacheable lexeme contract");

const rejected = lexeme.sanitizeLexemeExamples({
  ...canonical,
  senses:[{ id:"1", exampleEn:"The doctor applied an ointment.", exampleZh:"医生涂了药膏。" }],
});
assert.strictEqual(rejected.senses[0].exampleEn,"","a mismatched example must be removed instead of blocking the learner with contradictory content");
assert.strictEqual(rejected.examplesPending,true,"a rejected example must return to the normal hydration path");

const ranked = rankChineseCandidates([
  { word:"unguents", canonicalWord:"unguent", learningScore:1500, source:"fixture" },
  { word:"ointment", canonicalWord:"ointment", learningScore:1500, source:"fixture" },
]);
assert.strictEqual(ranked[0].canonicalWord,"ointment","learner ranking must prefer a canonical headword over an equally scored inflected surface");
const preferred = rankChineseCandidates(ranked,{preferredWord:"unguent"});
assert.strictEqual(preferred[0].canonicalWord,"unguent","an explicit learner choice must override automatic ranking");

const root = path.resolve(__dirname,"..");
const runtime = fs.readFileSync(path.join(root,"server-runtime.js"),"utf8");
const server = fs.readFileSync(path.join(root,"server.js"),"utf8");
const app = fs.readFileSync(path.join(root,"public","app.js"),"utf8");
const candidateResolver = fs.readFileSync(path.join(root,"lib","chinese-candidate-resolver.js"),"utf8");
assert(runtime.includes('require("./lib/chinese-candidate-resolver")')&&runtime.includes("trustedChineseCandidates"),"local lookup must consume the shared Chinese candidate resolver authority");
assert(candidateResolver.includes("lexemeIdentity.exchangeBaseForm")&&candidateResolver.includes("coreEvidenceForCanonical")&&candidateResolver.includes("rankChineseCandidates"),"candidate resolver must canonicalize, hydrate Core learner evidence, and rank through shared authorities");
assert(runtime.includes("parsed.forceRefresh === true")&&runtime.includes("preferredWord:clean(parsed.preferredWord)"),"local fast lookup must honor refresh and explicit alternative semantics");
assert(server.includes('LOOKUP_CACHE_SCHEMA = "v5-lexeme-identity"')&&server.includes("validateLexemeContract"),"persistent dictionary cache must invalidate pre-lexeme results and validate new entries");
assert(!server.includes('source: "local-cache"'),"AI candidate generation must not use arbitrary historical cache rows as lexical authority");
assert(app.includes("lookupLexemeForms")&&!app.includes("function targetWordForms("),"browser example checks must consume accepted lexeme forms instead of inventing morphology heuristics");
assert(app.includes("learningExampleUsesTarget(primarySense.exampleEn,r)")&&app.includes("learningExampleUsesTarget(s.exampleEn,r)"),"render and save gates must use the complete lexeme contract");

console.log("Lexeme Identity V5 checks passed.");
