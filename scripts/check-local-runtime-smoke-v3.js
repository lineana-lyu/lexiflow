"use strict";

const fs=require("fs");
const os=require("os");
const path=require("path");
const net=require("net");
const {DatabaseSync}=require("node:sqlite");

function assert(condition,message){if(!condition)throw new Error(message);}
function eq(actual,expected,message){
  const a=JSON.stringify(actual),e=JSON.stringify(expected);
  if(a!==e)throw new Error(`${message}\nexpected: ${e}\nactual:   ${a}`);
}

function canListen(port){
  return new Promise(resolve=>{
    const server=net.createServer();
    server.once("error",()=>resolve(false));
    server.listen(port,"127.0.0.1",()=>server.close(()=>resolve(true)));
  });
}

async function findPortPair(){
  const seed=32000+(process.pid%8000);
  for(let offset=0;offset<200;offset+=2){
    const outer=seed+offset;
    if(outer>=65000)break;
    if(await canListen(outer)&&await canListen(outer+1))return [outer,outer+1];
  }
  throw new Error("Could not find an isolated local port pair for runtime smoke test");
}

function createEcdictFixture(file){
  const db=new DatabaseSync(file);
  db.exec(`
    CREATE TABLE entries (
      word TEXT PRIMARY KEY COLLATE NOCASE,
      phonetic TEXT NOT NULL DEFAULT '',
      definition TEXT NOT NULL DEFAULT '',
      translation TEXT NOT NULL DEFAULT '',
      pos TEXT NOT NULL DEFAULT '',
      collins INTEGER NOT NULL DEFAULT 0,
      oxford INTEGER NOT NULL DEFAULT 0,
      tag TEXT NOT NULL DEFAULT '',
      bnc INTEGER NOT NULL DEFAULT 0,
      frq INTEGER NOT NULL DEFAULT 0,
      exchange TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  const insert=db.prepare(`
    INSERT INTO entries(word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)
  `);
  insert.run(
    "address","əˈdres","to deal with a problem\nwhere someone lives",
    "v. 处理；应对\nn. 地址","v n",5,1,"cet4 cet6",900,1200,""
  );
  insert.run(
    "resolve","rɪˈzɒlv","to solve or settle a problem","v. 解决；处理","v",4,1,"cet4",1500,2200,""
  );
  const meta=db.prepare("INSERT INTO metadata(key,value) VALUES(?,?)");
  meta.run("entry_count","2");
  meta.run("source","lexiflow-runtime-smoke-fixture");
  meta.run("schema","lexiflow-ecdict-v1");
  db.close();
}

function createCoreFixture(file){
  const db=new DatabaseSync(file);
  db.exec(`
    CREATE TABLE words (
      word TEXT PRIMARY KEY COLLATE NOCASE,
      phonetic TEXT NOT NULL DEFAULT '',
      audio_url TEXT NOT NULL DEFAULT '',
      learner_rank REAL NOT NULL DEFAULT 0,
      pos_summary TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      collins INTEGER NOT NULL DEFAULT 0,
      oxford INTEGER NOT NULL DEFAULT 0,
      bnc INTEGER NOT NULL DEFAULT 0,
      frq INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'fixture'
    );
    CREATE TABLE senses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL COLLATE NOCASE,
      pos TEXT NOT NULL DEFAULT '',
      definition_en TEXT NOT NULL DEFAULT '',
      meaning_zh TEXT NOT NULL DEFAULT '',
      example_en TEXT NOT NULL DEFAULT '',
      sense_rank REAL NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'fixture'
    );
    CREATE TABLE zh_aliases (
      alias TEXT NOT NULL,
      word TEXT NOT NULL COLLATE NOCASE,
      rank REAL NOT NULL DEFAULT 0,
      source TEXT NOT NULL,
      PRIMARY KEY(alias, word)
    );
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);

  db.prepare(`
    INSERT INTO words(word,phonetic,audio_url,learner_rank,pos_summary,tags,collins,oxford,bnc,frq,source)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)
  `).run("address","əˈdres","",620,"noun|verb","cet4 cet6",5,1,900,1200,"runtime-smoke");

  const sense=db.prepare(`
    INSERT INTO senses(word,pos,definition_en,meaning_zh,example_en,sense_rank,source)
    VALUES(?,?,?,?,?,?,?)
  `);
  sense.run("address","noun","the details of where someone lives","地址","Please write your address here.",900,"runtime-smoke");
  sense.run("address","verb","to deal with a problem or difficult situation","处理；应对","We need to address the problem.",500,"runtime-smoke");

  const alias=db.prepare("INSERT INTO zh_aliases(alias,word,rank,source) VALUES(?,?,?,?)");
  alias.run("地址","address",1200,"runtime-smoke");
  alias.run("应对","address",1180,"runtime-smoke");

  const meta=db.prepare("INSERT INTO metadata(key,value) VALUES(?,?)");
  meta.run("schema","lexiflow-core-v3");
  meta.run("word_count","1");
  meta.run("sense_count","2");
  meta.run("zh_alias_count","2");
  meta.run("prepared_at",new Date(0).toISOString());
  db.close();
}

async function jsonRequest(base,pathname,{method="GET",body=null}={}){
  const response=await fetch(`${base}${pathname}`,{
    method,
    headers:body===null?{}:{"Content-Type":"application/json"},
    body:body===null?undefined:JSON.stringify(body),
  });
  let payload={};
  try{payload=await response.json();}catch{}
  return {status:response.status,payload};
}

(async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"lexiflow-runtime-smoke-"));
  const dataDir=path.join(root,"data");
  const generatedDir=path.join(root,"generated");
  const ecdictPath=path.join(root,"ecdict.sqlite");
  const corePath=path.join(root,"core-lexicon.sqlite");
  fs.mkdirSync(dataDir,{recursive:true});
  fs.mkdirSync(generatedDir,{recursive:true});
  createEcdictFixture(ecdictPath);
  createCoreFixture(corePath);

  const [outerPort,innerPort]=await findPortPair();
  process.env.LEXIFLOW_PORT=String(outerPort);
  process.env.LEXIFLOW_INNER_PORT=String(innerPort);
  process.env.LEXIFLOW_NO_OPEN="1";
  process.env.LEXIFLOW_ECDICT_DB=ecdictPath;
  process.env.LEXIFLOW_CORE_DB=corePath;
  process.env.LEXIFLOW_DATA_DIR=dataDir;
  process.env.LEXIFLOW_GENERATED_DIR=generatedDir;
  process.env.LEXIFLOW_RUNTIME_CWD=root;

  let runtime=null;
  try{
    runtime=require("../server-runtime");
    const started=await runtime.startServer();
    const base=started.address;
    assert(base===`http://127.0.0.1:${outerPort}`,"runtime must bind the isolated outer test port");

    const lookup=await jsonRequest(base,"/api/dictionary/lookup",{
      method:"POST",body:{word:"resolve",mode:"expanded"},
    });
    assert(lookup.status===200,"local ECDICT fallback lookup must succeed over the real runtime HTTP boundary");
    assert(lookup.payload?.ok===true,"dictionary lookup payload must be successful");
    const result=lookup.payload?.result||{};
    assert(result.word==="resolve","exact lookup must preserve the requested headword");
    assert(result.dictionarySource==="ECDICT"&&result.offline===true&&result.localLookup===true,"word missing from Core must fall back to local ECDICT before any remote lookup");
    assert(result.phonetic==="/rɪˈzɒlv/","ECDICT phonetic text must be normalized for product display");
    assert(Array.isArray(result.senses)&&result.senses.length>=2,"expanded ECDICT lookup must expose the available ordered meanings");
    eq(result.senses.slice(0,2).map(sense=>sense.meaningZh),["解决","处理"],"expanded ECDICT lookup must preserve the ordered Chinese meanings");

    const smart=await jsonRequest(base,"/api/search/smart",{
      method:"POST",body:{query:"resolve"},
    });
    assert(smart.status===200&&smart.payload?.ok===true,"smart search must resolve an English word locally");
    assert(smart.payload?.result?.word==="resolve"&&smart.payload?.result?.localLookup===true,"smart search must use a local dictionary before remote fallback");
    assert(smart.payload?.result?.dictionarySource==="ECDICT","smart search must expose ECDICT when Core has no exact word");

    const chinese=await jsonRequest(base,"/api/search/smart",{
      method:"POST",body:{query:"应对"},
    });
    assert(chinese.status===200&&chinese.payload?.ok===true,"Chinese smart search must resolve through the local Core lexicon");
    const zhResult=chinese.payload?.result||{};
    assert(zhResult.word==="address","Chinese alias lookup must resolve the intended English headword");
    assert(zhResult.dictionarySource==="LexiFlow Core"&&zhResult.lookupPath==="core-zh"&&zhResult.localLookup===true,"Chinese lookup must stay on the offline Core path");
    assert(zhResult.sourceQuery==="应对"&&zhResult.normalizedQuery==="应对"&&zhResult.autoResolved===true,"Chinese lookup must retain the learner's original query identity");
    assert(zhResult.chineseSenseMatched===true,"Chinese lookup must confirm a semantic sense match rather than only a word-level alias hit");
    assert(zhResult.senses?.[0]?.pos==="verb","Chinese semantic reranking must select the verb sense even when the noun has a higher raw sense rank");
    assert(zhResult.senses?.[0]?.meaningZh==="应对","the selected learning meaning must be the learner's queried Chinese sense");
    assert(zhResult.senses?.[0]?.glossZh==="处理；应对","the original fuller Chinese gloss must be preserved after selecting the learner's intended sense");
    assert(/deal with a problem/i.test(zhResult.senses?.[0]?.senseIntentEn||""),"Chinese sense selection must preserve the matching English semantic intent");

    const firstRead=await jsonRequest(base,"/api/learning-data");
    assert(firstRead.status===200&&firstRead.payload?.ok===true,"learning-data GET must work through the real outer/inner runtime chain");
    assert(firstRead.payload?.hasStoredData===false,"isolated runtime smoke must start without persisted learning data");
    assert(Array.isArray(firstRead.payload?.data?.cards)&&firstRead.payload.data.cards.length===0,"fresh isolated learning data must contain no cards");

    const write=await jsonRequest(base,"/api/learning-data",{
      method:"POST",
      body:{data:{version:1,cards:[],activities:[],settings:{dailyGoal:3}}},
    });
    assert(write.status===200&&write.payload?.ok===true,"learning-data POST must persist through the runtime chain");
    assert(write.payload?.data?.settings?.dailyGoal===3,"learning-data persistence must preserve settings");

    const secondRead=await jsonRequest(base,"/api/learning-data");
    assert(secondRead.status===200&&secondRead.payload?.hasStoredData===true,"learning-data GET must observe the just-persisted file");
    assert(secondRead.payload?.data?.settings?.dailyGoal===3,"persisted learning settings must survive a round trip");
    assert(fs.existsSync(path.join(dataDir,"learning-data.json")),"runtime smoke persistence must stay inside the isolated temp data directory");

    console.log("Local Runtime V3 HTTP smoke checks passed.");
  }finally{
    try{runtime?.stopServer?.();}catch{}
    await new Promise(resolve=>setTimeout(resolve,80));
    fs.rmSync(root,{recursive:true,force:true});
  }
})().catch(err=>{
  console.error(err);
  process.exitCode=1;
});
