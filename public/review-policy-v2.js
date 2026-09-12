(() => {
  "use strict";

  const core = window.LexiFlowLearningCore;
  if(!core) throw new Error("LexiFlowLearningCore must load before review-policy-v2.js");

  const previousFetch = window.fetch.bind(window);
  let latestData = null;
  let scheduled = false;
  let saving = false;

  const DEFAULT_TYPES = Object.freeze({enZh:true,zhEn:true,imageEn:true});
  const DEFAULT_WEIGHTS = Object.freeze({enZh:30,zhEn:50,imageEn:20});

  function clone(value){ return JSON.parse(JSON.stringify(value)); }
  function cleanMode(value){
    const mode=String(value||"intelligent").toLowerCase();
    return ["intelligent","all","custom"].includes(mode)?mode:"intelligent";
  }
  function normalizeSettings(settings={}){
    const custom=Math.max(1,Math.min(200,Math.round(Number(settings.reviewCustomCap)||20)));
    return {
      ...settings,
      reviewMode:cleanMode(settings.reviewMode),
      reviewCustomCap:custom,
      reviewTypes:{...DEFAULT_TYPES,...(settings.reviewTypes||{})},
      reviewTypeWeights:{...DEFAULT_WEIGHTS,...(settings.reviewTypeWeights||{})},
    };
  }

  async function refresh(){
    try{
      const response=await previousFetch("/api/learning-data",{cache:"no-store"});
      if(response.ok){
        const payload=await response.json();
        if(payload?.data){
          latestData=core.normalizeData(payload.data);
          latestData.settings=normalizeSettings(latestData.settings||{});
        }
      }
    }catch{}
    return latestData;
  }

  async function persistSettings(patch){
    if(saving)return;
    saving=true;
    try{
      await refresh();
      if(!latestData)return;
      const next=clone(latestData);
      next.settings=normalizeSettings({...next.settings,...patch});
      const response=await previousFetch("/api/learning-data",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({data:next}),
      });
      if(!response.ok)throw new Error("SAVE_FAILED");
      latestData=next;
      schedule();
    }catch(err){
      console.error("review policy save failed",err);
    }finally{saving=false;}
  }

  function injectStyle(){
    if(document.getElementById("lexi-review-policy-style"))return;
    const style=document.createElement("style");
    style.id="lexi-review-policy-style";
    style.textContent=`
      .lexi-review-policy-row{align-items:flex-start!important}.lexi-review-policy-controls{width:min(560px,100%);display:grid;gap:14px}.lexi-review-policy-block{display:grid;gap:8px}.lexi-review-policy-label{font-size:12px;font-weight:750;color:var(--text)}.lexi-review-mode{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.lexi-review-mode button{border:1px solid var(--line);background:var(--surface);border-radius:12px;padding:9px 8px;font:inherit;font-size:12px;color:var(--muted);cursor:pointer}.lexi-review-mode button.is-active{border-color:rgba(77,115,103,.35);background:rgba(77,115,103,.08);color:var(--text);font-weight:750}.lexi-review-custom{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted)}.lexi-review-custom input{width:82px}.lexi-review-types{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.lexi-review-type{border:1px solid var(--line);border-radius:12px;padding:10px;display:grid;gap:8px;background:var(--surface)}.lexi-review-type label{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700}.lexi-review-type .lexi-weight{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:11px}.lexi-review-type input[type="number"]{width:62px;padding:6px 7px}.lexi-review-policy-note{font-size:11px;line-height:1.6;color:var(--muted);padding:9px 10px;border-radius:10px;background:rgba(120,140,132,.05)}.lexi-review-plan-note{display:block;margin-top:2px;color:var(--muted)}
      @media(max-width:760px){.lexi-review-mode,.lexi-review-types{grid-template-columns:1fr}.lexi-review-policy-controls{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function settingsPage(){
    const title=document.querySelector(".page-head h1");
    return title?.textContent.trim()==="设置" ? document.querySelector(".settings-list") : null;
  }

  function modeLabel(mode){
    return mode==="all"?"全部到期":mode==="custom"?"自定义上限":"智能安排";
  }

  function settingsHtml(settings){
    const mode=cleanMode(settings.reviewMode);
    const types={...DEFAULT_TYPES,...(settings.reviewTypes||{})};
    const weights={...DEFAULT_WEIGHTS,...(settings.reviewTypeWeights||{})};
    const custom=Math.max(1,Math.min(200,Math.round(Number(settings.reviewCustomCap)||20)));
    return `<div class="setting-row lexi-review-policy-row" data-review-policy-row>
      <div><h3>复习计划</h3><p>控制每天复习多少词，以及主动回忆题型。默认优先保证可持续完成。</p></div>
      <div class="lexi-review-policy-controls">
        <div class="lexi-review-policy-block">
          <span class="lexi-review-policy-label">每天复习量</span>
          <div class="lexi-review-mode">
            ${[["intelligent","智能安排"],["all","全部到期"],["custom","自定义"]].map(([key,label])=>`<button type="button" data-review-mode="${key}" class="${mode===key?"is-active":""}">${label}</button>`).join("")}
          </div>
          <div class="lexi-review-custom" ${mode==="custom"?"":"hidden"}><span>每天最多</span><input class="input" id="review-custom-cap" type="number" min="1" max="200" step="1" value="${custom}"><span>个词</span></div>
        </div>
        <div class="lexi-review-policy-block">
          <span class="lexi-review-policy-label">主动回忆题型</span>
          <div class="lexi-review-types">
            ${[["enZh","英文 → 中文"],["zhEn","中文 → 英文"],["imageEn","图片 → 英文"]].map(([key,label])=>`<div class="lexi-review-type"><label><input type="checkbox" data-review-type="${key}" ${types[key]!==false?"checked":""}>${label}</label><div class="lexi-weight"><span>出现比重</span><input class="input" type="number" min="1" max="100" step="1" data-review-weight="${key}" value="${Math.max(1,Math.min(100,Math.round(Number(weights[key])||DEFAULT_WEIGHTS[key])))}"><span>%</span></div></div>`).join("")}
          </div>
        </div>
        <div class="lexi-review-policy-note">复习数量修改从下一个学习日生效；当天 Today Plan 一旦生成，不临时增加任务。未安排的到期词不会变成“欠词”，后续学习日会按当前状态重新计算。题型设置只影响尚未开始的新题，正在作答的题型不会突然改变。</div>
      </div>
    </div>`;
  }

  function decorateSettings(){
    const list=settingsPage();
    if(!list||!latestData)return;
    const settings=normalizeSettings(latestData.settings||{});
    let row=list.querySelector("[data-review-policy-row]");
    if(row)return;
    const daily=Array.from(list.querySelectorAll(":scope > .setting-row")).find(node=>node.querySelector("h3")?.textContent.trim()==="每日学习目标");
    const holder=document.createElement("div");holder.innerHTML=settingsHtml(settings);row=holder.firstElementChild;
    if(daily)daily.insertAdjacentElement("afterend",row);else list.appendChild(row);
  }

  function reviewDescription(plan){
    const scheduled=Number(plan?.review?.length||0);
    const total=Number(plan?.reviewDueTotal??scheduled);
    const deferred=Math.max(0,Number(plan?.reviewDeferredCount||0));
    if(!scheduled&&total===0)return "今天没有到期复习。";
    if(deferred>0)return `今天安排 ${scheduled} / 到期 ${total}；其余 ${deferred} 个不算欠词，会在之后的学习日重新计算。`;
    if(plan?.reviewMode==="all")return `今天安排全部 ${scheduled} 个到期词。`;
    if(plan?.reviewMode==="custom")return `今天安排 ${scheduled} 个到期词 · 自定义上限 ${plan.reviewCap}。`;
    return `今天安排 ${scheduled} 个到期词 · 智能上限 ${plan?.reviewCap||core.REVIEW_INTELLIGENT_CAP}。`;
  }

  function decorateToday(){
    if(!latestData)return;
    const plan=latestData.dailyPlan;
    const root=document.getElementById("lexi-today-plan");
    if(!root||!plan)return;
    const rows=Array.from(root.querySelectorAll(".lexi-plan-row"));
    const reviewRow=rows.find(row=>row.querySelector(".lexi-plan-name")?.textContent.trim()==="Review");
    if(!reviewRow)return;
    const desc=reviewRow.querySelector(".lexi-plan-desc");
    if(desc)desc.textContent=reviewDescription(plan);
    const count=reviewRow.querySelector(".lexi-plan-count");
    if(count)count.title=`${modeLabel(plan.reviewMode)}${plan.reviewDeferredCount?` · 另有 ${plan.reviewDeferredCount} 个本日不安排`:""}`;
  }

  function atLeastOneType(settings){
    const types={...DEFAULT_TYPES,...(settings.reviewTypes||{})};
    return Object.values(types).some(Boolean);
  }

  document.addEventListener("click",event=>{
    const mode=event.target?.closest?.("[data-review-mode]");
    if(mode){
      event.preventDefault();
      const value=cleanMode(mode.dataset.reviewMode);
      void persistSettings({reviewMode:value});
      return;
    }
  },true);

  document.addEventListener("change",event=>{
    const target=event.target;
    if(!(target instanceof HTMLInputElement))return;
    if(target.id==="review-custom-cap"){
      const value=Math.max(1,Math.min(200,Math.round(Number(target.value)||20)));
      target.value=String(value);
      void persistSettings({reviewCustomCap:value});
      return;
    }
    if(target.dataset.reviewType){
      const settings=normalizeSettings(latestData?.settings||{});
      const next={...settings.reviewTypes,[target.dataset.reviewType]:target.checked};
      if(!Object.values(next).some(Boolean)){
        target.checked=true;
        return;
      }
      void persistSettings({reviewTypes:next});
      return;
    }
    if(target.dataset.reviewWeight){
      const settings=normalizeSettings(latestData?.settings||{});
      const value=Math.max(1,Math.min(100,Math.round(Number(target.value)||DEFAULT_WEIGHTS[target.dataset.reviewWeight]||20)));
      target.value=String(value);
      void persistSettings({reviewTypeWeights:{...settings.reviewTypeWeights,[target.dataset.reviewWeight]:value}});
    }
  },true);

  function decorate(){
    injectStyle();
    decorateSettings();
    decorateToday();
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(async()=>{
      scheduled=false;
      await refresh();
      decorate();
    });
  }
  function start(){
    const app=document.getElementById("app");
    if(!app)return;
    injectStyle();
    void refresh().then(decorate);
    new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();