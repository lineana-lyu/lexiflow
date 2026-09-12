(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before learning-data-gateway-v3.js");

  const upstreamFetch=window.fetch.bind(window);
  let latestData=null;

  function endpointOf(input){
    try{return new URL(typeof input==="string"?input:input?.url||"",location.href).pathname;}catch{return"";}
  }

  function parseBody(init){
    if(!init||typeof init.body!=="string")return null;
    try{return JSON.parse(init.body);}catch{return null;}
  }

  function responseWithJson(original,payload){
    const headers=new Headers(original.headers||{});
    headers.set("Content-Type","application/json; charset=utf-8");
    headers.delete("Content-Length");
    return new Response(JSON.stringify(payload),{status:original.status,statusText:original.statusText,headers});
  }

  function requestWithJson(init,body){
    return {...(init||{}),headers:{"Content-Type":"application/json",...((init&&init.headers)||{})},body:JSON.stringify(body)};
  }

  function hasChinese(value){return /[\u3400-\u9fff]/.test(String(value||""));}
  function clean(value){return String(value||"").trim().replace(/[。；;，,]+$/g,"");}
  function shouldShortenMeaning(source,meaning){
    const q=clean(source),current=clean(meaning);
    if(!q||!current||!hasChinese(q)||q.length>10||current===q)return false;
    if(!current.includes(q)||current.length>q.length+12)return false;
    return current.endsWith(q)||current.startsWith(q)||/(用来|用于|用的|指的是|指|即|一种|一个|专门)/.test(current);
  }

  function repairLegacyMeanings(input){
    if(!input||!Array.isArray(input.cards))return{data:input,changed:false};
    let changed=false;
    const cards=input.cards.map(card=>{
      if(!card||typeof card!=="object")return card;
      const source=clean(card.sourceQuery||""),meaning=clean(card.meaningZh||"");
      if(!shouldShortenMeaning(source,meaning))return card;
      changed=true;
      return {...card,meaningZh:source,glossZh:card.glossZh||meaning};
    });
    return{data:changed?{...input,cards}:input,changed};
  }

  function previousCard(id){return latestData?.cards?.find(card=>String(card.id)===String(id))||null;}

  function normalizeOutgoing(body){
    if(!body?.data||!Array.isArray(body.data.cards))return body;
    const repaired=repairLegacyMeanings(body.data);
    const data=core.normalizeData(repaired.data);
    const now=new Date();
    for(const card of data.cards){
      const patch=core.crossDayPatch(previousCard(card.id),card,now);
      if(patch)Object.assign(card,patch);
    }
    data.dailyPlan=core.buildDailyPlan(data,now);
    latestData=JSON.parse(JSON.stringify(data));
    return {...body,data,learningDataAuthority:body.learningDataAuthority||"gateway-v3"};
  }

  async function persistMigration(data){
    try{
      const body=normalizeOutgoing({data,migrationAuthority:"legacy-meaning-v3"});
      await upstreamFetch("/api/learning-data",requestWithJson({method:"POST"},body));
    }catch(err){console.warn("learning-data migration persistence failed",err);}
  }

  window.fetch=async function lexiFlowLearningDataGatewayV3(input,init={}){
    const endpoint=endpointOf(input);
    if(endpoint!=="/api/learning-data")return upstreamFetch(input,init);

    const method=String(init?.method||"GET").toUpperCase();
    if(method==="POST"){
      const body=normalizeOutgoing(parseBody(init));
      return upstreamFetch(input,requestWithJson(init,body));
    }

    const response=await upstreamFetch(input,init);
    if(method!=="GET"||!response.ok)return response;
    try{
      const payload=await response.clone().json();
      if(!payload?.data)return response;
      const repaired=repairLegacyMeanings(payload.data);
      payload.data=core.normalizeData(repaired.data);
      latestData=JSON.parse(JSON.stringify(payload.data));
      if(repaired.changed)queueMicrotask(()=>void persistMigration(payload.data));
      return responseWithJson(response,payload);
    }catch{return response;}
  };

  window.LexiFlowLearningDataGatewayV3=Object.freeze({
    current(){return latestData?JSON.parse(JSON.stringify(latestData)):null;},
    normalize(data){return core.normalizeData(repairLegacyMeanings(data).data);}
  });
})();
