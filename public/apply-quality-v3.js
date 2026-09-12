(() => {
  "use strict";

  const STORAGE_KEY="lexiflow-apply-quality-v3";
  const previousFetch=window.fetch.bind(window);
  let latestAudit=null;
  let latestData=null;
  let queued=false;

  const normalize=value=>String(value||"").trim();
  const lower=value=>normalize(value).toLowerCase();
  const hasChinese=value=>/[\u3400-\u9fff]/.test(String(value||""));
  const copyNorm=value=>normalize(value)
    .toLowerCase()
    .replace(/[’‘]/g,"'")
    .replace(/[“”]/g,'"')
    .replace(/[.,!?;:()[\]{}"']/g," ")
    .replace(/\s+/g," ")
    .trim();

  function endpointOf(input){
    try{return new URL(typeof input==="string"?input:input?.url||"",location.href).pathname;}catch{return"";}
  }
  function parseBody(init){
    if(!init||typeof init.body!=="string")return null;
    try{return JSON.parse(init.body);}catch{return null;}
  }
  function jsonResponse(original,payload){
    const headers=new Headers(original.headers||{});
    headers.set("Content-Type","application/json; charset=utf-8");
    headers.delete("Content-Length");
    return new Response(JSON.stringify(payload),{status:original.status,statusText:original.statusText,headers});
  }

  function loadStore(){
    try{
      const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");
      return value&&typeof value==="object"?value:{};
    }catch{return{};}
  }
  function saveStore(store){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(store));}catch{}}
  function keyOf(word,meaning){return `${lower(word)}|${normalize(meaning)}`;}

  function currentCardId(){
    return String(window.LexiFlowStudyRenderer?.currentCardId?.()||"");
  }
  function currentCard(){
    const id=currentCardId();
    if(!id||!Array.isArray(latestData?.cards))return null;
    return latestData.cards.find(card=>String(card.id)===id)||null;
  }
  function currentSentence(){return normalize(document.getElementById("apply-text")?.value||"");}
  function isReferenceExampleCopy(){
    const sentence=copyNorm(currentSentence());
    const example=copyNorm(currentCard()?.exampleEn||"");
    return Boolean(sentence&&example&&sentence===example);
  }

  function recordAudit(body,feedback){
    const word=normalize(body?.word),meaning=normalize(body?.meaningZh),sentence=normalize(body?.sentence);
    if(!word||!sentence||!feedback)return null;
    const suggestion=normalize(feedback.suggestion);
    const approved=feedback.approved!==false&&feedback.level==="good";
    const inputLanguage=feedback.inputLanguage==="zh"||hasChinese(sentence)?"zh":"en";
    const key=keyOf(word,meaning);
    const store=loadStore();
    const previous=store[key]||{};
    const originalPass=Boolean(approved&&inputLanguage==="en"&&!suggestion);
    const suggestionPass=Boolean(approved&&suggestion);
    let round=Number(previous.round||0);

    if(originalPass){
      round=0;
    }else if(inputLanguage==="en"){
      if(normalize(previous.lastFailedInput)!==sentence)round=Math.min(3,Math.max(0,round)+1);
      else round=Math.max(1,round);
    }

    const audit={
      key,word,meaning,inputSentence:sentence,inputLanguage,
      originalPass,suggestionPass,suggestion,
      approved:Boolean(approved),level:String(feedback.level||"warn"),
      round,
      lastFailedInput:originalPass?"":sentence,
      auditedAt:new Date().toISOString(),
    };
    store[key]=audit;
    saveStore(store);
    latestAudit=audit;
    window.__LEXIFLOW_LAST_APPLY_QUALITY__=audit;
    return audit;
  }

  function progressiveFeedback(payload,body){
    const feedback=payload?.feedback;
    if(!feedback||!body?.sentence)return payload;
    const audit=recordAudit(body,feedback);
    if(!audit||audit.originalPass||audit.inputLanguage!=="en")return payload;
    if(audit.round>=3)return {...payload,feedback:{...feedback,feedbackRound:3}};

    const tips=Array.isArray(feedback.tips)?feedback.tips.map(String).filter(Boolean):[];
    const round=audit.round;
    const fallback=round===1
      ? "先检查目标词是否真的表达了当前词义，以及句子主干是否完整。"
      : "再检查动词形式、搭配和语序；先自己改完，再让 AI 复查。";
    const selected=round===1?tips.slice(0,1):tips.slice(0,2);
    if(!selected.length)selected.push(fallback);
    return {
      ...payload,
      feedback:{
        ...feedback,
        approved:false,
        level:"warn",
        suggestion:"",
        feedbackRound:round,
        correctionHeldBack:true,
        title:round===1?"先自己改一次":"再自己改一次",
        tips:selected,
      },
    };
  }

  window.fetch=async function lexiFlowApplyQualityFetch(input,init={}){
    const endpoint=endpointOf(input),method=String(init?.method||"GET").toUpperCase();
    const response=await previousFetch(input,init);

    if(endpoint==="/api/learning-data"&&response.ok){
      try{
        if(method==="GET"){
          const payload=await response.clone().json();
          if(payload?.data)latestData=payload.data;
        }else if(method==="POST"){
          const body=parseBody(init);
          if(body?.data)latestData=body.data;
        }
      }catch{}
      return response;
    }

    if(endpoint!=="/api/ai/text"||!response.ok)return response;
    const body=parseBody(init);
    if(!body?.sentence)return response;
    try{
      const payload=await response.clone().json();
      return jsonResponse(response,progressiveFeedback(payload,body));
    }catch{return response;}
  };

  function currentWord(){
    return normalize(document.querySelector(".apply-word-hero .target-word-text,.study-card-focus .target-word-text")?.textContent||"");
  }
  function currentMeaning(){
    const hero=document.querySelector(".apply-word-hero");
    if(!hero)return"";
    const span=Array.from(hero.children).find(node=>node.tagName==="SPAN");
    return normalize(span?.textContent||"");
  }

  function auditForCurrent(){
    const word=currentWord(),meaning=currentMeaning();
    if(!word)return latestAudit;
    const store=loadStore();
    return store[keyOf(word,meaning)]||latestAudit;
  }

  function qualityState(){
    const sentence=currentSentence();
    if(isReferenceExampleCopy())return{allowed:false,message:"这句话和词典参考例句相同。Apply 的目标是把单词用到你自己的表达里，请换一个真实场景再写一句。",referenceCopy:true};
    const audit=auditForCurrent();
    if(!sentence)return{allowed:false,message:"先写一句英文，并完成 AI 检查。"};
    if(!audit)return{allowed:false,message:"先点击“检查表达”，通过检查后再进入复习。"};
    if(sentence===normalize(audit.inputSentence)&&audit.originalPass)return{allowed:true,message:""};
    if(sentence===normalize(audit.suggestion)&&audit.suggestionPass)return{allowed:true,message:""};
    if(sentence!==normalize(audit.inputSentence)&&sentence!==normalize(audit.suggestion))return{allowed:false,message:"你修改了句子，需要重新检查后再继续。"};
    if(audit.inputLanguage==="zh")return{allowed:false,message:"最终需要采用或写出通过检查的英文句子。"};
    if(audit.round<3)return{allowed:false,message:`第 ${audit.round} 轮反馈先不给完整答案。请根据提示自己修改，再重新检查。`};
    return{allowed:false,message:"原句还没有通过。请采用已通过的修改建议，或继续自己修改并重新检查。"};
  }

  function warning(message){
    const composer=document.querySelector(".apply-composer");
    if(!composer)return;
    let box=document.querySelector(".lexi-apply-quality-warning");
    if(!message){box?.remove();return;}
    if(!box){
      box=document.createElement("div");
      box.className="lexi-apply-quality-warning";
      box.style.cssText="margin-top:10px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:rgba(120,140,132,.04);color:var(--muted);font-size:13px;line-height:1.6";
      composer.insertAdjacentElement("afterend",box);
    }
    box.textContent=message;
  }

  function decorate(){
    const input=document.getElementById("apply-text");
    if(!input)return;
    const state=qualityState();
    document.querySelectorAll('[data-action="pass-apply"]').forEach(button=>{
      button.disabled=!state.allowed;
      button.title=state.allowed?"":state.message;
      if(!state.allowed&&button.textContent.includes("保留原句"))button.textContent="原句未通过，不能继续";
    });
    const audit=auditForCurrent();
    const panel=document.querySelector(".ai-feedback-panel.warn");
    if(panel&&audit?.inputLanguage==="en"&&audit.round>0&&audit.round<3){
      let note=panel.querySelector(".lexi-apply-round-note");
      if(!note){note=document.createElement("div");note.className="lexi-apply-round-note";note.style.cssText="font-size:12px;color:var(--muted);line-height:1.6;margin-top:8px";panel.appendChild(note);}
      note.textContent=`提示第 ${audit.round} / 3 轮：先自己修改；第 3 次仍未通过时才显示完整修改建议。`;
    }
    if(state.allowed)warning("");
  }

  document.addEventListener("click",event=>{
    const submit=event.target?.closest?.('[data-action="submit-apply"]');
    if(submit&&isReferenceExampleCopy()){
      event.preventDefault();
      event.stopImmediatePropagation();
      warning("这句话和词典参考例句相同。请换一个与你自己有关的场景，再用目标词写一句。");
      document.getElementById("apply-text")?.focus();
      return;
    }

    const button=event.target?.closest?.('[data-action="pass-apply"]');
    if(!button)return;
    const state=qualityState();
    if(state.allowed)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    warning(state.message);
    document.getElementById("apply-text")?.focus();
  },true);

  document.addEventListener("input",event=>{
    if(event.target?.id!=="apply-text")return;
    warning("");
    schedule();
  },true);

  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;decorate();});
  }
  function start(){
    const app=document.getElementById("app");
    if(!app)return;
    decorate();
    new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();