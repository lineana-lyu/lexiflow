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

for(const id of ["tx-pre","tx-fect","tx-tain","tx-ceed","tx-meter","tx-metry","tx-graphy","tx-pose","tx-pound","tx-late","tx-spectro"]){
  const evidence=transmission.evidenceFor(id);
  assert(evidence?.authority?.status==="verified",`${id} must link to verified authority`);
  assert(evidence?.sources?.length>=2,`${id} must retain two-source evidence`);
  assert(new Set(evidence.sources.map(s=>s.work)).size>=2,`${id} evidence must be independent`);
}

console.log("Morpheme transmission runtime checks passed.");
