(() => {
  "use strict";

  const core = window.LexiFlowLearningCore;
  if(!core) throw new Error("LexiFlowLearningCore must load before today-plan-v2.js");

  const previousFetch = window.fetch.bind(window);
  let latestData = null;
  let scheduled = false;
  let saving = false;
  let libraryFilter = "all";

  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `plan-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const setText = (node,text) => { if(node && node.textContent !== text) node.textContent = text; };

  function endpointOf(input){
    try{return new URL(typeof input === "string" ? input : input?.url || "", location.href).pathname;}catch{return "";}
  }
  function parseBody(init){
    if(!init || typeof init.body !== "string") return null;
    try{return JSON.parse(init.body);}catch{return null;}
  }
  function jsonResponse(original,payload){
    const headers=new Headers(original.headers||{});
    headers.set("Content-Type","application/json; charset=utf-8");
    headers.delete("Content-Length");
    return new Response(JSON.stringify(payload),{status:original.status,statusText:original.statusText,headers});
  }
  function withJson(init,body){
    return {...(init||{}),headers:{"Content-Type":"application/json",...((init&&init.headers)||{})},body:JSON.stringify(body)};
  }

  window.fetch = async function lexiFlowTodayPlanFetch(input,init={}){
    const endpoint=endpointOf(input), method=String(init?.method||"GET").toUpperCase();
    if(endpoint==="/api/learning-data"&&method==="POST"){
      const body=parseBody(init);
      if(body?.data?.cards){
        const known=new Set((latestData?.cards||[]).map(card=>card.id));
        const normalized=core.normalizeData(body.data);
        const addedPending=normalized.cards.some(card=>card.stage==="select"&&card.inboxPending===true&&!known.has(card.id));
        const response=await previousFetch(input,withJson(init,{...body,data:normalized}));
        if(response.ok){latestData=normalized;if(addedPending)setTimeout(()=>location.reload(),260);}
        return response;
      }
    }

    const response=await previousFetch(input,init);
    if(endpoint==="/api/learning-data"&&method==="GET"&&response.ok){
      try{
        const payload=await response.clone().json();
        if(payload?.data){
          payload.data=core.normalizeData(payload.data);
          latestData=JSON.parse(JSON.stringify(payload.data));
          return jsonResponse(response,payload);
        }
      }catch{}
    }
    return response;
  };

  async function refresh(){
    try{
      const response=await previousFetch("/api/learning-data",{cache:"no-store"});
      if(response.ok){const payload=await response.json();if(payload?.data)latestData=core.normalizeData(payload.data);}
    }catch{}
    return latestData;
  }

  async function persist(next){
    const normalized=core.normalizeData(next);
    const response=await previousFetch("/api/learning-data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data:normalized})});
    if(!response.ok)throw new Error("SAVE_FAILED");
    latestData=normalized;
  }

  function cardById(id){return latestData?.cards?.find(card=>card.id===id)||null;}

  function injectStyle(){
    if(document.getElementById("lexi-today-plan-style"))return;
    const style=document.createElement("style");style.id="lexi-today-plan-style";
    style.textContent=`
      .lexi-home-legacy-summary{display:none!important}
      .lexi-today-plan{margin:16px 0 0;padding:18px 20px;border:1px solid var(--line);border-radius:20px;background:var(--surface);box-shadow:var(--shadow-sm,0 8px 30px rgba(34,48,43,.035))}
      .lexi-today-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:start}.lexi-today-title-line{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.lexi-today-head h2{margin:0;font-size:20px;letter-spacing:-.01em}.lexi-today-kicker{font-size:10px;font-weight:800;letter-spacing:.12em;color:var(--muted)}.lexi-today-progress-number{font-size:13px;color:var(--muted);font-weight:700;white-space:nowrap}.lexi-today-note{margin:5px 0 0;color:var(--muted);font-size:12px;line-height:1.55}.lexi-today-progress{height:6px;border-radius:999px;background:rgba(120,140,132,.09);overflow:hidden;margin:13px 0 14px}.lexi-today-progress>i{display:block;height:100%;border-radius:inherit;background:var(--accent,#667f75);transition:width .25s ease}
      .lexi-plan-rows{display:grid;gap:6px}.lexi-plan-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:12px;align-items:center;padding:9px 11px;border-radius:13px;background:rgba(120,140,132,.04)}.lexi-plan-row.is-next{background:rgba(120,140,132,.075)}.lexi-plan-name{font-size:13px;font-weight:750}.lexi-plan-count{font-size:13px;font-weight:800}.lexi-plan-next{font-size:10px;color:var(--muted);min-width:38px;text-align:right}.lexi-plan-empty{padding:4px 0 2px;font-size:13px;color:var(--muted)}.lexi-today-actions{display:flex;gap:9px;align-items:center;margin-top:14px;flex-wrap:wrap}.lexi-today-actions .btn.primary{min-width:150px}.lexi-today-footnote{font-size:11px;color:var(--muted)}
      .lexi-library-filter{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:12px 0 14px}.lexi-library-filter button{border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:7px 11px;font:inherit;font-size:12px;color:var(--muted);cursor:pointer}.lexi-library-filter button.is-active{background:rgba(77,115,103,.08);border-color:rgba(77,115,103,.28);color:var(--text);font-weight:750}.lexi-library-filter button span{margin-left:5px;opacity:.72}.lexi-library-pending-note{margin-left:auto;font-size:11px;color:var(--muted)}.lexi-library-today-action{margin-right:6px}
      @media(max-width:760px){.lexi-today-head{grid-template-columns:1fr}.lexi-today-progress-number{justify-self:start}.lexi-plan-row{grid-template-columns:1fr auto}.lexi-plan-next{display:none}.lexi-today-actions .btn{width:100%}.lexi-library-pending-note{width:100%;margin-left:0}}
    `;document.head.appendChild(style);
  }

  function planSignature(plan){
    return JSON.stringify({date:plan.date,review:plan.review,memorize:plan.memorize,visualize:plan.visualize,apply:plan.apply,select:plan.select,inbox:plan.inbox,goal:plan.selectGoal,remaining:plan.remainingSelectSlots,total:plan.taskTotal,done:plan.taskCompleted});
  }
  function remainingCount(plan){return ["review","memorize","visualize","apply","select"].reduce((sum,key)=>sum+(Array.isArray(plan?.[key])?plan[key].length:0),0);}
  function rowHtml(key,name,count,next){
    if(!count)return "";
    return `<div class="lexi-plan-row ${next===key?"is-next":""}" data-plan-key="${key}"><span class="lexi-plan-name">${name}</span><span class="lexi-plan-count">${count} 个</span><span class="lexi-plan-next">${next===key?"下一项":""}</span></div>`;
  }
  function primaryHtml(plan){
    if(plan.review.length)return `<button class="btn primary" data-action="start-review">开始复习 ${plan.review.length} 个</button>`;
    if(plan.memorize.length)return `<button class="btn primary" data-action="continue-learning">开始记忆 ${plan.memorize.length} 个</button>`;
    if(plan.visualize.length)return `<button class="btn primary" data-action="continue-learning">开始联想 ${plan.visualize.length} 个</button>`;
    if(plan.apply.length)return `<button class="btn primary" data-action="continue-learning">开始造句 ${plan.apply.length} 个</button>`;
    if(plan.select.length)return `<button class="btn primary" data-action="continue-learning">确认新词 ${plan.select.length} 个</button>`;
    if(plan.inbox.length&&Number(plan.remainingSelectSlots||0)>0)return `<button class="btn primary" data-route="library" data-tp-library-pending="1">从单词库选择待学习词</button>`;
    if(!(latestData?.cards||[]).length)return `<button class="btn primary" data-route="add">添加第一个单词</button>`;
    return `<button class="btn primary" disabled>今天已完成</button>`;
  }
  function homePlanHtml(signature){
    const plan=latestData?.dailyPlan||core.buildDailyPlan(latestData||{});
    const next=core.firstPlanStage(plan), remaining=remainingCount(plan);
    const total=Math.max(Number(plan.taskTotal||0),remaining), completed=Math.max(0,Number(plan.taskCompleted??(total-remaining))), percent=total?Math.max(0,Math.min(100,Math.round(completed/total*100))):0;
    const rows=[
      rowHtml("review","复习",plan.review.length,next),
      rowHtml("memorize","记忆",plan.memorize.length,next),
      rowHtml("visualize","视觉联想",plan.visualize.length,next),
      rowHtml("apply","造句应用",plan.apply.length,next),
      rowHtml("select","确认新词",plan.select.length,next),
    ].join("");
    const status=total?`${completed} / ${total}`:(remaining?`剩余 ${remaining}`:"今日暂无已安排任务");
    const note=remaining?"只显示今天仍需完成的任务。":"今天没有剩余任务；明天会按当前学习状态重新安排。";
    return `<section class="lexi-today-plan" id="lexi-today-plan" data-signature="${esc(signature)}">
      <div class="lexi-today-head"><div><div class="lexi-today-title-line"><span class="lexi-today-kicker">TODAY</span><h2>今日学习</h2></div><p class="lexi-today-note">${note}</p></div><span class="lexi-today-progress-number">${esc(status)}</span></div>
      ${total?`<div class="lexi-today-progress" aria-label="今日进度 ${percent}%"><i style="width:${percent}%"></i></div>`:""}
      <div class="lexi-plan-rows">${rows||`<div class="lexi-plan-empty">${plan.inbox.length&&plan.remainingSelectSlots>0?"可以从单词库的“待学习”中选择今天的新词。":"今天的计划已经完成。"}</div>`}</div>
      <div class="lexi-today-actions">${primaryHtml(plan)}<span class="lexi-today-footnote">不补昨天任务 · 当天计划生成后保持稳定</span></div>
    </section>`;
  }

  function decorateHome(){
    if(!latestData)return;
    const title=Array.from(document.querySelectorAll("h1,h2")).find(node=>node.textContent.trim()==="今日学习");
    if(!title)return;
    const plan=latestData.dailyPlan||core.buildDailyPlan(latestData), signature=planSignature(plan), existing=document.getElementById("lexi-today-plan");

    const stats=document.querySelector(".grid.cols-4");
    if(stats)stats.classList.add("lexi-home-legacy-summary");
    const oldToday=document.querySelector(".today-card");
    if(oldToday)oldToday.classList.add("lexi-home-legacy-summary");

    if(!existing||existing.dataset.signature!==signature){
      const holder=document.createElement("div");holder.innerHTML=homePlanHtml(signature);const next=holder.firstElementChild;
      if(existing)existing.replaceWith(next);
      else{
        const head=title.closest(".page-head")||title.closest("header,.header");
        if(head)head.insertAdjacentElement("afterend",next);else title.insertAdjacentElement("afterend",next);
      }
    }
    document.querySelectorAll('[data-route="add"]').forEach(button=>{if(button.textContent.includes("添加单词"))setText(button,button.textContent.replace("添加单词","添加单词"));});
  }

  function decorateAdd(){
    const save=document.querySelector('[data-action="save-card"].save-learning-card,[data-action="save-card"]');
    if(save&&!document.querySelector(".study-card-focus")){
      setText(save,"保存到单词库");save.title="保存后会出现在单词库的“待学习”中，由你决定哪天加入 Today";
    }
    Array.from(document.querySelectorAll("h1,h2")).forEach(node=>{if(["选词制卡","查词并收集"].includes(node.textContent.trim()))setText(node,"查词并添加");});
    document.querySelectorAll(".toast").forEach(node=>{
      if(node.textContent.includes("卡片已保存")||node.textContent.includes("已加入收集箱"))setText(node,"已保存到单词库 · 待学习");
    });
  }

  function libraryCounts(){
    const cards=latestData?.cards||[];
    return {
      all:cards.length,
      pending:cards.filter(card=>card.stage==="select"&&card.inboxPending===true).length,
      learning:cards.filter(card=>!(card.stage==="select"&&card.inboxPending===true)&&card.memoryState!=="stable").length,
      stable:cards.filter(card=>card.memoryState==="stable").length,
    };
  }
  function cardGroup(card){
    if(card?.stage==="select"&&card?.inboxPending===true)return "pending";
    if(card?.memoryState==="stable")return "stable";
    return "learning";
  }
  function filterHtml(){
    const counts=libraryCounts();
    const options=[["all","全部"],["pending","待学习"],["learning","学习中"],["stable","长期稳定"]];
    return `<div class="lexi-library-filter" data-library-filter-bar>${options.map(([key,label])=>`<button type="button" data-library-filter="${key}" class="${libraryFilter===key?"is-active":""}">${label}<span>${counts[key]}</span></button>`).join("")}<span class="lexi-library-pending-note">“待学习”就是已保存、尚未加入 Today 的单词</span></div>`;
  }
  function decorateLibrary(){
    if(!latestData)return;
    const title=Array.from(document.querySelectorAll("h1,h2")).find(node=>node.textContent.trim()==="单词库");
    if(!title)return;
    const search=document.querySelector(".search-row");
    let bar=document.querySelector("[data-library-filter-bar]");
    if(!bar){const holder=document.createElement("div");holder.innerHTML=filterHtml();bar=holder.firstElementChild;if(search)search.insertAdjacentElement("afterend",bar);}
    else{const holder=document.createElement("div");holder.innerHTML=filterHtml();bar.replaceWith(holder.firstElementChild);bar=holder.firstElementChild;}

    const plan=latestData.dailyPlan||core.buildDailyPlan(latestData), slots=Number(plan.remainingSelectSlots||0);
    document.querySelectorAll("[data-library-card]").forEach(row=>{
      const card=cardById(row.dataset.libraryCard);if(!card)return;
      const group=cardGroup(card), cells=row.querySelectorAll("td"), show=libraryFilter==="all"||libraryFilter===group;
      row.hidden=!show;
      if(cells[4]){
        if(group==="pending")cells[4].innerHTML='<span class="pill">待学习</span>';
        else if(card.stage==="select"&&!card.inboxPending)cells[4].innerHTML='<span class="pill blue">今日待确认</span>';
        else if(group==="stable")cells[4].innerHTML='<span class="pill green">长期稳定</span>';
      }
      const actions=cells[6]?.querySelector(".library-actions");
      if(actions){
        actions.querySelectorAll("[data-tp-pick],[data-tp-unpick]").forEach(node=>node.remove());
        if(group==="pending")actions.insertAdjacentHTML("afterbegin",`<button class="btn small lexi-library-today-action" type="button" data-tp-pick="${esc(card.id)}" ${slots<=0?"disabled":""}>${slots>0?"加入今天":"今日已满"}</button>`);
        else if(card.stage==="select"&&!card.inboxPending)actions.insertAdjacentHTML("afterbegin",`<button class="btn small lexi-library-today-action" type="button" data-tp-unpick="${esc(card.id)}">移回待学习</button>`);
      }
    });
  }

  async function selectFromPending(id){
    if(saving)return;saving=true;
    try{
      await refresh();const next=core.normalizeData(JSON.parse(JSON.stringify(latestData||{}))), plan=next.dailyPlan;
      if(Number(plan.remainingSelectSlots||0)<=0)return;
      const card=next.cards.find(item=>item.id===id);if(!card||card.stage!=="select"||!card.inboxPending)return;
      const now=new Date();card.inboxPending=false;card.todaySelectedOn=core.dayKey(now);card.stageEligibleOn=now.toISOString();card.inboxSelectedAt=now.toISOString();card.updatedAt=now.toISOString();
      next.activities=Array.isArray(next.activities)?next.activities:[];next.activities.push({id:uid(),type:"library-selected",cardId:card.id,at:now.toISOString()});
      await persist(next);location.reload();
    }finally{saving=false;}
  }

  async function moveBackToPending(id){
    if(saving)return;saving=true;
    try{
      await refresh();const next=core.normalizeData(JSON.parse(JSON.stringify(latestData||{}))), card=next.cards.find(item=>item.id===id);
      if(!card||card.stage!=="select"||card.inboxPending)return;
      const now=new Date();card.inboxPending=true;card.todaySelectedOn=null;card.stageEligibleOn=null;card.inboxSelectedAt=null;card.updatedAt=now.toISOString();
      next.activities=Array.isArray(next.activities)?next.activities:[];next.activities.push({id:uid(),type:"library-unselected",cardId:card.id,at:now.toISOString()});
      await persist(next);location.reload();
    }finally{saving=false;}
  }

  function decorate(){injectStyle();decorateHome();decorateAdd();decorateLibrary();}
  document.addEventListener("click",event=>{
    const filter=event.target?.closest?.("[data-library-filter]");
    if(filter){event.preventDefault();event.stopImmediatePropagation();libraryFilter=filter.dataset.libraryFilter||"all";decorateLibrary();return;}
    const pendingRoute=event.target?.closest?.("[data-tp-library-pending]");if(pendingRoute)libraryFilter="pending";
    const pick=event.target?.closest?.("[data-tp-pick]");if(pick){event.preventDefault();event.stopImmediatePropagation();void selectFromPending(pick.dataset.tpPick);return;}
    const unpick=event.target?.closest?.("[data-tp-unpick]");if(unpick){event.preventDefault();event.stopImmediatePropagation();void moveBackToPending(unpick.dataset.tpUnpick);return;}
  },true);

  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(async()=>{scheduled=false;await refresh();decorate();});}
  function start(){const app=document.getElementById("app");if(!app)return;injectStyle();void refresh().then(decorate);new MutationObserver(schedule).observe(app,{childList:true,subtree:true});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();