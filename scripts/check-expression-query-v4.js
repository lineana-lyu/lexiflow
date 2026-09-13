"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const expressionQuery = require("../lib/expression-query");

const root = path.resolve(__dirname, "..");
const runtime = fs.readFileSync(path.join(root, "server-runtime.js"), "utf8");
const transport = fs.readFileSync(path.join(root, "public", "transport-fixes.js"), "utf8");
const kokoro = fs.readFileSync(path.join(root, "public", "kokoro-voice.js"), "utf8");

assert.strictEqual(expressionQuery.classifyEnglishQuery("address"), "word", "single headword must remain a word query");
assert.strictEqual(expressionQuery.classifyEnglishQuery("take it for granted"), "phrase", "multiword expression must remain a whole phrase query");
assert.strictEqual(expressionQuery.classifyEnglishQuery("look forward to"), "phrase", "common expression must be treated as a phrase");
assert.strictEqual(expressionQuery.classifyEnglishQuery("I'm looking forward to seeing you."), "sentence", "punctuated English sentence must be treated as a sentence");
assert.strictEqual(expressionQuery.classifyEnglishQuery("Could you give me a hand?"), "sentence", "question sentence must not be split into dictionary words");

assert(runtime.includes('require("./lib/expression-query")'), "server runtime must own whole-expression routing");
assert(runtime.includes("handleEnglishExpression"), "server runtime must expose whole-expression handling");
assert(runtime.includes('queryKind !== "sentence"'), "sentence queries must bypass local headword-only lookup");
const localIndex = runtime.indexOf("handleLocalDictionary(req, res, url.pathname, body)");
const expressionIndex = runtime.indexOf("handleEnglishExpression(res, body)", localIndex);
const forwardIndex = runtime.indexOf("return forward(req, res, body)", expressionIndex);
assert(localIndex >= 0 && expressionIndex > localIndex && forwardIndex > expressionIndex, "whole-expression resolution must happen after local exact lookup but before inner dictionary fallback");
assert(runtime.includes("不会把它拆成单词"), "expression failure must preserve the complete user input rather than offering split-word guesses");

assert(!transport.includes("speakPhraseContinuously"), "transport must not steal phrase playback from Kokoro");
assert(!transport.includes("shouldUseUnifiedPhraseVoice"), "transport must not classify phrase voice playback");
assert(kokoro.includes("playSystemFallback"), "system speech must only remain as an explicit fallback owned by Kokoro voice layer");
assert(kokoro.includes("Component recordings for a"), "Kokoro voice layer must document whole-expression ownership over component recordings");

console.log("Expression query V4 checks passed");
