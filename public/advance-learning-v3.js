(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before advance-learning-v3.js");

  let data=null;
  let queued=false;
  let refreshing=false;
  let saving=false;

  const uid=()=>crypto.randomUUID?crypto.randomUUID():`advance-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const STAGE_LABELS=Object.freeze({memorize:"Memorize",visualize:"Visualize",apply:"Apply"});
  const STAGE_ORDER=Object.freeze({memorize:1,visualize:2,apply:3});

  async function refresh(){
    if(refreshing)return data;
    refreshing=true;
    try{
      const response=await fetch("/api/learning-data",{cache:"no-store"});
      if(response.ok){const payload=await response.json();if(payload?.data)data=core.normalizeData(payload.data);}
    }catch(err){console.warn("Advance Learning V3 refresh failed",err);}
    finally{refreshing=false;}
    return data;
  }

  async function persist(next){
    const response=await fetch("/api/learning-data",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({data:core.normalizeData(next),advanceLearningAuthority:"v3"}),
    });
    if(!response.ok)throw new Error("SAVE_FAILED");
  }

  function candidateList(now=new Date()){
    if(!Array.isArray(data?.cards))return[];
    const today=core.dayKey(now);
    return data.cards
      .filter(card=>{
        if(card?.inboxPending)return false;
        const stage=core.canonicalStage(card);
        if(!Object.prototype.hasOwnProperty.call(STAGE_LABELS,stage))return false;
        if(!card.stageEligibleOn||core.valueDayKey(card.stageEligibleOn)<=today)return false;
        if(core.valueDayKey(card.earlyAllowanceUsedOn)===today||core.valueDayKey(card.lastEarlyStudiedOn)===today)return false;
        return true;
      })
      .sort((a,b)=>{
        const eligible=core.valueDayKey(a.stageEligibleOn).localeCompare(core.valueDayKey(b.stageEligibleOn));
        if(eligible)return eligible;
        const stage=(STAGE_ORDER[core.canonicalStage(a)]||99)-(STAGE_ORDER[core.canonicalStage(b)]||99);
        if(stage)return stage;
        return new Date(a.createdAt||0)-new Date(b.createdAt||0);
      });
  }

  function stageBucket(card){
    const stage=core.canonicalStage(card);
    if(stage==="memorize")return"memorize";
    if(stage==="visualize")return"visualize";
    if(stage==="apply")return"apply";
    return"";
  }

  function injectStyle(){
    if(document.getElementById("lexi-advance-learning-style"))return;
    const style=document.createElement("style");
    style.id="lexi-advance-learning-style";
    style.textContent=`.lexi-advance-learning{margin-top:14px;padding:14px 15px;border:1px dashed var(--line);border-radius:16px;display:flex;justify-content:space-between;align-items:center;gap:16px;background:rgba(120,140,132,.035)}.lexi-advance-copy{min-width:0}.lexi-advance-copy strong{display:block;font-size:13px}.lexi-advance-copy p{margin:4px 0 0;color:var(--muted);font-size:12px;line-height:1.55}.lexi-advance-learning .btn{white-space:nowrap}@media(max-width:700px){.lexi-advance-learning{align-items:stretch;flex-direction:column}.lexi-advance-learning .btn{width:100%}}`;
    document.head.appendChild(style);
  }

  function decorate(){
    injectStyle();
    const planRoot=document.getElementById("lexi-today-plan");
    const existing=document.getElementById("lexi-advance-learning");
    if(!planRoot||!data?.dailyPlan){existing?.remove();return;}

    const plan=data.dailyPlan;
    const normalDone=!core.firstPlanStage(plan);
    const candidate=normalDone?candidateList()[0]:null;
    if(!candidate){existing?.remove();return;}

    const originalDay=core.valueDayKey(candidate.stageEligibleOn);
    const stage=core.canonicalStage(candidate);
    const label=STAGE_LABELS[stage]||"下一阶段";
    const signature=`${plan.date}:${candidate.id}:${stage}:${originalDay}`;
    if(existing?.dataset.signature===signature)return;

    const box=document.createElement("div");
    box.id="lexi-advance-learning";
    box.className="lexi-advance-learning";
    box.dataset.signature=signature;
    box.innerHTML=`<div class="lexi-advance-copy"><strong>今天的计划已经完成，可以选择多学一点</strong><p>只提前推进一个阶段，不改变 Review 间隔，也不会形成明天必须补的任务。候选：<b>${esc(candidate.word)}</b> · ${esc(label)}${originalDay?`（原计划 ${esc(originalDay)}）`:""}</p></div><button class="btn" type="button" data-advance-card="${esc(candidate.id)}">提前学习 1 个阶段</button>`;
    if(existing)existing.replaceWith(box);else planRoot.appendChild(box);
  }

  async function unlock(cardId,button){
    if(saving)return false;
    saving=true;
    const original=button?.textContent||"";
    if(button){button.disabled=true;button.textContent="正在准备…";}
    try{
      await refresh();
      const now=new Date(),today=core.dayKey(now);
      const next=core.normalizeData(JSON.parse(JSON.stringify(data||{})),now);
      const candidate=candidateList(now).find(card=>card.id===cardId);
      if(!candidate)throw new Error("EARLY_CANDIDATE_NOT_AVAILABLE");
      const card=next.cards.find(item=>item.id===cardId);
      const bucket=stageBucket(card);
      if(!card||!bucket)throw new Error("EARLY_STAGE_NOT_SUPPORTED");

      card.earlyOriginalStageEligibleOn=card.stageEligibleOn||null;
      card.earlyStudyOn=today;
      card.earlyStudyAt=now.toISOString();
      card.earlyAllowanceUsedOn=today;
      card.stageEligibleOn=today;
      card.updatedAt=now.toISOString();

      next.dailyPlan=next.dailyPlan||core.buildDailyPlan(next,now);
      next.dailyPlan[bucket]=Array.isArray(next.dailyPlan[bucket])?[...next.dailyPlan[bucket]]:[];
      if(!next.dailyPlan[bucket].includes(card.id))next.dailyPlan[bucket].push(card.id);
      next.activities=Array.isArray(next.activities)?next.activities:[];
      next.activities.push({
        id:uid(),type:"early-learning-unlocked",cardId:card.id,stage:core.canonicalStage(card),
        originalStageEligibleOn:card.earlyOriginalStageEligibleOn,at:now.toISOString(),authority:"advance-learning-v3",
      });

      await persist(next);
      location.reload();
      return true;
    }catch(err){
      console.error("advance learning unlock failed",err);
      if(button){button.disabled=false;button.textContent=original;}
      return false;
    }finally{saving=false;}
  }

  document.addEventListener("click",event=>{
    const button=event.target?.closest?.("[data-advance-card]");
    if(!button)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void unlock(String(button.dataset.advanceCard||""),button);
  },true);

  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(async()=>{
      queued=false;
      await refresh();
      decorate();
    });
  }

  function start(){
    const app=document.getElementById("app");
    if(!app)return;
    void refresh().then(decorate);
    new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
  }

  window.LexiFlowAdvanceLearningV3=Object.freeze({
    refresh:async()=>{await refresh();decorate();return data;},
    unlock(cardId){return unlock(String(cardId||""),null);}
  });

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();
