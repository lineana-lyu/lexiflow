"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const expressionQuery = require("../lib/expression-query");

const root = path.resolve(__dirname, "..");
const runtime = fs.readFileSync(path.join(root, "server-runtime.js"), "utf8");
const transport = fs.readFileSync(path.join(root, "public", "transport-fixes.js"), "utf8");
const kokoro = fs.readFileSync(path.join(root, "public", "kokoro-voice.js"), "utf8");
const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
const hydration = fs.readFileSync(path.join(root, "public", "example-hydration.js"), "utf8");
const memorize = fs.readFileSync(path.join(root, "public", "memorize-stage-v3.js"), "utf8");
const review = fs.readFileSync(path.join(root, "public", "review-session-v3.js"), "utf8");
const productUx = fs.readFileSync(path.join(root, "public", "product-ux.js"), "utf8");
const productCss = fs.readFileSync(path.join(root, "public", "product-ux.css"), "utf8");

assert.strictEqual(expressionQuery.classifyEnglishQuery("address"), "word", "single headword must remain a word query");
assert.strictEqual(expressionQuery.classifyEnglishQuery("take it for granted"), "phrase", "multiword expression must remain a whole phrase query");
assert.strictEqual(expressionQuery.classifyEnglishQuery("look forward to"), "phrase", "common expression must be treated as a phrase");
assert.strictEqual(expressionQuery.classifyEnglishQuery("I'm looking forward to seeing you."), "sentence", "punctuated English sentence must be treated as a sentence");
assert.strictEqual(expressionQuery.classifyEnglishQuery("Could you give me a hand?"), "sentence", "question sentence must not be split into dictionary words");

assert(runtime.includes('require("./lib/expression-query")')&&runtime.includes('require("./lib/phrase-dictionary")'), "server runtime must own phrase dictionary plus whole-expression fallback routing");
assert(runtime.includes("handleEnglishExpression"), "server runtime must expose whole-expression handling");
assert(!runtime.includes('result = coreLexicon.lookupExact(query.toLowerCase(), "primary"')&&runtime.includes('result = localPhraseResult(query.toLowerCase(), "primary")'), "multiword search must use the curated local phrase dictionary rather than raw Core/ECDICT phrase semantics");
const localIndex = runtime.indexOf("handleLocalDictionary(req, res, url.pathname, body)");
const expressionIndex = runtime.indexOf("handleEnglishExpression(res, body)", localIndex);
const forwardIndex = runtime.indexOf("return forward(req, res, body)", expressionIndex);
assert(localIndex >= 0 && expressionIndex > localIndex && forwardIndex > expressionIndex, "whole-expression resolution must happen after local exact lookup but before inner dictionary fallback");
assert(runtime.includes("不会把它拆成单词"), "expression failure must preserve the complete user input rather than offering split-word guesses");

assert(!transport.includes("speakPhraseContinuously"), "transport must not steal phrase playback from Kokoro");
assert(!transport.includes("shouldUseUnifiedPhraseVoice"), "transport must not classify phrase voice playback");
assert(kokoro.includes("playSystemFallback"), "system speech must only remain as an explicit fallback owned by Kokoro voice layer");
assert(kokoro.includes("LexiFlowPronunciationV3")&&kokoro.includes("audioUrl:audio,audioUrls:audios"), "all dynamic word speakers must delegate to the shared dictionary-first pronunciation bridge");
assert(app.includes("async function playDictionaryAudio")&&app.includes("for(const src of Array.from(new Set((Array.isArray(segments)?segments:[]).filter(Boolean))))")&&app.includes("return true;"), "dictionary pronunciation must stop after the first successful exact recording instead of playing every variant");

assert(runtime.includes('const localPhrase = localPhraseResult(word, mode)')&&runtime.includes('expressionQuery.resolveEnglishExpression(word)'), "direct phrase lookup must use local phrase dictionary first and AI whole-expression resolution only as fallback");
assert(runtime.includes('const local = queryKind === "phrase" ? localPhraseResult(word, "primary")')&&runtime.includes('if (local?.phonetic)'), "multiword phrases must prefer exact local whole-phrase IPA instead of a one-component ECDICT phonetic");
assert(app.includes('!/\\s/.test(qNormalized)'), "saved-card fast path must be limited to one-word English headwords so stale phrases cannot shadow whole-expression resolution");
assert(hydration.includes("composePhrasePhonetic")&&hydration.includes("if(isPhrase&&!pronunciation?.dictionaryAudio)"), "phrase lookup must show complete phrase phonetics without stitching component audio");
assert(memorize.includes("LexiFlowPronunciationV3")&&review.includes("LexiFlowPronunciationV3"), "Memorize and Review must reuse the shared dictionary-first pronunciation bridge");
assert(productUx.includes('[data-m2=\\"speak\\"]')&&productUx.includes("subtree: true"), "speaker decoration must reach nested learning surfaces");
assert(memorize.includes('saving=false;\n      if(window.LexiFlowStudySessionV3?.advanceWithinBucket?.(card.id,"memorize"))return;'), "Memorize must release its save lock before rotating to the next recall card");
assert(app.includes('api("/api/dictionary/pronunciation",{method:"POST",body:{word:value}})')&&app.includes("playDictionaryAudio"), "shared word pronunciation must actively try dictionary audio before synthesized speech when a card has no cached recording");
const speakIndex=app.indexOf('async function speak(word,audioUrl="",audioUrls=[])');
const dictionaryAttemptIndex=app.indexOf('api("/api/dictionary/pronunciation"',speakIndex);
const naturalFallbackIndex=app.indexOf('playNaturalTts(value)',dictionaryAttemptIndex);
assert(speakIndex>=0&&dictionaryAttemptIndex>speakIndex&&naturalFallbackIndex>dictionaryAttemptIndex,"word pronunciation order must remain dictionary audio -> natural synthesis -> system fallback");
assert(runtime.includes('const local = queryKind === "phrase" ? localPhraseResult(word, "primary")')&&runtime.includes('const componentOnly = queryKind === "phrase" && pronunciation?.exactMatch !== true')&&runtime.includes('wholeExpressionAudio'), "phrase pronunciation must combine exact whole-phrase IPA with exact-recording-only audio ownership");
assert(productCss.includes("width:38px!important")&&productCss.includes("flex:0 0 38px!important")&&productCss.includes("aspect-ratio:1/1!important")&&productCss.includes("border-radius:50%!important"), "all decorated speaker buttons must keep the same non-deforming canonical card-creation geometry");
console.log("Expression query V4 checks passed");
