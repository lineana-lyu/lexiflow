"use strict";

const assert = require("assert");
const lexeme = require("../lib/lexeme-identity");
const ranker = require("../lib/lookup-candidate-ranker");

function morphology(word, forms) {
  return { word, wordForms: forms.map(([type, form]) => ({ type, form })) };
}

function result(word, exampleEn = "", extra = {}) {
  return {
    word,
    dictionarySource: "fixture",
    senses: [{ id: "1", exampleEn, exampleZh: exampleEn ? "fixture" : "" }],
    ...extra,
  };
}

// LEX-01 plural surface -> canonical lemma.
{
  const canonical = lexeme.attachLexemeIdentity(
    result("unguents", "The doctor applied an unguent to the wound."),
    {
      candidateSurface: "unguents",
      morphology: morphology("unguents", [["0", "unguent"], ["s", "unguents"]]),
    }
  );
  assert.strictEqual(canonical.word, "unguent");
  assert.deepStrictEqual(
    new Set(canonical.lexeme.acceptedForms),
    new Set(["unguent", "unguents"])
  );
  assert(lexeme.validateLexemeContract(canonical));
}

// LEX-02 regular inflection -> lemma.
{
  const canonical = lexeme.attachLexemeIdentity(
    result("studies", "She studies English every day."),
    {
      candidateSurface: "studies",
      morphology: morphology("studies", [["0", "study"], ["3", "studies"]]),
    }
  );
  assert.strictEqual(canonical.word, "study");
  assert(lexeme.textContainsLexeme("She studies English every day.", canonical));
}

// LEX-03 irregular inflection -> lemma.
{
  const canonical = lexeme.attachLexemeIdentity(
    result("went", "She went home early."),
    {
      candidateSurface: "went",
      morphology: morphology("went", [["0", "go"], ["p", "went"]]),
    }
  );
  assert.strictEqual(canonical.word, "go");
  assert(lexeme.textContainsLexeme("She went home early.", canonical));
}

// LEX-04 whole-token identity must not match substrings.
{
  assert(lexeme.containsWholeForm("I ride home.", "ride"));
  assert(!lexeme.containsWholeForm("The bride smiled.", "ride"));
  assert(!lexeme.containsWholeForm("My ride is ready.", "i"));
}

// LEX-05 hyphenated lexemes remain whole expressions.
{
  assert(lexeme.containsWholeForm("She is my ride-or-die.", "ride-or-die"));
  assert(!lexeme.containsWholeForm("She is my ride or die.", "ride-or-die"));
}

// LEX-06 synonyms are not the same lexeme.
{
  const canonical = lexeme.attachLexemeIdentity(
    result("unguent", "The doctor applied an unguent."),
    { candidateSurface: "unguent" }
  );
  assert(!lexeme.textContainsLexeme("The doctor applied an ointment.", canonical));
}

// LEX-07 mismatched examples are removed and re-hydrated.
{
  const canonical = lexeme.attachLexemeIdentity(
    result("unguent", "The doctor applied an ointment."),
    { candidateSurface: "unguent" }
  );
  const sanitized = lexeme.sanitizeLexemeExamples(canonical);
  assert.strictEqual(sanitized.senses[0].exampleEn, "");
  assert.strictEqual(sanitized.senses[0].exampleZh, "");
  assert.strictEqual(sanitized.senses[0].exampleRejectedByLexeme, true);
  assert.strictEqual(sanitized.examplesPending, true);
}

// LEX-08 cache contracts reject inconsistent identity and bad examples.
{
  const valid = lexeme.attachLexemeIdentity(
    result("unguent", "The doctor applied an unguent."),
    { candidateSurface: "unguents", morphology: morphology("unguents", [["0", "unguent"], ["s", "unguents"]]) }
  );
  assert(lexeme.validateLexemeContract(valid));

  assert(!lexeme.validateLexemeContract({
    ...valid,
    word: "unguents",
  }));

  assert(!lexeme.validateLexemeContract({
    ...valid,
    lexeme: { ...valid.lexeme, acceptedForms: ["unguents"] },
  }));

  assert(!lexeme.validateLexemeContract({
    ...valid,
    senses: [{ id: "x", exampleEn: "The doctor applied an ointment." }],
  }));
}

// RANK-01 canonical headword beats an equally strong inflected surface.
{
  const ranked = ranker.rankChineseCandidates([
    { word: "unguents", canonicalWord: "unguent", learnerRank: 500, aliasRank: 500, source: "fixture" },
    { word: "ointment", canonicalWord: "ointment", learnerRank: 500, aliasRank: 500, source: "fixture" },
  ]);
  assert.strictEqual(ranked[0].canonicalWord, "ointment");
}

// RANK-02 learner-friendly commonness beats an obscure alternative even when
// the obscure form receives a modest AI-confidence advantage.
{
  const ranked = ranker.rankChineseCandidates([
    {
      word: "unguent",
      canonicalWord: "unguent",
      learnerRank: 80,
      aliasRank: 700,
      aiConfidence: 0.95,
      semanticMatched: true,
      source: "ai-resolver",
    },
    {
      word: "ointment",
      canonicalWord: "ointment",
      learnerRank: 500,
      aliasRank: 700,
      aiConfidence: 0.65,
      semanticMatched: true,
      source: "ecdict-reverse",
    },
  ]);
  assert.strictEqual(ranked[0].canonicalWord, "ointment");
}

// RANK-03 explicit learner choice overrides automatic ranking.
{
  const ranked = ranker.rankChineseCandidates([
    { word: "ointment", canonicalWord: "ointment", learnerRank: 700, source: "ecdict-reverse" },
    { word: "unguent", canonicalWord: "unguent", learnerRank: 50, source: "ai-resolver" },
  ], { preferredWord: "unguent" });
  assert.strictEqual(ranked[0].canonicalWord, "unguent");
}

// RANK-04 multiple sources for one lemma collapse to one canonical candidate.
{
  const ranked = ranker.rankChineseCandidates([
    { word: "unguents", canonicalWord: "unguent", learnerRank: 80, source: "ai-resolver" },
    { word: "unguent", canonicalWord: "unguent", learnerRank: 100, source: "ecdict-reverse" },
    { word: "ointment", canonicalWord: "ointment", learnerRank: 500, source: "core-lexicon" },
  ]);
  assert.strictEqual(ranked.filter(item => item.canonicalWord === "unguent").length, 1);
}

// Stable key semantics for downstream consumers.
{
  const canonical = lexeme.attachLexemeIdentity(
    result("unguents"),
    { candidateSurface: "unguents", morphology: morphology("unguents", [["0", "unguent"], ["s", "unguents"]]) }
  );
  assert.strictEqual(lexeme.lexemeKey(canonical), "unguent");
  assert.strictEqual(lexeme.lexemeKey(canonical.lexeme), "unguent");
}

console.log("Lexeme V5 regression matrix passed.");
