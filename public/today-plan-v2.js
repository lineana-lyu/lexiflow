(() => {
  "use strict";

  const core = window.LexiFlowLearningCore;
  if(!core) throw new Error("LexiFlowLearningCore must load before today-plan-v2.js");

  const previousFetch = window.fetch.bind(window);
  let latestData = null;
  let scheduled = false;
  let saving = false;

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
        const addedInbox=normalized.cards.some(card=>card.stage==="select"&&card.inboxPending===true&&!known.has(card.id));
        const response=await previousFetch(input,withJson(init,{...body,data:normalized}));
        if(response.ok){latestData=normalized;if(addedInbox)setTimeout(()=>location.reload(),260);}
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
  function cardList(ids){return (ids||[]).map(cardById).filter(Boolean);}

  function injectStyle(){
    if(document.getElementById("lexi-today-plan-style"))return;
    const style=document.createElement("style");style.id="lexi-today-plan-style";
    style.textContent=`
      .lexi-today-plan{margin:18px 0 0;padding:20px;border:1px solid var(--line);border-radius:22px;background:var(--surface);box-shadow:var(--shadow-sm,0 8px 30px rgba(34,48,43,.04))}
      .lexi-today-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px}.lexi-today-head h2{margin:2px 0 5px;font-size:20px}.lexi-today-head p{margin:0;color:var(--muted);font-size:13px;line-height:1.65}.lexi-today-kicker{font-size:11px;font-weight:800;letter-spacing:.12em;color:var(--muted)}
      .lexi-plan-rows{display:grid;gap:8px}.lexi-plan-row{display:grid;grid-template-columns:34px minmax(120px,.8fr) 60px 1.5fr;gap:12px;align-items:center;padding:11px 12px;border-radius:15px;background:rgba(120,140,132,.045);border:1px solid transparent}.lexi-plan-row.is-next{border-color:var(--line);background:rgba(120,140,132,.075)}.lexi-plan-index{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:var(--surface);border:1px solid var(--line);font-size:12px;font-weight:800}.lexi-plan-name{font-weight:750}.lexi-plan-count{font-size:18px;font-weight:800}.lexi-plan-desc{font-size:12px;color:var(--muted);line-height:1.5}
      .lexi-inbox{margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}.lexi-inbox-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px}.lexi-inbox-head strong{font-size:14px}.lexi-inbox-head span{font-size:12px;color:var(--muted)}.lexi-inbox-list{display:grid;gap:8px}.lexi-inbox-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:15px}.lexi-inbox-word{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.lexi-inbox-word strong{font-size:16px}.lexi-inbox-word span,.lexi-inbox-item p{color:var(--muted);font-size:12px}.lexi-inbox-item p{margin:4px 0 0;line-height:1.5}.lexi-selected-chips{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.lexi-selected-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid var(--line);border-radius:999px;font-size:12px;background:var(--surface)}.lexi-selected-chip button{border:0;background:transparent;color:var(--muted);cursor:pointer;padding:0 2px}.lexi-plan-empty{font-size:12px;color:var(--muted);padding:8px 2px}.lexi-no-debt{display:inline-flex;align-items:center;padding:5px 8px;border-radius:999px;background:rgba(120,140,132,.07);font-size:11px;color:var(--muted);white-space:nowrap}
      @media(max-width:760px){.lexi-plan-row{grid-template-columns:30px 1fr 44px}.lexi-plan-desc{grid-column:2/4}.lexi-today-head{flex-direction:column}.lexi-inbox-item{grid-template-columns:1fr}.lexi-inbox-item .btn{width:100%}}
    `;document.head.appendChild(style);
  }

  function planSignature(plan){
    return JSON.stringify({date:plan.date,review:plan.review,memorize:plan.memorize,visualize:plan.visualize,apply:plan.apply,select:plan.select,inbox:plan.inbox,goal:plan.selectGoal,remaining:plan.remainingSelectSlots});
  }
  function rowHtml(index,key,name,count,desc,next){
    return `<div class="lexi-plan-row ${next===key?"is-next":""}"><span class="lexi-plan-index">${index}</span><span class="lexi-plan-name">${name}</span><span class="lexi-plan-count">${count}</span><span class="lexi-plan-desc">${desc}</span></div>`;
  }
  function homePlanHtml(signature){
    const plan=latestData?.dailyPlan||core.buildDailyPlan(latestData||{});
    const next=core.firstPlanStage(plan), inbox=cardList(plan.inbox).slice(0,8), selected=cardList(plan.select), slots=Number(plan.remainingSelectSlots||0);
    const rows=[
      rowHtml(1,"review","Review",plan.review.length,"先处理到期主动回忆，避免新词挤掉旧记忆。",next),
      rowHtml(2,"memorize","Memorize",plan.memorize.length,"英→中 + 中→英输入；有错最多再强化一轮。",next),
      rowHtml(3,"visualize","Visualize",plan.visualize.length,"先产生自己的联想，再决定是否用 AI 生成图片。",next),
      rowHtml(4,"apply","Apply",plan.apply.length,"把词放进自己的生活语境，用英文真正表达。",next),
      rowHtml(5,"select","Select",plan.select.length,`今日目标 ${plan.selectGoal} 个；还可从收集箱选择 ${slots} 个。`,next),
    ].join("");
    const selectedHtml=selected.length?`<div class="lexi-selected-chips">${selected.map(card=>`<span class="lexi-selected-chip"><strong>${esc(card.word)}</strong><span>待确认</span><button type="button" data-tp-unpick="${esc(card.id)}" title="移回收集箱">×</button></span>`).join("")}</div>`:"";
    const inboxHtml=inbox.length?inbox.map(card=>`<div class="lexi-inbox-item"><div><div class="lexi-inbox-word"><strong>${esc(card.word)}</strong><span>${esc(card.phonetic||"")}</span></div><p>${esc(card.meaningZh||"")}</p></div><button class="btn small" type="button" data-tp-pick="${esc(card.id)}" ${slots<=0?"disabled":""}>加入今天</button></div>`).join(""):`<div class="lexi-plan-empty">收集箱里暂时没有候选词。查到喜欢的词后先收进来，不必立刻学。</div>`;
    return `<section class="lexi-today-plan" id="lexi-today-plan" data-signature="${esc(signature)}"><div class="lexi-today-head"><div><span class="lexi-today-kicker">TODAY PLAN</span><h2>今天只做当前该做的事</h2><p>顺序固定为 Review → Memorize → Visualize → Apply → Select。</p></div><span class="lexi-no-debt">不补昨天任务 · 每天重算</span></div><div class="lexi-plan-rows">${rows}</div>${selectedHtml}<div class="lexi-inbox" id="lexi-inbox"><div class="lexi-inbox-head"><strong>收集箱 · ${plan.inbox.length}</strong><span>${slots>0?`今天还可选 ${slots} 个`:`今天的 Select 目标已满`}</span></div><div class="lexi-inbox-list">${inboxHtml}</div></div></section>`;
  }

  function decorateHome(){
    if(!latestData)return;
    const title=Array.from(document.querySelectorAll("h1,h2")).find(node=>node.textContent.trim()==="今日学习");
    if(!title)return;
    const plan=latestData.dailyPlan||core.buildDailyPlan(latestData), signature=planSignature(plan), existing=document.getElementById("lexi-today-plan");
    if(!existing||existing.dataset.signature!==signature){
      const holder=document.createElement("div");holder.innerHTML=homePlanHtml(signature);const next=holder.firstElementChild;
      if(existing)existing.replaceWith(next);else{const stats=document.querySelector(".grid.cols-4");if(stats)stats.insertAdjacentElement("afterend",next);else title.closest("header,.header")?.insertAdjacentElement("afterend",next);}
    }

    const primary=document.querySelector('[data-action="continue-learning"],[data-action="start-review"],[data-tp-primary="inbox"]');
    if(primary){
      delete primary.dataset.tpPrimary;primary.disabled=false;
      if(plan.review.length){primary.dataset.action="start-review";setText(primary,`先复习 ${plan.review.length} 个到期词`);}
      else if(plan.memorize.length){primary.dataset.action="continue-learning";setText(primary,`开始记忆 ${plan.memorize.length} 个词`);}
      else if(plan.visualize.length){primary.dataset.action="continue-learning";setText(primary,`开始视觉联想 ${plan.visualize.length} 个词`);}
      else if(plan.apply.length){primary.dataset.action="continue-learning";setText(primary,`开始造句 ${plan.apply.length} 个词`);}
      else if(plan.select.length){primary.dataset.action="continue-learning";setText(primary,`确认今天的 ${plan.select.length} 个新词`);}
      else if(plan.inbox.length&&plan.remainingSelectSlots>0){delete primary.dataset.action;primary.dataset.tpPrimary="inbox";setText(primary,"从收集箱选择今天的词");}
      else{primary.disabled=true;setText(primary,"今天的计划已完成");}
    }

    document.querySelectorAll(".stat-label").forEach(label=>{
      const card=label.closest(".card.stat");if(!card)return;
      if(["学习中","今日推进"].includes(label.textContent.trim())){
        setText(label,"今日推进");setText(card.querySelector(".stat-value"),String(plan.memorize.length+plan.visualize.length+plan.apply.length+plan.select.length));setText(card.querySelector(".stat-hint"),"今天可推进的学习任务");
      }
      if(label.textContent.trim()==="待复习")setText(card.querySelector(".stat-value"),String(plan.review.length));
    });
    document.querySelectorAll('[data-route="add"]').forEach(button=>{if(button.textContent.includes("添加单词"))setText(button,button.textContent.replace("添加单词","收集单词"));});
  }

  function decorateAdd(){
    const save=document.querySelector('[data-action="save-card"].save-learning-card,[data-action="save-card"]');
    if(save&&!document.querySelector(".study-card-focus")&&save.dataset.tpInboxCopy!=="1"){
      save.dataset.tpInboxCopy="1";setText(save,"保存到收集箱");save.title="先收集候选词，之后再从 Today Select 中选择正式学习";
    }
    Array.from(document.querySelectorAll("h1,h2")).forEach(node=>{if(node.textContent.trim()==="选词制卡")setText(node,"查词并收集");});
    document.querySelectorAll(".toast").forEach(node=>{if(node.textContent.includes("卡片已保存，已进入学习流程")&&node.dataset.tpInboxCopy!=="1"){node.dataset.tpInboxCopy="1";setText(node,"已加入收集箱，之后从 Today Select 中选择正式学习");}});
  }

  function decorateLibrary(){
    if(!latestData)return;
    document.querySelectorAll("[data-library-card]").forEach(row=>{
      const card=cardById(row.dataset.libraryCard);if(!card?.inboxPending)return;
      const cells=row.querySelectorAll("td");if(cells[4]&&cells[4].dataset.tpInbox!=="1"){cells[4].dataset.tpInbox="1";cells[4].innerHTML='<span class="pill">收集箱</span>';}
    });
  }

  async function selectFromInbox(id){
    if(saving)return;saving=true;
    try{
      await refresh();const next=core.normalizeData(JSON.parse(JSON.stringify(latestData||{}))), plan=next.dailyPlan;
      if(Number(plan.remainingSelectSlots||0)<=0)return;
      const card=next.cards.find(item=>item.id===id);if(!card||card.stage!=="select"||!card.inboxPending)return;
      const now=new Date();card.inboxPending=false;card.todaySelectedOn=core.dayKey(now);card.stageEligibleOn=now.toISOString();card.inboxSelectedAt=now.toISOString();card.updatedAt=now.toISOString();
      next.activities=Array.isArray(next.activities)?next.activities:[];next.activities.push({id:uid(),type:"inbox-selected",cardId:card.id,at:now.toISOString()});
      await persist(next);location.reload();
    }finally{saving=false;}
  }

  async function moveBackToInbox(id){
    if(saving)return;saving=true;
    try{
      await refresh();const next=core.normalizeData(JSON.parse(JSON.stringify(latestData||{}))), card=next.cards.find(item=>item.id===id);
      if(!card||card.stage!=="select"||card.inboxPending)return;
      const now=new Date();card.inboxPending=true;card.todaySelectedOn=null;card.stageEligibleOn=null;card.inboxSelectedAt=null;card.updatedAt=now.toISOString();
      next.activities=Array.isArray(next.activities)?next.activities:[];next.activities.push({id:uid(),type:"inbox-unselected",cardId:card.id,at:now.toISOString()});
      await persist(next);location.reload();
    }finally{saving=false;}
  }

  function decorate(){injectStyle();decorateHome();decorateAdd();decorateLibrary();}
  document.addEventListener("click",event=>{
    const pick=event.target?.closest?.("[data-tp-pick]");if(pick){event.preventDefault();event.stopImmediatePropagation();void selectFromInbox(pick.dataset.tpPick);return;}
    const unpick=event.target?.closest?.("[data-tp-unpick]");if(unpick){event.preventDefault();event.stopImmediatePropagation();void moveBackToInbox(unpick.dataset.tpUnpick);return;}
    const primary=event.target?.closest?.('[data-tp-primary="inbox"]');if(primary){event.preventDefault();event.stopImmediatePropagation();document.getElementById("lexi-inbox")?.scrollIntoView({behavior:"smooth",block:"center"});}
  },true);

  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(async()=>{scheduled=false;await refresh();decorate();});}
  function start(){const app=document.getElementById("app");if(!app)return;injectStyle();void refresh().then(decorate);new MutationObserver(schedule).observe(app,{childList:true,subtree:true});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();