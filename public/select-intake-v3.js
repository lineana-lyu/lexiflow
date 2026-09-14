(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before select-intake-v3.js");

  const dataFetch=window.fetch.bind(window);
  let latestData=null;
  let saving=false;
  let queued=false;
  let repairing=false;
  const picked=new Set();

  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const uid=()=>crypto.randomUUID?crypto.randomUUID():`select-intake-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const formatPhonetic=value=>{const s=String(value||"").trim();return !s?"暂无音标":((s.startsWith("/")&&s.endsWith("/"))||(s.startsWith("[")&&s.endsWith("]")))?s:`/${s}/`;};

  function syncFromGateway(){
    try{
      const current=window.LexiFlowLearningDataGatewayV3?.current?.();
      if(!current?.cards)return false;
      latestData=core.normalizeData(current);
      return true;
    }catch{return false;}
  }

  async function refresh(force=false){
    if(!force&&syncFromGateway())return latestData;
    try{
      const response=await dataFetch("/api/learning-data",{cache:"no-store"});
      if(response.ok){
        const payload=await response.json();
        if(payload?.data)latestData=core.normalizeData(payload.data);
      }
    }catch(err){
      console.warn("Select Intake V3 refresh failed",err);
    }
    return latestData;
  }

  async function persist(next,reason){
    const normalized=core.normalizeData(next);
    const response=await dataFetch("/api/learning-data",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({data:normalized,selectIntakeAuthority:"v3",reason:String(reason||"")})
    });
    if(!response.ok)throw new Error("SAVE_FAILED");
    latestData=normalized;
    try{window.dispatchEvent(new CustomEvent("lexiflow:today-plan-data",{detail:{reason:String(reason||"")}}));}catch{}
    return normalized;
  }

  function promoteToTomorrow(card,now=new Date()){
    if(!card||core.canonicalStage(card)!=="select")return false;
    const prev={...card,learningStage:"select"};
    const today=core.dayKey(now);
    card.inboxPending=false;
    card.todaySelectedOn=today;
    card.selectedOn=today;
    card.inboxSelectedAt=card.inboxSelectedAt||now.toISOString();
    card.stage="memorize";
    card.learningStage="memorize";
    Object.assign(card,core.crossDayPatch(prev,{stage:"memorize",learningStage:"memorize"},now)||{});
    card.updatedAt=now.toISOString();
    return true;
  }

  function appendSelectActivity(data,card,now,source){
    data.activities=Array.isArray(data.activities)?data.activities:[];
    const commandId=`stage:${core.dayKey(now)}:${String(card.id)}:select`;
    if(data.activities.some(item=>String(item.commandId||"")===commandId))return;
    data.activities.push({
      id:uid(),
      type:"stage-complete",
      cardId:card.id,
      stage:"select",
      nextStage:"memorize",
      commandId,
      source:String(source||"today-picker"),
      at:now.toISOString(),
      authority:"select-intake-v3"
    });
  }

  function activeLearningCount(plan){
    return ["review","memorize","visualize","apply","select"].reduce((sum,key)=>sum+(Array.isArray(plan?.[key])?plan[key].length:0),0);
  }

  function pendingCards(plan){
    const ids=new Set(Array.isArray(plan?.inbox)?plan.inbox:[]);
    return (latestData?.cards||[]).filter(card=>ids.has(card.id)&&core.canonicalStage(card)==="select"&&card.inboxPending===true);
  }

  function prunePicked(plan){
    const valid=new Set(pendingCards(plan).map(card=>card.id));
    for(const id of [...picked])if(!valid.has(id))picked.delete(id);
    const limit=Math.max(0,Number(plan?.remainingSelectSlots||0));
    if(picked.size>limit){
      for(const id of [...picked].slice(limit))picked.delete(id);
    }
  }

  function injectStyle(){
    if(document.getElementById("lexi-select-intake-v3-style"))return;
    const style=document.createElement("style");
    style.id="lexi-select-intake-v3-style";
    style.textContent=`
      .lexi-select-intake{margin-top:14px;padding:14px;border:1px solid rgba(77,115,103,.13);border-radius:16px;background:rgba(77,115,103,.035)}
      .lexi-select-intake-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:10px}.lexi-select-intake-head strong{font-size:14px}.lexi-select-intake-head p{margin:4px 0 0;color:var(--muted);font-size:12px;line-height:1.55}.lexi-select-intake-count{white-space:nowrap;color:var(--muted);font-size:12px;font-weight:700}
      .lexi-select-intake-list{display:grid;gap:7px;max-height:330px;overflow:auto;padding-right:2px}.lexi-select-intake-item{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 11px;border-radius:13px;background:var(--surface);border:1px solid var(--line);cursor:pointer}.lexi-select-intake-item:has(input:checked){border-color:rgba(77,115,103,.36);background:rgba(77,115,103,.055)}.lexi-select-intake-item input{width:17px;height:17px;accent-color:var(--accent,#667f75)}.lexi-select-intake-copy{min-width:0}.lexi-select-intake-wordline{display:flex;align-items:baseline;gap:7px;flex-wrap:wrap}.lexi-select-intake-wordline strong{font-size:16px}.lexi-select-intake-phonetic{font-size:11px;color:var(--muted)}.lexi-select-intake-meaning{margin-top:2px;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lexi-select-intake-item .speaker{border:0;background:transparent;cursor:pointer;font-size:16px;padding:6px}
      .lexi-select-intake-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:11px}.lexi-select-intake-actions .btn.primary{min-width:210px}.lexi-select-intake-repair{margin-top:12px;padding:10px 12px;border-radius:12px;background:rgba(77,115,103,.05);color:var(--muted);font-size:12px}
      @media(max-width:700px){.lexi-select-intake-head{display:block}.lexi-select-intake-count{display:block;margin-top:6px}.lexi-select-intake-actions .btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function pickerHtml(plan){
    prunePicked(plan);
    const cards=pendingCards(plan);
    const remaining=Math.max(0,Number(plan?.remainingSelectSlots||0));
    const pickedCount=picked.size;
    return `<section class="lexi-select-intake" data-select-intake-v3="1">
      <div class="lexi-select-intake-head">
        <div><strong>选择明天要学的新词</strong><p>这些词已经完成制卡。这里只决定明天学哪些词，不再重复确认词义。</p></div>
        <span class="lexi-select-intake-count">已选 ${pickedCount} / 本次最多 ${remaining}</span>
      </div>
      <div class="lexi-select-intake-list">
        ${cards.map(card=>`<label class="lexi-select-intake-item">
          <input type="checkbox" data-select-intake-check="${esc(card.id)}" ${picked.has(card.id)?"checked":""} />
          <span class="lexi-select-intake-copy"><span class="lexi-select-intake-wordline"><strong>${esc(card.word)}</strong><span class="lexi-select-intake-phonetic">${esc(formatPhonetic(card.phonetic))}${card.pos?` · ${esc(card.pos)}`:""}</span></span><span class="lexi-select-intake-meaning">${esc(card.meaningZh||"")}</span></span>
          <button type="button" class="speaker" data-action="speak" data-word="${esc(card.word)}" data-audio="${esc(card.audioUrl||"")}" data-audios="${esc(JSON.stringify(Array.isArray(card.audioUrls)?card.audioUrls:[]))}" title="播放美式发音" aria-label="播放 ${esc(card.word)} 的美式发音">🔊</button>
        </label>`).join("")}
      </div>
      <div class="lexi-select-intake-actions">
        <button class="btn primary" type="button" data-select-intake-confirm="1" ${pickedCount?"":"disabled"}>确认选择 ${pickedCount?`${pickedCount} 个`:""} · 明天开始记忆</button>
        <button class="btn" type="button" data-tp-add-today="1">去选词制卡</button>
      </div>
    </section>`;
  }

  function decorateToday(){
    if(!latestData)return;
    const host=document.getElementById("lexi-today-plan");
    if(!host)return;
    const plan=latestData.dailyPlan||core.buildDailyPlan(latestData);
    const oldRoute=host.querySelector("[data-tp-library-pending]");
    if(oldRoute)oldRoute.style.display="none";
    const legacyConfirm=Array.from(host.querySelectorAll('[data-action="continue-learning"]')).find(button=>/确认新词/.test(button.textContent||""));
    if(legacyConfirm)legacyConfirm.style.display="none";

    let picker=host.querySelector("[data-select-intake-v3]");
    const shouldShow=activeLearningCount({...plan,select:[]})===0&&Array.isArray(plan.inbox)&&plan.inbox.length>0&&Number(plan.remainingSelectSlots||0)>0&&!(plan.select||[]).length;
    if(!shouldShow){if(picker)picker.remove();return;}

    const signature=JSON.stringify({date:plan.date,inbox:plan.inbox,remaining:plan.remainingSelectSlots,picked:[...picked].sort()});
    if(picker?.dataset.signature===signature)return;
    const holder=document.createElement("div");holder.innerHTML=pickerHtml(plan);const next=holder.firstElementChild;next.dataset.signature=signature;
    if(picker)picker.replaceWith(next);else{
      const actions=host.querySelector(".lexi-today-actions");
      if(actions)actions.insertAdjacentElement("beforebegin",next);else host.appendChild(next);
    }
  }

  async function selectBatch(){
    if(saving||!picked.size)return false;
    saving=true;
    try{
      await refresh(true);
      const now=new Date();
      const next=core.normalizeData(JSON.parse(JSON.stringify(latestData||{})));
      const plan=next.dailyPlan||core.buildDailyPlan(next,now);
      const allowed=new Set(Array.isArray(plan.inbox)?plan.inbox:[]);
      const limit=Math.max(0,Number(plan.remainingSelectSlots||0));
      const ids=[...picked].filter(id=>allowed.has(id)).slice(0,limit);
      if(!ids.length)return false;
      for(const id of ids){
        const card=next.cards.find(item=>item.id===id);
        if(!card||card.inboxPending!==true||core.canonicalStage(card)!=="select")continue;
        if(promoteToTomorrow(card,now))appendSelectActivity(next,card,now,"today-picker");
      }
      picked.clear();
      await persist(next,"today-select-batch");
      location.reload();
      return true;
    }catch(err){
      console.error("Select Intake V3 selection failed",err);
      return false;
    }finally{saving=false;}
  }

  async function repairLegacySelectedCards(){
    if(repairing||saving||!latestData)return false;
    const plan=latestData.dailyPlan||core.buildDailyPlan(latestData);
    const ids=Array.isArray(plan.select)?plan.select:[];
    if(!ids.length)return false;
    repairing=true;
    saving=true;
    try{
      const now=new Date();
      const next=core.normalizeData(JSON.parse(JSON.stringify(latestData)));
      let changed=false;
      for(const id of ids){
        const card=next.cards.find(item=>item.id===id);
        if(!card||card.inboxPending===true||core.canonicalStage(card)!=="select")continue;
        if(promoteToTomorrow(card,now)){
          appendSelectActivity(next,card,now,"legacy-selected-repair");
          changed=true;
        }
      }
      if(!changed)return false;
      await persist(next,"repair-selected-new-words");
      location.reload();
      return true;
    }catch(err){
      console.error("Select Intake V3 legacy repair failed",err);
      return false;
    }finally{
      saving=false;
      repairing=false;
    }
  }

  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      syncFromGateway();
      void repairLegacySelectedCards().then(repaired=>{if(!repaired)decorateToday();});
    });
  }

  document.addEventListener("click",event=>{
    const speaker=event.target?.closest?.('[data-select-intake-v3] [data-action="speak"]');
    if(speaker)return;
    const check=event.target?.closest?.("[data-select-intake-check]");
    if(check){
      const plan=latestData?.dailyPlan||core.buildDailyPlan(latestData||{});
      const id=String(check.dataset.selectIntakeCheck||"");
      if(check.checked){
        const limit=Math.max(0,Number(plan.remainingSelectSlots||0));
        if(picked.size>=limit&&!picked.has(id)){check.checked=false;return;}
        picked.add(id);
      }else picked.delete(id);
      decorateToday();
      return;
    }
    const confirm=event.target?.closest?.("[data-select-intake-confirm]");
    if(confirm){
      event.preventDefault();
      event.stopImmediatePropagation();
      void selectBatch();
    }
  },true);

  async function start(){
    const app=document.getElementById("app");if(!app)return;
    injectStyle();
    if(!syncFromGateway())await refresh(true);
    const repaired=await repairLegacySelectedCards();
    if(repaired)return;
    decorateToday();
    new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
    window.addEventListener("lexiflow:today-plan-data",schedule);
    window.addEventListener("focus",()=>void refresh(true).then(()=>repairLegacySelectedCards()).then(repairedNow=>{if(!repairedNow)decorateToday();}));
  }

  window.LexiFlowSelectIntakeV3=Object.freeze({
    refresh:()=>refresh(true).then(()=>{decorateToday();return latestData;}),
    selectBatch,
    repairLegacySelectedCards,
    currentSelection(){return [...picked];}
  });

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>void start(),{once:true});
  else void start();
})();
