"use strict";

const authority=require("../lib/morpheme-authority");
const transmission=require("../lib/morpheme-transmission");

function assert(cond,msg){ if(!cond) throw new Error(msg); }

const pre=transmission.getByTeachingForm("PRE-");
assert(pre?.authorityId==="lat-prae","PRE- must map to Latin PRAE authority");
assert(authority.findByTeachingForm("PRE-").length===0,"PRE- must remain absent from source-language authority");

const fect=transmission.getByTeachingForm("FECT");
assert(fect?.authorityId==="lat-fac","FECT must map to FAC/FACT authority");
assert(!authority.getById("lat-fac")?.teachingForms?.includes("FECT"),"FECT must remain outside Latin source forms");

const tain=transmission.getByTeachingForm("TAIN");
assert(tain?.authorityId==="lat-ten","TAIN must map to TEN/TENT authority");

const ceed=transmission.getByTeachingForm("CEED");
assert(ceed?.authorityId==="lat-ced","CEED must map to CED/CESS authority");

assert(transmission.getByTeachingForm("JECT")===null,"JECT must not be duplicated in transmission");
assert(authority.findByTeachingForm("JECT")[0]?.id==="lat-ject","JECT must now resolve directly from Latin authority");

const meter=transmission.getByTeachingForm("METER");
assert(meter?.authorityId==="grc-metr","METER must map to Greek METR authority");
assert(authority.findByTeachingForm("METER").length===0,"METER must remain outside Ancient Greek authority");

const metry=transmission.getByTeachingForm("METRY");
assert(metry?.authorityId==="grc-metr","METRY must map to Greek METR authority");

const graphy=transmission.getByTeachingForm("GRAPHY");
assert(graphy?.authorityId==="grc-graph","GRAPHY must map to Greek GRAPH authority");
assert(authority.findByTeachingForm("GRAPHY").length===0,"GRAPHY must remain outside Ancient Greek authority");

const pose=transmission.getByTeachingForm("POSE");
assert(pose?.authorityId==="lat-pon","POSE must map to PON/PONE/POSIT authority");
assert(pose?.mappingType==="historical_analogy_replacement","POSE must preserve the analogy/replacement relationship");

const pound=transmission.getByTeachingForm("POUND");
assert(pound?.authorityId==="lat-pon","POUND must map to PON/PONE/POSIT authority");

const late=transmission.getByTeachingForm("LATE");
assert(late?.authorityId==="lat-fer","LATE must map to FER/LAT authority");

const spectro=transmission.getByTeachingForm("SPECTRO");
assert(spectro?.authorityId==="lat-spect","SPECTRO must map to SPEC/SPIC/SPECT authority");

const ceive=transmission.getByTeachingForm("CEIVE");
assert(ceive?.authorityId==="lat-cap","CEIVE must map to CAP/CIP/CEPT authority");
assert(authority.findByTeachingForm("CEIVE").length===0,"CEIVE must remain outside Latin authority");

const ceit=transmission.getByTeachingForm("CEIT");
assert(ceit?.authorityId==="lat-cap","CEIT must map to CAP/CIP/CEPT authority");
assert(authority.findByTeachingForm("CEIT").length===0,"CEIT must remain outside Latin authority");

const cede=transmission.getByTeachingForm("CEDE");
assert(cede?.authorityId==="lat-ced","CEDE must map to CED/CESS authority");
assert(authority.findByTeachingForm("CEDE").length===0,"CEDE must remain outside Latin authority");

const stance=transmission.getByTeachingForm("STANCE");
assert(stance?.authorityId==="lat-sta","STANCE must map to STA/STAT/STANT authority");
assert(authority.findByTeachingForm("STANCE").length===0,"STANCE must remain outside Latin authority");

const voke=transmission.getByTeachingForm("VOKE");
assert(voke?.authorityId==="lat-voc","VOKE must map to Latin VOC authority");

const vise=transmission.getByTeachingForm("VISE");
assert(vise?.authorityId==="lat-vid","VISE must map to Latin VID/VIS authority");

const phone=transmission.getByTeachingForm("PHONE");
assert(phone?.authorityId==="grc-phon","PHONE must map to Greek PHON authority");

const phony=transmission.getByTeachingForm("PHONY");
assert(phony?.authorityId==="grc-phon","PHONY must map to Greek PHON authority");

const phono=transmission.getByTeachingForm("PHONO");
assert(phono?.authorityId==="grc-phon","PHONO must map to Greek PHON authority");

const clos=transmission.getByTeachingForm("CLOS");
assert(clos?.authorityId==="lat-clud","CLOS must map to Latin CLUD/CLUS authority");

const hydr=transmission.getByTeachingForm("HYDR");
assert(hydr?.authorityId==="grc-hydro","HYDR must map to Greek HYDRO authority");
assert(authority.findByTeachingForm("HYDR").length===0,"HYDR must remain outside Ancient Greek authority");

const enPrefix=transmission.getByTeachingForm("EN");
assert(enPrefix?.authorityId==="lat-in-locative","EN must map to locative Latin IN authority");
const emPrefix=transmission.getByTeachingForm("EM");
assert(emPrefix?.authorityId==="lat-in-locative","EM must map to locative Latin IN authority");

const biPrefix=transmission.getByTeachingForm("BI");
assert(biPrefix?.authorityId==="lat-bis","BI must map to Latin BIS authority");
const binPrefix=transmission.getByTeachingForm("BIN");
assert(binPrefix?.authorityId==="lat-bini","BIN must map to Latin BINI authority");

const jet=transmission.getByTeachingForm("JET");
assert(jet?.authorityId==="lat-ject","JET must map to the Latin JECT throw family");
assert(authority.findByTeachingForm("JET").length===0,"JET must remain outside Latin source authority");

const cours=transmission.getByTeachingForm("COURS");
assert(cours?.authorityId==="lat-curr","COURS must map to Latin CURR/CURS authority");

for(const id of ["tx-pre","tx-fect","tx-tain","tx-ceed","tx-meter","tx-metry","tx-graphy","tx-pose","tx-pound","tx-late","tx-spectro","tx-voke","tx-vise","tx-phone","tx-phony","tx-phono","tx-clos","tx-hydr","tx-en","tx-em","tx-bi","tx-bin","tx-jet","tx-cours"]){
  const evidence=transmission.evidenceFor(id);
  assert(evidence?.authority?.status==="verified",`${id} must link to verified authority`);
  assert(evidence?.sources?.length>=2,`${id} must retain two-source evidence`);
  assert(new Set(evidence.sources.map(s=>s.work)).size>=2,`${id} evidence must be independent`);
}

console.log("Morpheme transmission runtime checks passed.");
