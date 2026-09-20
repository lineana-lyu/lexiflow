"use strict";

const authority = require("../lib/morpheme-authority");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const tract = authority.findByTeachingForm("TRACT");
assert(tract.length === 1, "TRACT must resolve to exactly one authority record");
assert(tract[0].sourceLemma === "traho", "TRACT must resolve back to Latin traho");
assert(tract[0].sourceForms.includes("tractum"), "TRACT must retain the attested Latin tractum form");

const tractEvidence = authority.evidenceFor("lat-tract");
assert(tractEvidence?.sources?.some(source => source.sourceType === "historical_lexicon"), "TRACT needs lexicon evidence");
assert(tractEvidence?.sources?.some(source => source.sourceType === "historical_grammar"), "TRACT form relation needs grammar evidence");

const inPrefix = authority.findByTeachingForm("IN-", { kind:"prefix" });
assert(inPrefix.length === 2, "IN- must remain split into locative and negative morphemes");
assert(new Set(inPrefix.map(item => item.id)).has("lat-in-locative"), "Locative IN- is missing");
assert(new Set(inPrefix.map(item => item.id)).has("lat-in-negative"), "Negative IN- is missing");

const cap = authority.getById("lat-cap");
assert(cap?.teachingForms?.includes("CAPT"), "CAP family must expose attested CAPT teaching form");
assert(!cap?.teachingForms?.includes("CEPT"), "CEPT must not be asserted by the Latin authority layer without the separate Romance/English derivation layer");

const ad = authority.getById("lat-ad");
assert(ad?.variants?.some(item => item.form === "at-"), "AD- assimilation must include attested at-");
assert(ad?.claimSources?.variants?.includes("ag-phonetic"), "AD- variants must cite the grammar source");

for (const item of [
  authority.getById("lat-bene"),
  authority.getById("lat-tract"),
  authority.getById("lat-prae"),
]) {
  assert(item && item.status === "verified", "Representative authority items must be verified");
  assert(!("narrativeZh" in item), "Authority layer must not contain learner stories");
  assert(!("meaningBridgeZh" in item), "Authority layer must not contain whole-word semantic bridges");
}

console.log("Morpheme authority runtime checks passed.");
