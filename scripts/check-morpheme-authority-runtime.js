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
assert(cap?.teachingForms?.includes("CEPT"), "CEPT must be backed by attested Latin receptum/acceptum compound forms");
assert(cap?.sourceForms?.includes("receptum"), "CEPT must preserve Latin receptum");
assert(cap?.sourceForms?.includes("acceptum"), "CEPT must preserve Latin acceptum");

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
assert(spect?.sourceLemma === "specio / spicio", "SPEC/SPIC/SPECT must resolve to the Latin specio/spicio family");
assert(spect?.sourceForms?.includes("spectum"), "SPECT must preserve Latin spectum");
assert(spect?.teachingForms?.includes("SPEC"), "SPEC must be backed by Latin specio");
assert(spect?.teachingForms?.includes("SPIC"), "SPIC must be backed by Latin spicio/compound forms");

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

const form = authority.getById("lat-form");
assert(form?.sourceLemma === "formo", "FORM must resolve to formo");
assert(form?.sourceForms?.includes("formatum"), "FORM must preserve formatum");

const grad = authority.getById("lat-grad");
assert(grad?.sourceLemma === "gradior", "GRAD/GRESS must resolve to gradior");
assert(grad?.sourceForms?.includes("gressus"), "GRAD/GRESS must preserve gressus");

const sta = authority.getById("lat-sta");
assert(sta?.sourceLemma === "sto", "STA/STAT must resolve to sto");
assert(sta?.sourceForms?.includes("statum"), "STA/STAT must preserve statum");

const ced = authority.getById("lat-ced");
assert(ced?.sourceLemma === "cedo", "CED/CESS must resolve to cedo");
assert(ced?.sourceForms?.includes("cessum"), "CED/CESS must preserve cessum");
assert(!ced?.teachingForms?.includes("CEED"), "English CEED must not leak into Latin authority");

const clud = authority.getById("lat-clud");
assert(clud?.sourceLemma === "claudo", "CLUD/CLUS must resolve to claudo");
assert(clud?.sourceForms?.includes("cludo"), "CLUD must be backed by attested cludo compound form");
assert(clud?.sourceForms?.includes("clausum"), "CLUS must preserve clausum family");

const curr = authority.getById("lat-curr");
assert(curr?.sourceLemma === "curro", "CURR/CURS must resolve to curro");
assert(curr?.sourceForms?.includes("cursum"), "CURR/CURS must preserve cursum");

const gen = authority.getById("lat-gen");
assert(gen?.sourceLemma === "gigno", "GEN must resolve to gigno");
assert(gen?.sourceForms?.includes("gen-"), "GEN must preserve the lexicon's explicit root gen-");

const viv = authority.getById("lat-viv");
assert(viv?.sourceLemma === "vivo", "VIV must resolve to vivo");
assert(!viv?.teachingForms?.includes("VIT"), "VIT must not be collapsed into the VIVO authority record");

const vita = authority.getById("lat-vita");
assert(vita?.sourceLemma === "vita", "VITA must resolve to vita");
assert(!vita?.teachingForms?.includes("VIT"), "Shortened VIT teaching form must remain withheld");

const ject = authority.getById("lat-ject");
assert(ject?.sourceForms?.includes("jectum"), "JECT must preserve attested Latin jectum compound form");
assert(authority.findByTeachingForm("JECT")[0]?.id === "lat-ject", "JECT must resolve directly from Latin authority");

const vert = authority.getById("lat-vert");
assert(vert?.sourceLemma === "verto", "VERT/VERS must resolve to verto");
assert(vert?.sourceForms?.includes("versum"), "VERS must preserve Latin versum");

const metr = authority.getById("grc-metr");
assert(metr?.sourceLemma === "μέτρον", "METR must resolve to μέτρον");
assert(metr?.sourceStem === "μετρ- / μετρο-", "METR must preserve Greek source stems");
assert(!metr?.teachingForms?.includes("METER"), "English METER must remain outside Ancient Greek authority");
assert(!metr?.teachingForms?.includes("METRY"), "English METRY must remain outside Ancient Greek authority");

const genFamily = authority.getById("lat-gen");
assert(genFamily?.teachingForms?.includes("GENER"), "GENER must be backed by Latin genus/generis");
assert(genFamily?.sourceForms?.includes("generis"), "GENER must preserve Latin generis");

const dictFamily = authority.getById("lat-dict");
assert(dictFamily?.teachingForms?.includes("DIC"), "DIC must be backed by Latin root dic-");
assert(dictFamily?.teachingForms?.includes("DICT"), "DICT must remain in the dico family");

const capFamily = authority.getById("lat-cap");
assert(capFamily?.teachingForms?.includes("CIP"), "CIP must be backed by Latin recipio/accipio");
assert(capFamily?.teachingForms?.includes("CEPT"), "CEPT must be backed by Latin receptum/acceptum");
assert(!capFamily?.teachingForms?.includes("CEIVE"), "CEIVE must remain outside Latin authority");
assert(!capFamily?.teachingForms?.includes("CEIT"), "CEIT must remain outside Latin authority");

const pedFamily = authority.getById("lat-ped");
assert(pedFamily?.sourceLemma === "pes", "PED must resolve to Latin pes");
assert(pedFamily?.sourceForms?.includes("pedis"), "PED must preserve Latin pedis");
assert(!pedFamily?.teachingForms?.includes("PEDI"), "PEDI must not be published as a separate Latin authority form");
assert(!pedFamily?.teachingForms?.includes("PEDE"), "PEDE must not be published as a separate Latin authority form");

const vivFamily = authority.getById("lat-viv");
assert(!vivFamily?.teachingForms?.includes("VIVI"), "VIVI must remain a non-published surface sequence");
const vitaFamily = authority.getById("lat-vita");
assert(!vitaFamily?.teachingForms?.includes("VIT"), "VIT must remain outside source-language authority");

const facFamilyP1 = authority.getById("lat-fac");
assert(facFamilyP1?.teachingForms?.includes("FIC"), "FIC must be backed by Latin conficio");
assert(!facFamilyP1?.teachingForms?.includes("FEC"), "FEC must remain a non-published truncation");

const agFamily = authority.getById("lat-ag");
assert(agFamily?.teachingForms?.includes("AG"), "AG must be backed by Latin ago");
assert(agFamily?.teachingForms?.includes("ACT"), "ACT must be backed by Latin actio/actum");

const monFamily = authority.getById("grc-mon");
assert(monFamily?.sourceLemma === "μόνος", "MON/MONO must resolve to Greek μόνος");
assert(monFamily?.sourceStem === "μονο-", "MON/MONO must preserve Greek μονο-");

const staFamilyP1 = authority.getById("lat-sta");
assert(staFamilyP1?.teachingForms?.includes("STANT"), "STANT must be backed by Latin constans/stantis");
assert(!staFamilyP1?.teachingForms?.includes("STANCE"), "STANCE must remain outside Latin authority");

const stasFamily = authority.getById("grc-stas");
assert(stasFamily?.sourceLemma === "στάσις", "STAS must resolve to Greek στάσις");
assert(stasFamily?.sourceStem === "στασ- / στασι-", "STAS must preserve Greek stas-/stasi- source stems");

const pon = authority.getById("lat-pon");
assert(pon?.teachingForms?.includes("PONE"), "PONE must be backed by Latin ponere");
assert(!pon?.teachingForms?.includes("POSE"), "POSE must remain outside Latin authority");
assert(!pon?.teachingForms?.includes("POUND"), "POUND must remain outside Latin authority");

const ferFamily = authority.getById("lat-fer");
assert(ferFamily?.teachingForms?.includes("LAT"), "LAT must be backed by Latin latus/latum");
assert(!ferFamily?.teachingForms?.includes("LATE"), "LATE must remain outside Latin authority");

const transPrefix = authority.getById("lat-trans");
assert(transPrefix?.teachingForms?.includes("TRANS-"), "TRANS- must be backed by Latin trans");
assert(transPrefix?.teachingForms?.includes("TRA-"), "TRA- must preserve the attested Latin compound reduction");

const triFamily = authority.getById("lat-tri");
assert(triFamily?.sourceLemma === "tres / tria", "TRI must resolve to Latin tres/tria");
assert(triFamily?.teachingForms?.includes("TRI"), "TRI must be source-language grounded");

const regFamily = authority.getById("lat-reg");
assert(regFamily?.sourceLemma === "rego", "REG/RIG/RECT must resolve to Latin rego");
assert(regFamily?.teachingForms?.includes("RIG"), "RIG must be backed by Latin corrigo");
assert(regFamily?.teachingForms?.includes("RECT"), "RECT must preserve Latin rectum");

const hydroFamily = authority.getById("grc-hydro");
assert(hydroFamily?.sourceLemma === "ὕδωρ", "HYDRO must resolve to Greek ὕδωρ");
assert(hydroFamily?.sourceStem === "ὑδρο-", "HYDRO must preserve attested Greek ὑδρο- compound form");
assert(!hydroFamily?.teachingForms?.includes("HYDR"), "HYDR must remain outside Ancient Greek authority");

const epiPrefix = authority.getById("grc-epi");
assert(epiPrefix?.sourceLemma === "ἐπί", "EPI- must resolve to Greek ἐπί");
assert(epiPrefix?.teachingForms?.includes("EPI-"), "EPI- must be source-language grounded");
assert(!epiPrefix?.teachingForms?.includes("EPH-"), "EPH- remains deferred pending approved grammar evidence");
assert(!epiPrefix?.teachingForms?.includes("EP-"), "EP- remains deferred pending approved grammar evidence");

const jacLie = authority.getById("lat-jac-lie");
assert(jacLie?.sourceLemma === "iaceo / jaceo", "JAC must resolve to Latin iaceo/jaceo 'lie'");
assert(jacLie?.teachingForms?.includes("JAC"), "JAC must be published as the lie/situated family");
assert(authority.findByTeachingForm("JAC")[0]?.id === "lat-jac-lie", "JAC must not resolve to the JECT throw family");
assert(authority.findByTeachingForm("JECT")[0]?.id === "lat-ject", "JECT must remain the iacio throw family");

const bisFamily = authority.getById("lat-bis");
assert(bisFamily?.sourceLemma === "bis", "BIS must resolve to Latin bis");
assert(!bisFamily?.teachingForms?.includes("BI"), "English BI must remain outside source-language authority");

const biniFamily = authority.getById("lat-bini");
assert(biniFamily?.sourceLemma === "bini", "BINI must resolve to Latin bini");
assert(!biniFamily?.teachingForms?.includes("BIN"), "English BIN must remain outside source-language authority");

const caputFamily = authority.getById("lat-caput");
assert(caputFamily?.sourceLemma === "caput", "CAPIT/CIPIT must resolve to Latin caput");
assert(caputFamily?.teachingForms?.includes("CAPIT"), "CAPIT must be backed by Latin capitis");
assert(caputFamily?.teachingForms?.includes("CIPIT"), "CIPIT must be backed by Latin praecipitis");
assert(!caputFamily?.teachingForms?.includes("CAP"), "Ambiguous CAP must not be published for the head family");

const caedCutFamily = authority.getById("lat-caed");
assert(caedCutFamily?.sourceLemma === "caedo", "CID/CIS cut family must resolve to Latin caedo");
assert(caedCutFamily?.teachingForms?.includes("CID"), "Cut-family CID must be source-language grounded");
assert(caedCutFamily?.teachingForms?.includes("CIS"), "Cut-family CIS must be source-language grounded");
assert(!caedCutFamily?.teachingForms?.includes("CIDE"), "English CIDE must remain outside Latin source authority");

const cadFallFamily = authority.getById("lat-cad");
assert(cadFallFamily?.sourceLemma === "cado", "CAD/CAS/CID fall family must resolve to Latin cado");
assert(cadFallFamily?.teachingForms?.includes("CAD"), "CAD must be source-language grounded");
assert(cadFallFamily?.teachingForms?.includes("CAS"), "CAS must be source-language grounded");
assert(cadFallFamily?.teachingForms?.includes("CID"), "Fall-family CID must be source-language grounded");

const cidAuthorities = authority.findByTeachingForm("CID").map(item => item.id).sort();
assert(
  cidAuthorities.length === 2 && cidAuthorities[0] === "lat-cad" && cidAuthorities[1] === "lat-caed",
  "CID must remain an explicit two-family homograph in authority"
);

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
