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

const graph = authority.getById("grc-graph");
assert(graph?.sourceLemma === "γράφω", "GRAPH must resolve to γράφω");
assert(graph?.sourceStem === "γραφ-", "GRAPH must preserve Greek source stem γραφ-");
assert(graph?.stemDerivation?.sources?.includes("smyth-word-formation"), "GRAPH stem mapping must cite Smyth");

const log = authority.getById("grc-log");
assert(log?.sourceLemma === "λόγος", "LOG must resolve to λόγος");
assert(log?.sourceStem === "λογο-", "LOG must preserve Greek source stem λογο-");
assert(log?.teachingForms?.includes("LOGO"), "LOG family must preserve LOGO teaching form");

const bio = authority.getById("grc-bio");
assert(bio?.sourceLemma === "βίος", "BIO must resolve to βίος");
assert(bio?.sourceStem === "βιο-", "BIO must preserve second-declension stem βιο-");
assert(bio?.stemDerivation?.sources?.includes("smyth-declension"), "BIO stem mapping must cite the O-stem rule");

const geo = authority.getById("grc-geo");
assert(geo?.sourceLemma === "γῆ", "GEO must resolve to γῆ");
assert(geo?.sourceStem === "γεω-", "GEO must preserve attested compound stem γεω-");
assert(geo?.stemDerivation?.sources?.includes("lsj-geographo"), "GEO stem mapping must cite an attested Greek compound");

const phon = authority.getById("grc-phon");
assert(phon?.sourceLemma === "φωνή", "PHON must resolve to φωνή");
assert(phon?.sourceStem === "φων-", "PHON must preserve attested compound stem φων-");
assert(phon?.stemDerivation?.sources?.includes("lsj-aphonos"), "PHON stem mapping must cite ἄφωνος");

assert(authority.findByTeachingForm("GRAPH")[0]?.id === "grc-graph", "GRAPH teaching lookup mismatch");
assert(authority.findByTeachingForm("BIO")[0]?.id === "grc-bio", "BIO teaching lookup mismatch");

const ab = authority.getById("lat-ab");
assert(ab?.coreMeaningEn?.includes("away"), "A-/AB- must retain AWAY");

const perIntensive = authority.getById("lat-per-intensive");
assert(perIntensive?.coreMeaningEn?.includes("very"), "intensive PER- must retain VERY");
assert(perIntensive?.formRelation?.includes("does not cover prepositional per"), "PER- intensive must stay separated from prepositional per");

const dia = authority.getById("grc-dia");
assert(dia?.sourceLemma === "διά" && dia?.coreMeaningEn?.includes("through"), "DIA- must resolve to διά / THROUGH");

const meta = authority.getById("grc-meta");
assert(meta?.sourceLemma === "μετά", "META- must resolve to μετά");
assert(!meta?.coreMeaningEn?.includes("self-referential"), "META- authority must not import modern English semantic extensions");

const para = authority.getById("grc-para");
assert(para?.sourceLemma === "παρά", "PARA- must resolve to παρά");

const peri = authority.getById("grc-peri");
assert(peri?.coreMeaningEn?.includes("around"), "PERI- must retain AROUND");

const hyper = authority.getById("grc-hyper");
assert(hyper?.coreMeaningEn?.includes("above") && hyper?.coreMeaningEn?.includes("beyond"), "HYPER- must retain ABOVE/BEYOND");

const hypo = authority.getById("grc-hypo");
assert(hypo?.coreMeaningEn?.includes("under"), "HYPO- must retain UNDER");

assert(authority.findByTeachingForm("PRE-").length === 0, "English PRE- reflex must not be published by the Latin source-language authority layer");

const fac = authority.getById("lat-fac");
assert(fac?.sourceLemma === "facio", "FAC/FACT must resolve to facio");
assert(fac?.sourceForms?.includes("factum"), "FAC/FACT must preserve factum");
assert(!fac?.teachingForms?.includes("FECT"), "English FECT reflex must not be asserted by Latin authority");

const fero = authority.getById("lat-fer");
assert(fero?.sourceLemma === "fero", "FER must resolve to fero");
assert(fero?.sourceForms?.includes("latum"), "FER record must preserve irregular Latin latum source form");

const rupt = authority.getById("lat-rupt");
assert(rupt?.sourceForms?.includes("ruptum"), "RUPT must preserve ruptum");
assert(rupt?.coreMeaningEn?.includes("break"), "RUPT must retain BREAK");

const sent = authority.getById("lat-sent");
assert(sent?.sourceLemma === "sentio", "SENT/SENS must resolve to sentio");
assert(sent?.sourceForms?.includes("sensum"), "SENT/SENS must preserve sensum");

const spect = authority.getById("lat-spect");
assert(spect?.sourceLemma === "spectio", "SPECT must remain conservatively tied to spectio");
assert(!spect?.teachingForms?.includes("SPEC"), "SPEC must stay withheld until the verbal stem chain is separately sourced");

const struct = authority.getById("lat-struct");
assert(struct?.sourceForms?.includes("structum"), "STRUCT must preserve structum");

const ten = authority.getById("lat-ten");
assert(ten?.sourceLemma === "teneo", "TEN/TENT must resolve to teneo");
assert(!ten?.teachingForms?.includes("TAIN"), "English TAIN reflex must not be asserted by Latin authority");

const ven = authority.getById("lat-ven");
assert(ven?.sourceForms?.includes("ventum"), "VEN/VENT must preserve ventum");

const voc = authority.getById("lat-voc");
assert(voc?.sourceLemma === "voco", "VOC must resolve to voco");
assert(!voc?.teachingForms?.includes("VOK"), "English VOK spelling must not be asserted by Latin authority");

const vid = authority.getById("lat-vid");
assert(vid?.sourceForms?.includes("visum"), "VID/VIS must preserve visum");

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
