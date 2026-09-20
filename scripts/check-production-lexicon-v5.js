"use strict";

const assert = require("assert");
const coreLexicon = require("../lib/core-lexicon");
const ecdict = require("../lib/ecdict");
const lexemeIdentity = require("../lib/lexeme-identity");
const { trustedChineseCandidates } = require("../lib/chinese-candidate-resolver");

function clean(value) {
  return String(value ?? "").trim();
}

function printCandidates(label, candidates) {
  console.log(label);
  for (const [index, item] of candidates.slice(0, 8).entries()) {
    console.log(
      String(index + 1).padStart(2, "0"),
      item.canonicalWord,
      "surface=" + item.word,
      "score=" + Number(item.rankScore || 0).toFixed(2),
      "source=" + String(item.source || "")
    );
  }
}

try {
  const coreStatus = coreLexicon.status();
  const ecdictStatus = ecdict.status();

  assert(coreStatus.available, "PROD-00 LexiFlow Core production database must exist");
  assert(Number(coreStatus.words || 0) > 50000, "PROD-00 production Core must contain a real full-size lexicon");
  assert(ecdictStatus.available, "PROD-00 production ECDICT database must exist");
  assert(Number(ecdictStatus.entries || 0) > 500000, "PROD-00 production ECDICT must contain the full corpus");

  const medicine = trustedChineseCandidates("药膏");
  printCandidates("PROD-01 药膏 ranked candidates:", medicine);
  assert(medicine.length > 0, "PROD-01 药膏 must have trusted local candidates");
  assert(
    medicine.some(item => item.canonicalWord === "ointment"),
    "PROD-01 production data must contain ointment as a candidate for 药膏"
  );
  assert.strictEqual(
    medicine[0].canonicalWord,
    "ointment",
    "PROD-01 learner-friendly canonical ointment must outrank obscure/inflected alternatives for 药膏"
  );
  assert.strictEqual(
    medicine[0].word,
    medicine[0].canonicalWord,
    "PROD-01 top Chinese candidate must be a canonical headword, not an inflected surface"
  );

  const ointment = coreLexicon.lookupChineseWord("ointment", "药膏");
  assert(ointment, "PROD-02 production Core must resolve ointment for 药膏");
  assert(ointment.chineseSenseMatched === true, "PROD-02 ointment must have an actual 药膏 sense match");
  const ointmentMorphology = ecdict.lookupExact("ointment", "primary", { sourceQuery:"药膏", autoResolved:true });
  const ointmentLexeme = lexemeIdentity.attachLexemeIdentity(ointment, {
    candidateSurface:"ointment",
    morphology:ointmentMorphology,
    source:"production-acceptance",
  });
  const sanitizedOintment = lexemeIdentity.sanitizeLexemeExamples(ointmentLexeme);
  assert(
    lexemeIdentity.validateLexemeContract(sanitizedOintment),
    "PROD-02 selected ointment payload must satisfy the canonical lexeme contract"
  );
  const liveExample = sanitizedOintment.senses?.find(sense => clean(sense.exampleEn))?.exampleEn || "";
  if (liveExample) {
    assert(
      lexemeIdentity.textContainsLexeme(liveExample, sanitizedOintment),
      "PROD-02 any retained production example must belong to the selected ointment lexeme"
    );
  }

  const plural = ecdict.lookupExact("unguents", "primary", { sourceQuery:"药膏", autoResolved:true });
  assert(plural, "PROD-03 production ECDICT must resolve the inflected surface unguents used by the reported regression");
  assert.strictEqual(
    lexemeIdentity.exchangeBaseForm(plural),
    "unguent",
    "PROD-03 production morphology must canonicalize unguents to unguent"
  );

  const preferred = trustedChineseCandidates("药膏", "unguent");
  printCandidates("PROD-04 药膏 preferred=unguent:", preferred);
  assert.strictEqual(
    preferred[0]?.canonicalWord,
    "unguent",
    "PROD-04 explicit learner choice must override automatic commonness ranking in production data"
  );

  const response = coreLexicon.lookupChinese("应对");
  assert(response, "PROD-05 production Core must resolve 应对");
  assert.strictEqual(
    response.word,
    "address",
    "PROD-05 existing 应对 semantic-intent behavior must remain stable on the real production dictionary"
  );
  assert(response.chineseSenseMatched === true, "PROD-05 应对 must resolve through a matching semantic sense");

  console.log("Production Lexicon V5 acceptance checks passed.");
} finally {
  try { coreLexicon.close(); } catch {}
  try { ecdict.close(); } catch {}
}
