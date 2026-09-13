(() => {
  "use strict";

  const nativeFetch=window.fetch.bind(window);

  function endpointOf(input){
    try{return new URL(typeof input==="string"?input:input?.url||"",location.href).pathname;}catch{return"";}
  }
  function parseBody(init){
    if(!init||typeof init.body!=="string")return null;
    try{return JSON.parse(init.body);}catch{return null;}
  }
  function responseWithJson(original,data){
    const headers=new Headers(original.headers||{});
    headers.set("Content-Type","application/json; charset=utf-8");
    headers.delete("Content-Length");
    return new Response(JSON.stringify(data),{status:original.status,statusText:original.statusText,headers});
  }
  function syntheticJson(data,status=200){
    return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
  }
  function isChinese(value){return /[\u3400-\u9fff]/.test(String(value||""));}
  function compactChinese(value){return String(value||"").trim().replace(/[。；;，,]+$/g,"");}
  function preferredChineseMeaning(query,result){
    const normalized=compactChinese(result?.normalizedQuery||""),source=compactChinese(query);
    if(normalized&&isChinese(normalized)&&normalized.length<=12)return normalized;
    if(source&&isChinese(source)&&source.length<=12)return source;
    return"";
  }
  function normalizeChineseLookup(data,body){
    if(!data?.result||!isChinese(body?.word))return data;
    const shortMeaning=preferredChineseMeaning(body.word,data.result);if(!shortMeaning)return data;
    const senses=Array.isArray(data.result.senses)?data.result.senses:[];
    data.result.senses=senses.map((sense,index)=>{
      if(index!==0)return sense;
      const original=compactChinese(sense?.meaningZh||"");
      if(!original||original===shortMeaning)return{...sense,meaningZh:shortMeaning};
      return{...sense,meaningZh:shortMeaning,glossZh:sense.glossZh||original};
    });
    data.result.displayMeaningZh=shortMeaning;
    return data;
  }

  // This compatibility layer is transport-only. V3 stage renderers own all
  // loading, warning, and progress UI, so this file must never decorate stage DOM.
  // Legacy callers of the two learning-AI endpoints are delegated to the same
  // explicit V3 authority until app.js no longer contains those dormant callers.
  window.fetch=async function lexiFlowRuntimeCompatibilityFetch(input,init={}){
    const endpoint=endpointOf(input),body=parseBody(init);

    if(endpoint==="/api/ai/visual-scene"&&body&&window.LexiFlowAiAssistV3?.visualScene){
      try{return syntheticJson(await window.LexiFlowAiAssistV3.visualScene(body));}
      catch(err){console.error("Visual scene authority failed",err);return syntheticJson({ok:false,error:err?.message||"VISUAL_SCENE_FAILED"},Number(err?.status)||502);}
    }
    if(endpoint==="/api/ai/practice-prompt"&&body&&window.LexiFlowAiAssistV3?.practicePrompt){
      try{return syntheticJson(await window.LexiFlowAiAssistV3.practicePrompt(body));}
      catch(err){console.error("Practice prompt authority failed",err);return syntheticJson({ok:false,error:err?.message||"PRACTICE_PROMPT_FAILED"},Number(err?.status)||502);}
    }

    if(endpoint!=="/api/dictionary/lookup"||!body)return nativeFetch(input,init);
    const response=await nativeFetch(input,init);if(!response.ok)return response;
    try{const data=await response.clone().json();return responseWithJson(response,normalizeChineseLookup(data,body));}catch{return response;}
  };
})();