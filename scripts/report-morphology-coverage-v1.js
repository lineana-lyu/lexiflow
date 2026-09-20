"use strict";

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_ECDICT = path.join(ROOT, "resources", "ecdict.sqlite");
const DEFAULT_SEED = path.join(ROOT, "data", "morphology-seed.json");

function clean(value){ return String(value ?? "").trim(); }
function pct(n,d){ return d ? Number((n*100/d).toFixed(2)) : 0; }

function parseArgs(argv){
  const args={db:DEFAULT_ECDICT,seed:DEFAULT_SEED,json:"",limit:120};
  for(let i=0;i<argv.length;i+=1){
    if(argv[i]==="--db") args.db=path.resolve(argv[++i]);
    else if(argv[i]==="--seed") args.seed=path.resolve(argv[++i]);
    else if(argv[i]==="--json") args.json=path.resolve(argv[++i]);
    else if(argv[i]==="--limit") args.limit=Math.max(10,Number(argv[++i]||120));
  }
  return args;
}

function priority(row){
  const frq=Number(row.frq||0);
  const bnc=Number(row.bnc||0);
  const ranks=[frq,bnc].filter(n=>n>0);
  const rank=ranks.length?Math.min(...ranks):999999;
  const oxford=Number(row.oxford||0)>0?1:0;
  const collins=Math.max(0,Number(row.collins||0));
  // Lower is better. Exam tags define eligibility; frequency/core-dictionary
  // signals only rank the gaps for editorial prioritization.
  return rank - oxford*12000 - collins*2200;
}

function targetRows(db){
  return db.prepare(`
    SELECT word, tag, frq, bnc, collins, oxford
    FROM entries
    WHERE ((' ' || lower(tag) || ' ') LIKE '% cet4 %'
        OR (' ' || lower(tag) || ' ') LIKE '% cet6 %')
      AND word GLOB '[A-Za-z]*'
  `).all()
    .map(row=>({...row,word:clean(row.word).toLowerCase()}))
    .filter(row=>/^[a-z][a-z'-]*$/.test(row.word));
}

function tags(row){
  return new Set(clean(row.tag).toLowerCase().split(/\s+/).filter(Boolean));
}

function summaryFor(rows, covered, predicate){
  const selected=rows.filter(predicate);
  const hit=selected.filter(row=>covered.has(row.word));
  return {
    total:selected.length,
    covered:hit.length,
    rate:pct(hit.length,selected.length),
  };
}

function topN(rows,covered,n){
  const sorted=rows.slice().sort((a,b)=>priority(a)-priority(b)||a.word.localeCompare(b.word));
  const top=sorted.slice(0,Math.min(n,sorted.length));
  const hit=top.filter(row=>covered.has(row.word)).length;
  return {n:top.length,covered:hit,rate:pct(hit,top.length)};
}

function main(){
  const args=parseArgs(process.argv.slice(2));
  if(!fs.existsSync(args.db)) throw new Error(`ECDICT database not found: ${args.db}`);
  if(!fs.existsSync(args.seed)) throw new Error(`Morphology seed not found: ${args.seed}`);

  const seed=JSON.parse(fs.readFileSync(args.seed,"utf8"));
  const covered=new Set((seed.words||[]).map(item=>clean(item.word).toLowerCase()).filter(Boolean));
  const db=new DatabaseSync(args.db,{readOnly:true});
  let rows;
  try { rows=targetRows(db); }
  finally { db.close(); }

  const cet4=summaryFor(rows,covered,row=>tags(row).has("cet4"));
  const cet6=summaryFor(rows,covered,row=>tags(row).has("cet6"));
  const union=summaryFor(rows,covered,()=>true);

  const gaps=rows
    .filter(row=>!covered.has(row.word))
    .sort((a,b)=>priority(a)-priority(b)||a.word.localeCompare(b.word))
    .slice(0,args.limit)
    .map(row=>({
      word:row.word,
      tags:Array.from(tags(row)).filter(tag=>tag==="cet4"||tag==="cet6"),
      oxford:Number(row.oxford||0),
      collins:Number(row.collins||0),
      frq:Number(row.frq||0),
      bnc:Number(row.bnc||0),
      priority:priority(row),
    }));

  const report={
    schema:"lexiflow-morphology-coverage-v1",
    source:"ECDICT exam tags + frequency metadata",
    seedWords:covered.size,
    rootFamilies:Array.isArray(seed.morphemes)?seed.morphemes.length:0,
    population:{
      rule:"single-token alphabetic headwords tagged cet4 and/or cet6 in ECDICT",
      cet4,cet6,union,
    },
    priorityCoverage:{
      top500:topN(rows,covered,500),
      top1000:topN(rows,covered,1000),
      top2000:topN(rows,covered,2000),
    },
    topGaps:gaps,
  };

  console.log("LexiFlow morphology coverage audit");
  console.log(`Seed: ${report.rootFamilies} roots / ${report.seedWords} words`);
  console.log(`CET4: ${cet4.covered}/${cet4.total} = ${cet4.rate}%`);
  console.log(`CET6: ${cet6.covered}/${cet6.total} = ${cet6.rate}%`);
  console.log(`CET4∪CET6: ${union.covered}/${union.total} = ${union.rate}%`);
  console.log(`Top 500 priority coverage: ${report.priorityCoverage.top500.covered}/${report.priorityCoverage.top500.n} = ${report.priorityCoverage.top500.rate}%`);
  console.log("Top uncovered priority words:");
  for(const gap of gaps.slice(0,60)){
    console.log(`- ${gap.word}\t${gap.tags.join("+")}\toxford=${gap.oxford}\tcollins=${gap.collins}\tfrq=${gap.frq}\tbnc=${gap.bnc}`);
  }

  if(args.json){
    fs.mkdirSync(path.dirname(args.json),{recursive:true});
    fs.writeFileSync(args.json,JSON.stringify(report,null,2)+"\n","utf8");
    console.log(`JSON report: ${args.json}`);
  }
}

try{ main(); }
catch(err){ console.error("Morphology coverage audit failed:",err.message||err); process.exitCode=1; }
