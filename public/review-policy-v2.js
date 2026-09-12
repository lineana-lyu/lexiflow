(() => {
  "use strict";

  const core = window.LexiFlowLearningCore;
  if(!core) throw new Error("LexiFlowLearningCore must load before review-policy-v2.js");

  const previousFetch = window.fetch.bind(window);
  let latestData = null;
  let scheduled = false;
  let saving = false;
  let advancedOpen = false;

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
      .lexi-review-policy-row{align-items:flex-start!important}.lexi-review-policy-controls{width:min(610px,100%);display:grid;gap:14px}.lexi-review-policy-block{display:grid;gap:9px}.lexi-review-policy-label{font-size:12px;font-weight:760;color:var(--text)}
      .lexi-review-mode{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.lexi-review-mode button{border:1px solid var(--line);background:var(--surface);border-radius:14px;padding:11px 12px;font:inherit;text-align:left;color:var(--text);cursor:pointer;display:grid;gap:3px;min-height:64px}.lexi-review-mode button strong{font-size:12px}.lexi-review-mode button small{font-size:10px;color:var(--muted);line-height:1.45;font-weight:400}.lexi-review-mode button.is-active{border-color:rgba(77,115,103,.36);background:rgba(77,115,103,.075);box-shadow:inset 0 0 0 1px rgba(77,115,103,.04)}
      .lexi-review-custom{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);padding:2px 1px}.lexi-review-custom input{width:82px}.lexi-review-method{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 12px;border:1px solid var(--line);border-radius:14px;background:rgba(120,140,132,.035)}.lexi-review-method>div{display:grid;gap:2px}.lexi-review-method strong{font-size:12px}.lexi-review-method span{font-size:10px;color:var(--muted)}.lexi-review-advanced-toggle{border:0;background:transparent;color:var(--muted);font:inherit;font-size:11px;cursor:pointer;padding:5px 0}
      .lexi-review-advanced{display:grid;gap:9px;padding:12px;border:1px solid var(--line);border-radius:14px;background:rgba(120,140,132,.025)}.lexi-review-types{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.lexi-review-type{border:1px solid var(--line);border-radius:12px;padding:10px;display:grid;gap:8px;background:var(--surface)}.lexi-review-type label{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:700}.lexi-review-type .lexi-weight{display:flex;align-items:center;gap:5px;color:var(--muted);font-size:10px}.lexi-review-type input[type="number"]{width:58px;padding:5px 6px}.lexi-review-reset{justify-self:start}
      .lexi-review-scheduler-note{font-size:11px;line-height:1.65;color:var(--muted);padding:11px 12px;border-radius:12px;background:rgba(120,140,132,.05)}.lexi-review-scheduler-note strong{color:var(--text);font-weight:720}.lexi-review-policy-note{font-size:10px;line-height:1.6;color:var(--muted)}
      @media(max-width:760px){.lexi-review-mode,.lexi-review-types{grid-template-columns:1fr}.lexi-review-policy-controls{width:100%}.lexi-review-method{align-items:flex-start;flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  function settingsPage(){
    const title=document.querySelector(".page-head h1");
    return title?.textContent.trim()==="设置" ? document.querySelector(".settings-list") : null;
  }

  function settingsHtml(settings){
    const mode=cleanMode(settings.reviewMode);
    const types={...DEFAULT_TYPES,...(settings.reviewTypes||{})};
    const weights={...DEFAULT_WEIGHTS,...(settings.reviewTypeWeights||{})};
    const custom=Math.max(1,Math.min(200,Math.round(Number(settings.reviewCustomCap)||20)));
    const modeOptions=[
      ["intelligent","跟随系统安排","推荐 · 按优先级和默认负荷安排当天到期词"],
      ["all","全部到期","当天把所有已到期单词都加入 Review"],
      ["custom","自定义上限","自己限定每天最多复习多少个词"],
    ];
    return `<div class="setting-row lexi-review-policy-row" data-review-policy-row>
      <div><h3>复习与巩固</h3><p>学习方法不变；这里只控制每日复习负荷和主动回忆形式。</p></div>
      <div class="lexi-review-policy-controls">
        <div class="lexi-review-scheduler-note"><strong>系统负责长期记忆调度：</strong>首次 Review 从 Apply 的下一个学习日开始；记住后按 1 → 3 → 7 → 16 → 21 天逐步拉开，稳定后进入 30 → 45 → 68 → 90 天维护。第一次没想起来时，当天最多修复一次，下一学习日必须再次验证。</div>
        <div class="lexi-review-policy-block">
          <span class="lexi-review-policy-label">每日复习量</span>
          <div class="lexi-review-mode">${modeOptions.map(([key,label,desc])=>`<button type="button" data-review-mode="${key}" class="${mode===key?"is-active":""}"><strong>${label}</strong><small>${desc}</small></button>`).join("")}</div>
          <div class="lexi-review-custom" ${mode==="custom"?"":"hidden"}><span>每天最多</span><input class="input" id="review-custom-cap" type="number" min="1" max="200" step="1" value="${custom}"><span>个到期词</span></div>
        </div>
        <div class="lexi-review-policy-block">
          <span class="lexi-review-policy-label">复习方式</span>
          <div class="lexi-review-method"><div><strong>智能混合主动回忆</strong><span>系统在英文 → 中文、中文 → 英文、图片 → 英文之间混合出题；不会改变复习间隔。</span></div><button type="button" class="lexi-review-advanced-toggle" data-review-advanced>${advancedOpen?"收起高级设置":"高级设置"} ${advancedOpen?"⌃":"⌄"}</button></div>
          <div class="lexi-review-advanced" ${advancedOpen?"":"hidden"}>
            <div class="lexi-review-types">${[["enZh","英文 → 中文"],["zhEn","中文 → 英文"],["imageEn","图片 → 英文"]].map(([key,label])=>`<div class="lexi-review-type"><label><input type="checkbox" data-review-type="${key}" ${types[key]!==false?"checked":""}>${label}</label><div class="lexi-weight"><span>出现比重</span><input class="input" type="number" min="1" max="100" step="1" data-review-weight="${key}" value="${Math.max(1,Math.min(100,Math.round(Number(weights[key])||DEFAULT_WEIGHTS[key])))}"><span>%</span></div></div>`).join("")}</div>
            <button type="button" class="btn small lexi-review-reset" data-review-reset>恢复推荐题型</button>
          </div>
        </div>
        <div class="lexi-review-policy-note">这些设置不会改变 Select → Memorize → Visualize → Apply → Review 的学习方法。复习量修改从下一个学习日生效；当天 Today 已生成的任务不会临时增加。未安排的到期词会在之后的学习日重新计算，不形成“欠词”。</div>
      </div>
    </div>`;
  }

  function decorateSettings(){
    const list=settingsPage();
    if(!list||!latestData)return;
    const settings=normalizeSettings(latestData.settings||{});
    let row=list.querySelector("[data-review-policy-row]");
    const holder=document.createElement("div");holder.innerHTML=settingsHtml(settings);const next=holder.firstElementChild;
    if(row){row.replaceWith(next);return;}
    const daily=Array.from(list.querySelectorAll(":scope > .setting-row")).find(node=>node.querySelector("h3")?.textContent.trim()==="每日学习目标");
    if(daily)daily.insertAdjacentElement("afterend",next);else list.appendChild(next);
  }

  function decorateToday(){
    if(!latestData)return;
    const plan=latestData.dailyPlan;
    const reviewRow=document.querySelector('#lexi-today-plan [data-plan-key="review"]');
    if(!reviewRow||!plan)return;
    const count=reviewRow.querySelector(".lexi-plan-count");
    const scheduled=Number(plan.review?.length||0), total=Number(plan.reviewDueTotal??scheduled), deferred=Math.max(0,Number(plan.reviewDeferredCount||0));
    if(count)count.title=deferred>0?`今天安排 ${scheduled} 个；另有 ${deferred} 个到期词会在之后的学习日重新计算。`:total?`今天安排 ${scheduled} 个到期词。`:"今天没有到期复习。";
  }

  document.addEventListener("click",event=>{
    const mode=event.target?.closest?.("[data-review-mode]");
    if(mode){event.preventDefault();void persistSettings({reviewMode:cleanMode(mode.dataset.reviewMode)});return;}
    const advanced=event.target?.closest?.("[data-review-advanced]");
    if(advanced){event.preventDefault();advancedOpen=!advancedOpen;decorateSettings();return;}
    const reset=event.target?.closest?.("[data-review-reset]");
    if(reset){event.preventDefault();void persistSettings({reviewTypes:{...DEFAULT_TYPES},reviewTypeWeights:{...DEFAULT_WEIGHTS}});return;}
  },true);

  document.addEventListener("change",event=>{
    const target=event.target;
    if(!(target instanceof HTMLInputElement))return;
    if(target.id==="review-custom-cap"){
      const value=Math.max(1,Math.min(200,Math.round(Number(target.value)||20)));
      target.value=String(value);void persistSettings({reviewCustomCap:value});return;
    }
    if(target.dataset.reviewType){
      const settings=normalizeSettings(latestData?.settings||{});
      const next={...settings.reviewTypes,[target.dataset.reviewType]:target.checked};
      if(!Object.values(next).some(Boolean)){target.checked=true;return;}
      void persistSettings({reviewTypes:next});return;
    }
    if(target.dataset.reviewWeight){
      const settings=normalizeSettings(latestData?.settings||{});
      const value=Math.max(1,Math.min(100,Math.round(Number(target.value)||DEFAULT_WEIGHTS[target.dataset.reviewWeight]||20)));
      target.value=String(value);void persistSettings({reviewTypeWeights:{...settings.reviewTypeWeights,[target.dataset.reviewWeight]:value}});
    }
  },true);

  function decorate(){injectStyle();decorateSettings();decorateToday();}
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(async()=>{scheduled=false;await refresh();decorate();});
  }
  function start(){
    const app=document.getElementById("app");
    if(!app)return;
    injectStyle();void refresh().then(decorate);new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();