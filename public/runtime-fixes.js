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

  // Compatibility scope is intentionally narrow: only dictionary display
  // normalization remains here. V3 learning AI requests are owned by
  // LexiFlowAiAssistV3 and must not be rewritten through a global fetch shim.
  window.fetch=async function lexiFlowRuntimeCompatibilityFetch(input,init={}){
    const endpoint=endpointOf(input),body=parseBody(init);
    if(endpoint!=="/api/dictionary/lookup"||!body)return nativeFetch(input,init);
    const response=await nativeFetch(input,init);if(!response.ok)return response;
    try{const data=await response.clone().json();return responseWithJson(response,normalizeChineseLookup(data,body));}catch{return response;}
  };

  function isGenericFallback(value){return /把“?.+”?放进一个你熟悉、具体的生活场景/.test(String(value||"").trim());}
  function makeLoadingState(){
    const el=document.createElement("div");el.className="scene-generation-state";
    el.innerHTML=`<span class="runtime-spinner" aria-hidden="true"></span><div><strong>AI 正在生成联想场景</strong><span>会自动填入下方，你也可以稍后手动修改。</span></div>`;
    return el;
  }
  function decorateAiStates(){
    document.querySelectorAll(".scene-panel.is-loading").forEach(panel=>{
      if(panel.querySelector(".scene-generation-state"))return;
      const label=panel.querySelector(".scene-panel-label"),state=makeLoadingState();
      if(label)label.insertAdjacentElement("afterend",state);else panel.prepend(state);
    });

    document.querySelectorAll(".scene-editor").forEach(editor=>{
      if(!isGenericFallback(editor.value))return;
      const panel=editor.closest(".scene-panel");if(!panel||panel.querySelector(".scene-generation-warning"))return;
      panel.classList.add("has-generic-fallback");
      const warning=document.createElement("div");warning.className="scene-generation-warning";
      warning.innerHTML=`<strong>这次没有生成出具体场景</strong><span>可以重新请求 AI，或直接写下你想看到的具体画面。</span>`;
      editor.insertAdjacentElement("beforebegin",warning);
    });

    document.querySelectorAll(".visual-image-canvas.is-generating").forEach(canvas=>{
      const stage=canvas.closest(".visual-learning-stage");if(!stage||stage.querySelector(".background-generation-note"))return;
      const commandBar=stage.querySelector(".visual-command-bar"),note=document.createElement("div");
      note.className="background-generation-note";
      note.innerHTML=`<span class="runtime-spinner" aria-hidden="true"></span><div><strong>联想图正在后台生成</strong><span>不用停在这里等待，可以先进入下一步；完成后会自动保存到这张单词卡。</span></div>`;
      if(commandBar)commandBar.insertAdjacentElement("beforebegin",note);else stage.append(note);
    });

    document.querySelectorAll(".ai-practice-prompt").forEach(panel=>{
      const shouldShow=/正在想一个更具体的问题|正在换一个/.test(panel.textContent||"");
      if(panel.classList.contains("is-generating-topic")!==shouldShow)panel.classList.toggle("is-generating-topic",shouldShow);
    });
  }

  let scheduled=false;
  function scheduleDecorate(){
    if(scheduled)return;scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;decorateAiStates();});
  }
  function startObserver(){
    const app=document.getElementById("app");if(!app)return;
    new MutationObserver(scheduleDecorate).observe(app,{childList:true,subtree:false});
    scheduleDecorate();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",startObserver,{once:true});else startObserver();
})();
