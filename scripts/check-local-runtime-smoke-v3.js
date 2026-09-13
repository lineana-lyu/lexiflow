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
  const missingCorePath=path.join(root,"missing-core.sqlite");
  fs.mkdirSync(dataDir,{recursive:true});
  fs.mkdirSync(generatedDir,{recursive:true});
  createEcdictFixture(ecdictPath);

  const [outerPort,innerPort]=await findPortPair();
  process.env.LEXIFLOW_PORT=String(outerPort);
  process.env.LEXIFLOW_INNER_PORT=String(innerPort);
  process.env.LEXIFLOW_NO_OPEN="1";
  process.env.LEXIFLOW_ECDICT_DB=ecdictPath;
  process.env.LEXIFLOW_CORE_DB=missingCorePath;
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
      method:"POST",body:{word:"address",mode:"expanded"},
    });
    assert(lookup.status===200,"local ECDICT exact lookup must succeed over the real runtime HTTP boundary");
    assert(lookup.payload?.ok===true,"dictionary lookup payload must be successful");
    const result=lookup.payload?.result||{};
    assert(result.word==="address","exact lookup must preserve the requested headword");
    assert(result.dictionarySource==="ECDICT"&&result.offline===true&&result.localLookup===true,"exact lookup must stay local-first and identify ECDICT");
    assert(result.phonetic==="/əˈdres/","ECDICT phonetic text must be normalized for product display");
    assert(Array.isArray(result.senses)&&result.senses.length>=2,"expanded local lookup must expose multiple available meanings");
    eq(result.senses.slice(0,2).map(sense=>sense.meaningZh),["处理","应对"],"expanded lookup must preserve the ordered Chinese meanings from ECDICT");

    const smart=await jsonRequest(base,"/api/search/smart",{
      method:"POST",body:{query:"address"},
    });
    assert(smart.status===200&&smart.payload?.ok===true,"smart search must resolve an English word locally");
    assert(smart.payload?.result?.word==="address"&&smart.payload?.result?.localLookup===true,"smart search must use the local dictionary before remote fallback");
    assert(smart.payload?.result?.dictionarySource==="ECDICT","smart search must expose the local dictionary source");

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
