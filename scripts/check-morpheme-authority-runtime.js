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


const fin = authority.getById("lat-fin");
assert(fin?.sourceLemma === "finis", "FIN must resolve to Latin finis");
assert(fin?.coreMeaningEn?.includes("boundary"), "FIN must retain the boundary/limit sense");

const pend = authority.getById("lat-pend");
assert(pend?.sourceLemma === "pendeo", "PEND must resolve to Latin pendeo");
assert(pend?.coreMeaningEn?.includes("hang"), "PEND must retain the hanging sense");

const rePrefix = authority.getById("lat-re");
assert(rePrefix?.coreMeaningEn?.includes("back") && rePrefix?.coreMeaningEn?.includes("again"), "RE- must retain BACK/AGAIN");
assert(rePrefix?.teachingForms?.includes("RED-"), "RE- authority must preserve RED- historical form");

const disPrefix = authority.getById("lat-dis");
assert(disPrefix?.coreMeaningEn?.includes("apart"), "DIS- must retain APART");

const autoPrefix = authority.getById("grc-auto");
assert(autoPrefix?.sourceLanguage === "Ancient Greek", "AUTO- must be Greek");
assert(autoPrefix?.sourceLemma === "αὐτός", "AUTO- must resolve to αὐτός");

const synPrefix = authority.getById("grc-syn");
assert(synPrefix?.sourceLemma === "σύν", "SYN- must resolve to σύν");
assert(synPrefix?.coreMeaningEn?.includes("together"), "SYN- must retain TOGETHER");

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
