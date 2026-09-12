(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before study-entry-v3.js");

  const EXPECTED_KEY="lexiflow-study-entry-v3";
  let latestData=null;
  let checking=false;
  let bypassOnce=false;
  let queued=false;

  const day=()=>core.dayKey(new Date());
  const normalizeWord=value=>String(value||"").trim().toLowerCase();

  async function refresh(){
    const response=await fetch("/api/learning-data",{cache:"no-store"});
    if(!response.ok)throw new Error("LOAD_FAILED");
    const payload=await response.json();
    latestData=payload?.data?core.normalizeData(payload.data):null;
    return latestData;
  }

  function firstPlanLearningId(data){
    const plan=data?.dailyPlan;
    if(!plan||plan.date!==day()||plan.frozen!==true)return"";
    for(const key of ["memorize","visualize","apply","select"]){
      const id=Array.isArray(plan[key])?plan[key][0]:"";
      if(id)return id;
    }
    return"";
  }

  function legacyFirstActiveId(data){
    const card=(data?.cards||[]).find(item=>item.initialReviewPending||(item.stage!=="review"&&item.stage!=="mastered"));
    return card?.id||"";
  }

  function rememberExpected(card){
    try{
      if(!card){sessionStorage.removeItem(EXPECTED_KEY);return;}
      sessionStorage.setItem(EXPECTED_KEY,JSON.stringify({date:day(),cardId:card.id,word:card.word,stage:card.stage,createdAt:new Date().toISOString()}));
    }catch{}
  }

  function loadExpected(){
    try{
      const value=JSON.parse(sessionStorage.getItem(EXPECTED_KEY)||"null");
      return value?.date===day()?value:null;
    }catch{return null;}
  }

  function clearExpected(){try{sessionStorage.removeItem(EXPECTED_KEY);}catch{}}

  function currentStudyWord(){
    return normalizeWord(
      document.querySelector("[data-lexi-mem-word]")?.dataset.lexiMemWord||
      document.querySelector(".study-card-focus .target-word-text")?.textContent||
      document.querySelector(".apply-word-hero .target-word-text")?.textContent||
      document.querySelector(".apply-word-hero strong")?.textContent||""
    );
  }

  function showMismatch(expected,actual){
    const host=document.querySelector(".study-card-focus");
    if(!host||host.querySelector(".lexi-study-entry-guard"))return;
    host.style.pointerEvents="none";
    const box=document.createElement("div");
    box.className="lexi-study-entry-guard";
    box.style.cssText="position:absolute;inset:0;z-index:40;display:grid;place-items:center;padding:24px;background:rgba(250,251,249,.96);pointer-events:auto";
    box.innerHTML=`<div style="width:min(520px,100%);padding:22px;border:1px solid var(--line);border-radius:18px;background:var(--surface);display:grid;gap:10px;text-align:center"><strong>学习队列刚刚发生了变化</strong><span style="color:var(--muted);font-size:13px;line-height:1.6">Today Plan 计划的是 ${String(expected?.word||"当前任务")}，但旧学习界面打开了 ${String(actual||"其它任务")}。LexiFlow 已停止本次进入，避免学错顺序。</span><button class="btn primary" type="button" data-study-entry-reload>重新同步 Today Plan</button></div>`;
    const style=getComputedStyle(host);if(style.position==="static")host.style.position="relative";
    host.appendChild(box);
  }

  async function interceptContinue(event,button){
    if(bypassOnce){bypassOnce=false;return;}
    if(checking){event.preventDefault();event.stopImmediatePropagation();return;}
    event.preventDefault();event.stopImmediatePropagation();
    checking=true;
    const original=button.textContent;
    button.disabled=true;
    button.textContent="正在确认今日任务…";
    try{
      const data=await refresh();
      const expectedId=firstPlanLearningId(data);
      if(!expectedId){clearExpected();location.reload();return;}
      const legacyId=legacyFirstActiveId(data);
      if(legacyId!==expectedId){
        console.error("DailyPlan/legacy study entry mismatch",{expectedId,legacyId});
        clearExpected();location.reload();return;
      }
      const card=data.cards.find(item=>item.id===expectedId);
      rememberExpected(card);
      window.__LEXIFLOW_PLAN_ENTRY__={cardId:card?.id||"",word:card?.word||"",stage:card?.stage||"",date:day()};
      bypassOnce=true;
      button.disabled=false;
      button.textContent=original;
      button.click();
    }catch(err){
      console.error("study entry guard failed",err);
      button.disabled=false;
      button.textContent=original;
    }finally{checking=false;}
  }

  function verifyRenderedStudy(){
    const expected=loadExpected();
    if(!expected)return;
    const host=document.querySelector(".study-card-focus");
    if(!host)return;
    const actual=currentStudyWord();
    if(!actual)return;
    if(actual===normalizeWord(expected.word))return;
    showMismatch(expected,actual);
  }

  document.addEventListener("click",event=>{
    const reload=event.target?.closest?.("[data-study-entry-reload]");
    if(reload){event.preventDefault();clearExpected();location.reload();return;}
    const button=event.target?.closest?.('[data-action="continue-learning"]');
    if(button)void interceptContinue(event,button);
  },true);

  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;verifyRenderedStudy();});
  }

  function start(){
    const app=document.getElementById("app");
    if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
    schedule();
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();