"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TRANSMISSION_FILE = path.join(ROOT, "data", "morpheme-transmission.json");
const AUTHORITY_FILE = path.join(ROOT, "data", "morpheme-authority.json");

const ALLOWED_WORKS = new Set(["Online Etymology Dictionary", "Wiktionary"]);
const ALLOWED_TYPES = new Set([
  "historical_reflex",
  "historical_stem_reflex",
  "romance_reflex",
  "romance_english_spelling_reflex",
  "learned_borrowing_combining_form",
  "learned_borrowing_suffix",
  "historical_analogy_replacement",
]);
const FORBIDDEN_FIELDS = new Set([
  "story","storyZh","narrative","narrativeZh","meaningBridgeZh","semanticEvolution","relatedWords"
]);

function clean(v){ return String(v ?? "").trim(); }
function norm(v){ return clean(v).toUpperCase().replace(/\s+/g,""); }
function assert(cond,msg){ if(!cond) throw new Error(msg); }

function validateTransmission(tx, authority){
  assert(tx?.schema==="lexiflow-morpheme-transmission-v1","Unsupported transmission schema");
  assert(tx?.scope==="historical-english-mapping","Transmission scope must remain historical-english-mapping");

  const authorityMap=new Map((authority?.morphemes||[]).map(m=>[m.id,m]));
  const sourceMap=new Map();

  for(const s of tx.sources||[]){
    assert(clean(s.id), "Transmission source id is required");
    assert(!sourceMap.has(s.id), `Duplicate transmission source id: ${s.id}`);
    assert(s.sourceType==="english_etymology_reference", `Invalid source type: ${s.id}`);
    assert(ALLOWED_WORKS.has(s.work), `Unapproved English etymology work: ${s.work}`);
    assert(clean(s.url).startsWith("https://"), `Source URL must be HTTPS: ${s.id}`);
    assert(clean(s.locator), `Source locator is required: ${s.id}`);
    assert(clean(s.license), `Source license/note is required: ${s.id}`);
    sourceMap.set(s.id,s);
  }

  const ids=new Set();
  const forms=new Set();
  const minEvidence=Number(tx?.policy?.minIndependentEvidence||2);

  for(const m of tx.mappings||[]){
    assert(clean(m.id), "Transmission mapping id is required");
    assert(!ids.has(m.id), `Duplicate transmission mapping id: ${m.id}`);
    ids.add(m.id);

    for(const field of Object.keys(m)){
      assert(!FORBIDDEN_FIELDS.has(field), `Transmission layer must not own learner story field "${field}" on ${m.id}`);
    }

    assert(m.status==="verified", `Only verified mappings may be published: ${m.id}`);
    assert(ALLOWED_TYPES.has(m.mappingType), `Unsupported mapping type: ${m.id}`);
    assert(authorityMap.has(m.authorityId), `Unknown authorityId "${m.authorityId}" for ${m.id}`);
    assert(clean(m.englishTeachingForm), `English teaching form required: ${m.id}`);
    assert(!forms.has(norm(m.englishTeachingForm)), `Duplicate English teaching form: ${m.englishTeachingForm}`);
    forms.add(norm(m.englishTeachingForm));

    const authorityItem=authorityMap.get(m.authorityId);
    const authorityForms=new Set((authorityItem.teachingForms||[]).map(norm));
    assert(!authorityForms.has(norm(m.englishTeachingForm)),
      `Transmission form duplicates source-language authority form: ${m.id}`);

    assert(clean(m.sourceForm), `sourceForm required: ${m.id}`);
    assert(clean(m.targetForm), `targetForm required: ${m.id}`);
    assert(Array.isArray(m.pathway)&&m.pathway.length>=2, `Historical pathway required: ${m.id}`);
    assert(Array.isArray(m.evidenceWords)&&m.evidenceWords.length>=1, `Evidence word required: ${m.id}`);
    assert(clean(m.factSummary), `Fact summary required: ${m.id}`);

    const sourceIds=Array.isArray(m.sourceIds)?m.sourceIds:[];
    assert(sourceIds.length>=minEvidence, `At least ${minEvidence} evidence sources required: ${m.id}`);
    const sources=sourceIds.map(id=>{
      assert(sourceMap.has(id), `Unknown source "${id}" for ${m.id}`);
      return sourceMap.get(id);
    });
    const works=new Set(sources.map(s=>s.work));
    assert(works.size>=minEvidence, `Evidence must come from ${minEvidence} independent works: ${m.id}`);
    assert(works.has("Online Etymology Dictionary"), `Etymonline cross-check required: ${m.id}`);
    assert(works.has("Wiktionary"), `Wiktionary structured etymology required: ${m.id}`);
  }

  return {mappingCount:(tx.mappings||[]).length,sourceCount:(tx.sources||[]).length};
}

if(require.main===module){
  try{
    const tx=JSON.parse(fs.readFileSync(TRANSMISSION_FILE,"utf8"));
    const authority=JSON.parse(fs.readFileSync(AUTHORITY_FILE,"utf8"));
    const result=validateTransmission(tx,authority);
    console.log(`Morpheme transmission checks passed: ${result.mappingCount} mappings, ${result.sourceCount} sources.`);
  }catch(err){
    console.error(err.message||err);
    process.exitCode=1;
  }
}

module.exports={validateTransmission,TRANSMISSION_FILE,AUTHORITY_FILE};
