"use strict";

const fs=require("fs");
const path=require("path");
const authority=require("./morpheme-authority");

const FILE=path.join(__dirname,"..","data","morpheme-transmission.json");
let cache=null;

function clone(v){ return v==null?v:JSON.parse(JSON.stringify(v)); }
function norm(v){ return String(v||"").trim().toUpperCase(); }

function load(){
  if(cache) return cache;
  const raw=JSON.parse(fs.readFileSync(FILE,"utf8"));
  const byId=new Map();
  const byForm=new Map();
  const sourceMap=new Map((raw.sources||[]).map(s=>[s.id,s]));
  for(const item of raw.mappings||[]){
    byId.set(item.id,item);
    byForm.set(norm(item.englishTeachingForm),item);
  }
  cache={raw,byId,byForm,sourceMap};
  return cache;
}

function getById(id){ return clone(load().byId.get(String(id||"").trim())||null); }

function getByTeachingForm(form){
  return clone(load().byForm.get(norm(form))||null);
}

function evidenceFor(id){
  const item=load().byId.get(String(id||"").trim());
  if(!item) return null;
  return {
    mapping:clone(item),
    authority:authority.getById(item.authorityId),
    sources:clone((item.sourceIds||[]).map(sourceId=>load().sourceMap.get(sourceId)).filter(Boolean)),
  };
}

function resetForTests(){ cache=null; }

module.exports={FILE,getById,getByTeachingForm,evidenceFor,resetForTests};
