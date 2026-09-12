(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before study-session-v3.js");

  const KEY="lexiflow-study-session-v3";
  const LEARNING_KEYS=["memorize","visualize","apply","select"];
  let data=null;
  let busy=false;
  let queued=false;
  let autoOpening=false;

  const day=()=>core.dayKey(new Date());
  const normalizeWord=value=>String(value||"").trim().toLowerCase();

  function loadSession(){
    try{
      const value=JSON.parse(localStorage.getItem(KEY)||"null");
      return value&&typeof value==="object"?value:null;
    }catch{return null;}
  }

  function saveSession(session){
    try{
      if(session)localStorage.setItem(KEY,JSON.stringify({...session,updatedAt:new Date().toISOString()}));
      else localStorage.removeItem(KEY);
    }catch{}
  }

  async function refresh(){
    const response=await fetch("/api/learning-data",{cache:"no-store"});
    if(!response.ok)throw new Error("LOAD_FAILED");
    const payload=await response.json();
    data=payload?.data?core.normalizeData(payload.data):null;
    return data;
  }

  function plan(){
    const value=data?.dailyPlan;
    if(!value||value.date!==day()||value.frozen!==true)return null;
    return value;
  }

  function plannedLearningIds(){
    const current=plan();
    if(!current)return[];
    if(Array.isArray(current.review)&&current.review.length)return[];
    const result=[];
    for(const key of LEARNING_KEYS){
      for(const id of current[key]||[]){
        if(!result.includes(id))result.push(id);
      }
    }
    return result;
  }

  function cardById(id){return data?.cards?.find(card=>card.id===id)||null;}

  function bucketForCard(card){
    if(!card)return"";
    if(card.stage==="memorize1"||card.stage==="memorize2")return"memorize";
    if(card.stage==="visualize")return"visualize";
    if(card.stage==="apply")return"apply";
    if(card.stage==="select"&&!card.inboxPending)return"select";
    return"";
  }

  function validSession(session){
    return Boolean(session&&session.version===3&&session.date===day()&&Array.isArray(session.queue));
  }

  function freshSession(){
    const queue=plannedLearningIds();
    return {
      version:3,
      date:day(),
      queue,
      activeCardId:queue[0]||"",
      activeBucket:"",
      paused:false,
      startedAt:new Date().toISOString(),
      updatedAt:new Date().toISOString(),
    };
  }

  function reconcile(session){
    if(!validSession(session))session=freshSession();
    const queue=plannedLearningIds().filter(id=>Boolean(cardById(id)));
    session.queue=queue;
    if(!queue.includes(session.activeCardId))session.activeCardId=queue[0]||"";
    const card=cardById(session.activeCardId);
    session.activeBucket=bucketForCard(card);
    return session;
  }

  function renderer(){
    const value=window.LexiFlowStudyRenderer;
    return value&&typeof value.openCard==="function"?value:null;
  }

  function currentStudyWord(){
    return normalizeWord(
      document.querySelector("[data-lexi-mem-word]")?.dataset.lexiMemWord||
      document.querySelector(".study-card-focus .target-word-text")?.textContent||
      document.querySelector(".apply-word-hero .target-word-text")?.textContent||
      document.querySelector(".apply-word-hero strong")?.textContent||""
    );
  }

  function currentStudyCardId(){
    const explicit=String(renderer()?.currentCardId?.()||"");
    if(explicit)return explicit;
    const word=currentStudyWord();
    if(!word)return"";
    const card=(data?.cards||[]).find(item=>normalizeWord(item.word)===word);
    return card?.id||"";
  }

  function showGuard(title,message){
    const app=document.getElementById("app");
    if(!app||document.getElementById("lexi-study-v3-guard"))return;
    const box=document.createElement("div");
    box.id="lexi-study-v3-guard";
    box.style.cssText="position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:24px;background:rgba(250,251,249,.96)";
    box.innerHTML=`<div style="width:min(540px,100%);padding:24px;border:1px solid var(--line);border-radius:20px;background:var(--surface);display:grid;gap:11px;text-align:center;box-shadow:var(--shadow-sm,0 10px 35px rgba(34,48,43,.08))"><strong>${String(title||"学习会话需要重新同步")}</strong><span style="color:var(--muted);font-size:13px;line-height:1.65">${String(message||"LexiFlow 已停止本次进入，避免打开错误任务。")}</span><button class="btn primary" type="button" data-study-v3-reload>重新同步 Today Plan</button></div>`;
    app.appendChild(box);
  }

  function verifyRendered(){
    const session=reconcile(loadSession());
    if(!session.activeCardId||!document.querySelector(".study-card-focus"))return;
    const actual=currentStudyCardId();
    if(!actual)return;
    if(actual===session.activeCardId)return;
    const expected=cardById(session.activeCardId);
    const opened=cardById(actual);
    showGuard(
      "学习卡片与 Today Plan 不一致",
      `Today Plan 计划的是 ${expected?.word||"当前任务"}，但页面渲染的是 ${opened?.word||"其它任务"}。本次会话已停止。`
    );
  }

  function invokeRenderer(session){
    const card=cardById(session.activeCardId);
    if(!card)return false;
    const view=renderer();
    if(!view){
      showGuard("学习渲染器还没有准备好","Today Plan 已确定下一张卡，但当前页面渲染器尚不可用。请重新同步后再试。");
      return false;
    }
    if(typeof view.hasCard==="function"&&!view.hasCard(card.id)){
      showGuard("学习卡片暂时不可用",`Today Plan 计划的是 ${card.word}，但渲染器当前没有这张卡。LexiFlow 不会自动改学其它词。`);
      return false;
    }

    window.__LEXIFLOW_PLAN_ENTRY__={cardId:card.id,word:card.word,stage:card.stage,date:day(),authority:"study-session-v3"};
    session.paused=false;
    session.activeBucket=bucketForCard(card);
    saveSession(session);

    const opened=view.openCard(card.id);
    if(opened===false){
      showGuard("学习卡片没有打开",`Today Plan 计划的是 ${card.word}，但渲染器拒绝了这张卡。不会退回旧学习队列。`);
      return false;
    }
    requestAnimationFrame(()=>requestAnimationFrame(verifyRendered));
    return true;
  }

  async function openSession({resume=true}={}){
    if(busy)return;
    busy=true;
    try{
      await refresh();
      const currentPlan=plan();
      if(!currentPlan){saveSession(null);showGuard("Today Plan 还没有准备好","请重新同步今天的学习计划后再开始。");return;}
      if((currentPlan.review||[]).length){
        saveSession(null);
        showGuard("先完成今天的 Review",`今天还有 ${currentPlan.review.length} 个已安排复习词。LexiFlow 不会让新学习越过 Review。`);
        return;
      }

      let session=resume?loadSession():null;
      session=reconcile(session);
      if(!session.activeCardId){
        saveSession(null);
        return;
      }
      session.paused=false;
      saveSession(session);
      invokeRenderer(session);
    }catch(err){
      console.error("Study Session V3 open failed",err);
      showGuard("学习数据暂时无法读取","这次没有进入学习，也不会自动算作完成。请重新同步后再试。");
    }finally{busy=false;autoOpening=false;}
  }

  function pauseSession(){
    const session=loadSession();
    if(!validSession(session))return;
    session.paused=true;
    saveSession(session);
  }

  function maybeResume(){
    if(busy||autoOpening||document.querySelector(".study-card-focus"))return;
    const session=loadSession();
    if(!validSession(session)||session.paused)return;
    const home=Array.from(document.querySelectorAll("h1,h2")).some(node=>node.textContent.trim()==="今日学习");
    if(!home)return;
    autoOpening=true;
    setTimeout(()=>void openSession({resume:true}),100);
  }

  document.addEventListener("click",event=>{
    const reload=event.target?.closest?.("[data-study-v3-reload]");
    if(reload){event.preventDefault();saveSession(null);location.reload();return;}

    const button=event.target?.closest?.('[data-action="continue-learning"]');
    if(button){
      event.preventDefault();
      event.stopImmediatePropagation();
      void openSession({resume:true});
      return;
    }

    const route=event.target?.closest?.("[data-route]");
    if(route&&document.querySelector(".study-card-focus"))pauseSession();
  },true);

  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      verifyRendered();
      maybeResume();
    });
  }

  function start(){
    const app=document.getElementById("app");
    if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
    setTimeout(maybeResume,450);
  }

  window.LexiFlowStudySessionV3=Object.freeze({
    open:()=>openSession({resume:true}),
    pause:pauseSession,
    current:()=>loadSession(),
  });

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();
