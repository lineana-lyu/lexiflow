(() => {
  "use strict";

  const KEY = "lexiflow-review-session-state-v2";
  const core = window.LexiFlowLearningCore;
  let data = null;
  let queued = false;

  const dayKey = (input = new Date()) => core?.dayKey ? core.dayKey(input) : `${input.getFullYear()}-${String(input.getMonth()+1).padStart(2,"0")}-${String(input.getDate()).padStart(2,"0")}`;
  const load = () => { try{ const value=JSON.parse(localStorage.getItem(KEY)||"null"); return value&&typeof value==="object"?value:null; }catch{return null;} };
  const save = value => { try{ value ? localStorage.setItem(KEY,JSON.stringify(value)) : localStorage.removeItem(KEY); }catch{} };

  async function refresh(){
    try{
      const response = await fetch("/api/learning-data",{cache:"no-store"});
      if(response.ok){ const payload=await response.json(); if(payload?.data) data=payload.data; }
    }catch{}
  }

  function currentCard(){
    if(!Array.isArray(data?.cards)) return null;
    const word = String(
      document.querySelector("[data-lexi-r2-word]")?.dataset.lexiR2Word ||
      document.querySelector(".review-depth-stage .target-word-text")?.textContent || ""
    ).trim().toLowerCase();
    if(!word) return null;
    return data.cards.find(card=>String(card.word||"").trim().toLowerCase()===word) || null;
  }

  function newSession(){
    const queue = Array.isArray(data?.dailyPlan?.review) ? [...data.dailyPlan.review] : [];
    return {
      date:dayKey(),
      queue,
      repairTail:[],
      attempted:[],
      activeCardId:null,
      activeKind:null,
      createdAt:new Date().toISOString(),
      updatedAt:new Date().toISOString(),
    };
  }

  function session(){
    const existing=load();
    if(existing?.date===dayKey()) return existing;
    const next=newSession();
    save(next);
    return next;
  }

  function attemptKey(card, s){
    const repair = card?.memoryState === "review_again" && card?.reviewAgainFailedOn === dayKey();
    return `${card?.id||"unknown"}:${repair?"repair":"normal"}`;
  }

  function ensureCardInQueue(s, card){
    if(!card) return;
    if(!s.queue.includes(card.id) && !s.repairTail.includes(card.id)) s.queue.push(card.id);
  }

  function markAttempt(card, quality){
    if(!card) return;
    const s=session();
    ensureCardInQueue(s,card);
    const key=attemptKey(card,s);
    if(!s.attempted.includes(key)) s.attempted.push(key);
    const wasRepair = key.endsWith(":repair");
    if(quality === "again" && !wasRepair && !s.repairTail.includes(card.id)) s.repairTail.push(card.id);
    s.activeCardId = card.id;
    s.activeKind = wasRepair ? "repair" : "normal";
    s.updatedAt = new Date().toISOString();
    save(s);
  }

  function progressFor(card){
    const s=session();
    ensureCardInQueue(s,card);
    const activeKey=attemptKey(card,s);
    const already=s.attempted.includes(activeKey);
    const total=Math.max(1,s.queue.length+s.repairTail.length);
    const done=s.attempted.length;
    const current=Math.min(total,already?done:done+1);
    s.activeCardId=card.id;
    s.activeKind=activeKey.endsWith(":repair")?"repair":"normal";
    s.updatedAt=new Date().toISOString();
    save(s);
    return {current,total,repair:s.activeKind==="repair"};
  }

  function injectStyle(){
    if(document.getElementById("lexi-review-session-state-style")) return;
    const style=document.createElement("style");
    style.id="lexi-review-session-state-style";
    style.textContent=`.lexi-review-session-progress{width:min(650px,100%);margin:0 auto 10px;display:flex;justify-content:space-between;gap:12px;align-items:center;color:var(--muted);font-size:12px}.lexi-review-session-progress strong{color:var(--text);font-size:12px}.lexi-review-session-progress span:last-child{white-space:nowrap}.lexi-review-session-progress.is-repair strong{color:var(--text)}`;
    document.head.appendChild(style);
  }

  function decorate(){
    injectStyle();
    const stage=document.querySelector(".review-depth-stage");
    if(!stage) return;
    const card=currentCard();
    if(!card) return;
    const p=progressFor(card);
    let row=stage.querySelector(".lexi-review-session-progress");
    if(!row){
      row=document.createElement("div");
      row.className="lexi-review-session-progress";
      stage.insertAdjacentElement("afterbegin",row);
    }
    row.classList.toggle("is-repair",p.repair);
    row.innerHTML=`<strong>${p.repair?"当天修复复测":"本轮主动回忆"}</strong><span>${p.current} / ${p.total}</span>`;
  }

  function maybeClearCompleted(){
    if(document.querySelector(".review-depth-stage")) return;
    const s=load();
    if(!s || s.date!==dayKey()) return;
    const pending = [...new Set([...(s.queue||[]),...(s.repairTail||[])])].some(id=>{
      const card=data?.cards?.find(item=>item.id===id);
      return card && core?.isDue ? core.isDue(card,new Date()) : Boolean(card?.nextReviewAt && new Date(card.nextReviewAt).getTime()<=Date.now());
    });
    if(!pending) save(null);
  }

  document.addEventListener("click",event=>{
    const start=event.target?.closest?.('[data-action="start-review"]');
    if(start){
      const existing=load();
      if(!existing || existing.date!==dayKey()) save(newSession());
      return;
    }

    const rate=event.target?.closest?.('[data-action="review-rate"]');
    if(rate){
      const card=currentCard();
      if(card) markAttempt(card,String(rate.dataset.quality||""));
      return;
    }

    const initial=event.target?.closest?.('[data-action="initial-review-rate"]');
    if(initial){
      const card=currentCard();
      if(card) markAttempt(card,String(initial.dataset.quality||""));
    }
  },true);

  function schedule(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(async()=>{
      queued=false;
      await refresh();
      decorate();
      maybeClearCompleted();
    });
  }

  function start(){
    const app=document.getElementById("app");
    if(!app) return;
    injectStyle();
    void refresh().then(()=>{decorate();maybeClearCompleted();});
    new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();