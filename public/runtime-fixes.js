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

  function blockedLegacyStageAi(endpoint){
    const operation=endpoint==="/api/ai/visual-scene"?"Visualize":"Apply";
    return syntheticJson({
      ok:false,
      code:"LEGACY_STAGE_AI_BLOCKED",
      error:"Retired stage AI caller blocked",
      userError:{
        code:"LEGACY_STAGE_AI_BLOCKED",
        title:"旧学习流程已停用",
        message:`${operation} 的 AI 辅助只能由当前 V3 学习页面上的明确操作发起。`,
      },
    },409);
  }

  // This compatibility layer is transport-only. V3 stage renderers own all
  // loading, warning, progress, and AI-assist UI. Dormant legacy app.js stage
  // callers are deliberately failed closed so merely rendering an old stage body
  // can never spend an AI request or create a first association for the learner.
  window.fetch=async function lexiFlowRuntimeCompatibilityFetch(input,init={}){
    const endpoint=endpointOf(input),body=parseBody(init);

    if((endpoint==="/api/ai/visual-scene"||endpoint==="/api/ai/practice-prompt")&&body){
      return blockedLegacyStageAi(endpoint);
    }

    if(endpoint!=="/api/dictionary/lookup"||!body)return nativeFetch(input,init);
    const response=await nativeFetch(input,init);if(!response.ok)return response;
    try{const data=await response.clone().json();return responseWithJson(response,normalizeChineseLookup(data,body));}catch{return response;}
  };
})();