(() => {
  "use strict";

  const core = window.LexiFlowLearningCore;
  if(!core) throw new Error("LexiFlowLearningCore must load before review-policy-v3.js");

  let latestData = null;
  let scheduled = false;

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
      const response=await fetch("/api/learning-data",{cache:"no-store"});
      if(response.ok){
        const payload=await response.json();
        if(payload?.data)latestData=core.normalizeData(payload.data);
      }
    }catch{}
    return latestData;
  }

  function injectStyle(){
    if(document.getElementById("lexi-review-policy-style"))return;
    const style=document.createElement("style");
    style.id="lexi-review-policy-style";
    style.textContent=`
      .lexi-review-policy-row{align-items:flex-start!important}.lexi-review-policy-panel{width:min(640px,100%);display:grid;gap:11px}.lexi-review-policy-chips{display:flex;gap:7px;flex-wrap:wrap}.lexi-review-policy-chip{font-size:11px;padding:6px 9px;border:1px solid var(--line);border-radius:999px;background:var(--surface);color:var(--muted)}.lexi-review-policy-chip strong{color:var(--text)}
      .lexi-review-policy-note{font-size:11px;line-height:1.65;color:var(--muted);padding:11px 12px;border-radius:12px;background:rgba(120,140,132,.05)}.lexi-review-policy-note strong{color:var(--text);font-weight:720}.lexi-review-policy-load{font-size:11px;line-height:1.6;color:var(--muted)}
      @media(max-width:760px){.lexi-review-policy-panel{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function settingsPage(){
    const title=document.querySelector(".page-head h1");
    return title?.textContent.trim()==="设置" ? document.querySelector(".settings-list") : null;
  }

  function planOf(data=latestData){
    if(!data)return null;
    return data.dailyPlan||core.buildDailyPlan(data);
  }

  function numberOr(value,fallback=0){
    const number=Number(value);
    return Number.isFinite(number)?number:fallback;
  }

  function selectGoal(plan){
    if(plan?.selectGoal!==undefined&&plan?.selectGoal!==null)return Math.max(0,numberOr(plan.selectGoal,0));
    return Math.max(0,numberOr(latestData?.settings?.dailyGoal,3));
  }

  function selectMaxGoal(plan){
    if(plan?.selectMaxGoal!==undefined&&plan?.selectMaxGoal!==null)return Math.max(0,numberOr(plan.selectMaxGoal,0));
    return Math.max(0,numberOr(latestData?.settings?.dailyGoal,3));
  }

  function signature(plan){
    if(!plan)return "";
    return JSON.stringify({
      date:plan.date,
      mode:plan.reviewLoadMode,
      critical:plan.reviewCriticalCount,
      stable:plan.reviewStableScheduledCount,
      deferred:plan.reviewStableDeferredCount,
      pulled:plan.reviewStablePulledForwardCount,
      pressure:plan.reviewPressure,
      goal:plan.selectGoal,
      maxGoal:plan.selectMaxGoal,
    });
  }

  function loadText(plan){
    const base=selectMaxGoal(plan),goal=selectGoal(plan),legacy=plan?.reviewLoadMode==="frozen-legacy";
    if(legacy)return "今天继续沿用升级前已经冻结的计划；Review V4 会从下一个 StudyDay 开始重新计算。";
    if(goal===base)return `今日复习负荷正常，新词上限保持 ${goal} 个。`;
    if(goal===0)return `今日复习负荷较高，新词暂缓；先保护已经学过的内容。`;
    return `今日复习负荷较高，新词上限已由 ${base} 个自动调整为 ${goal} 个。`;
  }

  function settingsHtml(plan){
    const critical=Math.max(0,numberOr(plan?.reviewCriticalCount,0));
    const stable=Math.max(0,numberOr(plan?.reviewStableScheduledCount,0));
    const deferred=Math.max(0,numberOr(plan?.reviewStableDeferredCount,0));
    const pulled=Math.max(0,numberOr(plan?.reviewStablePulledForwardCount,0));
    const goal=selectGoal(plan),base=selectMaxGoal(plan);
    return `<div class="setting-row lexi-review-policy-row" data-review-policy-row>
      <div><h3>复习与学习负荷</h3><p>关键复习优先；系统自动平滑长期维护，并根据复习压力调整新词量。</p></div>
      <div class="lexi-review-policy-panel">
        <div class="lexi-review-policy-note"><strong>关键复习到期全部安排：</strong>Review Again 与 1 → 3 → 7 → 16 → 21 天强化链不会再被“每天最多 N 个”的硬上限截断。</div>
        <div class="lexi-review-policy-note"><strong>Stable 只在安全窗口内平滑：</strong>30 → 45 → 68 → 90 天维护分别允许在 ±2 / ±3 / ±4 / ±5 天内前后微调；超过窗口的维护项会强制进入 Today。</div>
        <div class="lexi-review-policy-chips">
          <span class="lexi-review-policy-chip">关键复习 <strong>${critical}</strong></span>
          <span class="lexi-review-policy-chip">Stable 今日 <strong>${stable}</strong></span>
          ${deferred?`<span class="lexi-review-policy-chip">窗口内后移 <strong>${deferred}</strong></span>`:""}
          ${pulled?`<span class="lexi-review-policy-chip">窗口内提前 <strong>${pulled}</strong></span>`:""}
          <span class="lexi-review-policy-chip">今日新词 <strong>${goal} / ${base}</strong></span>
        </div>
        <div class="lexi-review-policy-load">${loadText(plan)} 调度完全由本地确定性规则完成，AI 不参与复习日期、Today 成员或记忆状态决策。</div>
      </div>
    </div>`;
  }

  function decorateSettings(){
    const list=settingsPage();
    const plan=planOf();
    if(!list||!plan)return;
    const nextSignature=signature(plan);
    let row=list.querySelector("[data-review-policy-row]");
    if(row?.dataset.reviewPolicySignature===nextSignature)return;
    const holder=document.createElement("div");holder.innerHTML=settingsHtml(plan);const next=holder.firstElementChild;
    next.dataset.reviewPolicySignature=nextSignature;
    if(row){row.replaceWith(next);return;}
    const daily=Array.from(list.querySelectorAll(":scope > .setting-row")).find(node=>node.querySelector("h3")?.textContent.trim()==="每日学习目标");
    if(daily)daily.insertAdjacentElement("afterend",next);else list.appendChild(next);
  }

  function decorateToday(){
    const plan=planOf();
    if(!plan)return;
    const reviewRow=document.querySelector('#lexi-today-plan [data-plan-key="review"]');
    const critical=Math.max(0,numberOr(plan.reviewCriticalCount,0));
    const stable=Math.max(0,numberOr(plan.reviewStableScheduledCount,0));
    const deferred=Math.max(0,numberOr(plan.reviewStableDeferredCount,0));
    const legacy=plan.reviewLoadMode==="frozen-legacy";
    if(reviewRow){
      const count=reviewRow.querySelector(".lexi-plan-count");
      if(count)count.title=legacy
        ? "今天沿用升级前已经冻结的 Review 队列；下一个 StudyDay 起启用自适应负荷。"
        : `关键复习 ${critical} 个全部保留；Stable 今日安排 ${stable} 个${deferred?`，另有 ${deferred} 个在安全窗口内平滑`:""}。`;
    }
    const goalRow=document.querySelector('#lexi-today-plan [data-plan-key="select-goal"]');
    if(goalRow)goalRow.title=loadText(plan);
  }

  function decorate(){injectStyle();decorateSettings();decorateToday();}
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;syncFromGateway();decorate();});
  }
  function start(){
    const app=document.getElementById("app");
    if(!app)return;
    injectStyle();
    syncFromGateway();
    if(latestData)decorate();else void refresh(true).then(decorate);
    new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
    window.addEventListener("lexiflow:today-plan-data",schedule);
    window.addEventListener("focus",()=>void refresh(true).then(decorate));
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();
