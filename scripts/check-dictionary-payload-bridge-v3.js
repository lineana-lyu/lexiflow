const fs=require("fs");
const path=require("path");
const vm=require("vm");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");

function fakeResponse(payload){
  return {
    ok:true,
    status:200,
    statusText:"OK",
    headers:new Headers({"Content-Type":"application/json"}),
    json:async()=>payload,
    clone(){return fakeResponse(payload);},
  };
}

(async()=>{
  const englishPayload={
    ok:true,
    result:{
      word:"resolve",
      localLookup:true,
      dictionarySource:"ECDICT",
      offline:true,
      audioUrl:"fixture-audio",
      senses:[{id:"resolve-1",meaningZh:"解决",exampleEn:"We resolved the issue.",exampleZh:"我们解决了这个问题。"}],
    },
  };
  const chinesePayload={
    ok:true,
    result:{
      word:"address",
      localLookup:true,
      dictionarySource:"LexiFlow Core",
      normalizedQuery:"应对",
      sourceQuery:"应对",
      audioUrl:"fixture-audio",
      senses:[{id:"address-verb",pos:"verb",meaningZh:"处理；应对",exampleEn:"We need to address the problem.",exampleZh:"我们需要应对这个问题。"}],
    },
  };

  const nativeFetch=async(input,init={})=>{
    const pathname=new URL(typeof input==="string"?input:input?.url||"", "http://127.0.0.1:4177/").pathname;
    const body=typeof init.body==="string"?JSON.parse(init.body):{};
    if(pathname==="/api/search/smart"&&body.query==="应对")return fakeResponse(chinesePayload);
    if(pathname==="/api/search/smart")return fakeResponse(englishPayload);
    return fakeResponse({ok:true});
  };

  const document={
    readyState:"complete",
    body:{appendChild(){}},
    addEventListener(){},
    querySelector(){return null;},
    querySelectorAll(){return[];},
    getElementById(){return null;},
  };
  const window={fetch:nativeFetch,dispatchEvent(){}};
  const sandbox={
    window,
    document,
    location:{href:"http://127.0.0.1:4177/",protocol:"http:"},
    console,
    URL,
    Headers,
    Response,
    CustomEvent:class CustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail;}},
    Audio:class Audio{async play(){}},
    MutationObserver:class MutationObserver{observe(){}},
    setTimeout,
    clearTimeout,
  };
  vm.createContext(sandbox);
  vm.runInContext(read("public/transport-fixes.js"),sandbox,{filename:"transport-fixes.js"});

  const transportFetch=window.fetch;
  const transport=window.LexiFlowTransportV3;
  assert(typeof transportFetch==="function","transport must install the single global fetch wrapper");
  assert(typeof transport?.registerDictionaryPayloadObserver==="function","transport dictionary observer bridge must initialize");

  vm.runInContext(read("public/example-hydration.js"),sandbox,{filename:"example-hydration.js"});
  assert(window.fetch===transportFetch,"Example Hydration must not replace the transport-owned global fetch wrapper");
  assert(typeof window.LexiFlowExampleHydration?.processDictionaryPayload==="function","Example Hydration payload processor must initialize");

  let seenEndpoint="";
  let seenPayload=null;
  transport.registerDictionaryPayloadObserver((endpoint,payload)=>{
    seenEndpoint=endpoint;
    seenPayload=payload;
    if(payload?.result)payload.result.observerMarker="same-object";
  });

  const englishResponse=await window.fetch("http://127.0.0.1:4177/api/search/smart",{
    method:"POST",body:JSON.stringify({query:"resolve"}),
  });
  const returnedEnglish=await englishResponse.json();
  assert(seenEndpoint==="/api/search/smart","transport must report the dictionary endpoint to observers");
  assert(seenPayload===returnedEnglish,"dictionary observer and response.json caller must receive the exact same payload object");
  assert(returnedEnglish===englishPayload,"non-normalized local lookup must preserve the original parsed payload identity");
  assert(returnedEnglish.result.observerMarker==="same-object","observer mutations must be visible on the caller-owned lookup payload");

  seenPayload=null;
  const chineseResponse=await window.fetch("http://127.0.0.1:4177/api/search/smart",{
    method:"POST",body:JSON.stringify({query:"应对"}),
  });
  const returnedChinese=await chineseResponse.json();
  assert(seenPayload===returnedChinese,"normalized Chinese lookup must still notify observers with the caller-owned parsed payload");
  assert(returnedChinese.result.senses[0].meaningZh==="应对","transport Chinese normalization must preserve the learner's queried sense");
  assert(returnedChinese.result.senses[0].glossZh==="处理；应对","transport Chinese normalization must retain the fuller original gloss");
  assert(returnedChinese.result.observerMarker==="same-object","observer mutation must survive Chinese normalization and reach the caller");

  console.log("Dictionary Payload Bridge V3 checks passed.");
})().catch(err=>{
  console.error(err);
  process.exitCode=1;
});
