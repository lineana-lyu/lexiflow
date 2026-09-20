"use strict";

const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = path.resolve(__dirname, "..");
const FILE = path.join(ROOT, "data", "morpheme-authority.json");

const ALLOWED_WORKS = new Set([
  "Lewis & Short, A Latin Dictionary",
  "Allen and Greenough's New Latin Grammar for Schools and Colleges",
  "Liddell-Scott-Jones Greek-English Lexicon",
  "A Greek Grammar for Colleges",
]);

const ALLOWED_HOSTS = new Set([
  "atlas.perseus.tufts.edu",
  "www.perseus.tufts.edu",
  "perseus.tufts.edu",
  "grammars.alpheios.net",
  "dcc.dickinson.edu",
]);

function clean(v){ return String(v ?? "").trim(); }
function normForm(v){
  return clean(v)
    .toLowerCase()
    .replace(/[\s\-–—·.]/g,"")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"");
}
function unique(a){ return [...new Set(a)]; }

function audit(data){
  const sourceMap=new Map((data.sources||[]).map(s=>[s.id,s]));
  const findings=[];

  for(const source of data.sources||[]){
    let host="";
    try{ host=new URL(source.url).hostname; }catch{}
    if(!ALLOWED_WORKS.has(source.work)){
      findings.push({severity:"critical",type:"unapproved_source_work",id:source.id,detail:source.work});
    }
    if(!ALLOWED_HOSTS.has(host)){
      findings.push({severity:"critical",type:"unapproved_source_host",id:source.id,detail:host||source.url});
    }
    if(!clean(source.locator)){
      findings.push({severity:"critical",type:"missing_locator",id:source.id});
    }
  }

  for(const item of data.morphemes||[]){
    const claims=item.claimSources||{};
    const allIds=unique(Object.values(claims).flat().filter(Boolean));
    const evidence=allIds.map(id=>sourceMap.get(id)).filter(Boolean);
    const lemmaEvidence=(claims.lemma||[]).map(id=>sourceMap.get(id)).filter(Boolean);
    const meaningEvidence=(claims.meaning||[]).map(id=>sourceMap.get(id)).filter(Boolean);
    const formEvidence=(claims.forms||[]).map(id=>sourceMap.get(id)).filter(Boolean);

    if(!lemmaEvidence.length || !meaningEvidence.length || !formEvidence.length){
      findings.push({severity:"critical",type:"missing_core_evidence",id:item.id});
      continue;
    }

    if(["root_family","root_or_combining_form"].includes(item.kind)){
      if(!lemmaEvidence.some(s=>s.sourceType==="historical_lexicon")){
        findings.push({severity:"critical",type:"root_without_lexicon_lemma",id:item.id});
      }
      if(!meaningEvidence.some(s=>s.sourceType==="historical_lexicon")){
        findings.push({severity:"critical",type:"root_without_lexicon_meaning",id:item.id});
      }
    }

    if((item.variants||[]).length){
      const variantEvidence=(claims.variants||[]).map(id=>sourceMap.get(id)).filter(Boolean);
      if(!variantEvidence.some(s=>s.sourceType==="historical_grammar")){
        findings.push({severity:"critical",type:"variant_without_grammar",id:item.id});
      }
    }

    if(item.sourceLanguage==="Ancient Greek" && item.kind==="root_family"){
      const sd=item.stemDerivation||{};
      if(!clean(item.sourceStem) || !clean(sd.method) || !(sd.sources||[]).length){
        findings.push({severity:"critical",type:"greek_root_without_stem_chain",id:item.id});
      }
    }

    if(item.sourceLanguage==="Latin" && item.kind==="prefix"){
      const sourceForms=(item.sourceForms||[]).map(normForm);
      const variantForms=(item.variants||[]).map(v=>normForm(v.form));
      const supportedForms=new Set([...sourceForms,...variantForms]);
      for(const teaching of item.teachingForms||[]){
        const t=normForm(teaching);
        if(!supportedForms.has(t)){
          findings.push({
            severity:"review",
            type:"latin_prefix_teaching_form_not_source_form",
            id:item.id,
            detail:teaching
          });
        }
      }
    }

    if(!evidence.length){
      findings.push({severity:"critical",type:"no_resolved_evidence",id:item.id});
    }
  }

  const critical=findings.filter(x=>x.severity==="critical");
  const review=findings.filter(x=>x.severity==="review");
  return {
    auditedAt:"2026-09-20",
    sourceCount:(data.sources||[]).length,
    morphemeCount:(data.morphemes||[]).length,
    criticalCount:critical.length,
    reviewCount:review.length,
    findings
  };
}

if(require.main===module){
  const data=JSON.parse(fs.readFileSync(FILE,"utf8"));
  const result=audit(data);
  console.log(JSON.stringify(result,null,2));
  if(result.criticalCount>0) process.exitCode=1;
}

module.exports={audit};
