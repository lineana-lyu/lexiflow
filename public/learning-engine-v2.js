(() => {
  "use strict";

  const core = window.LexiFlowLearningCore;
  if(!core) throw new Error("LexiFlowLearningCore must load before learning-engine-v2.js");

  const nativeFetch = window.fetch.bind(window);
  const {REVIEW_INTERVALS, STABLE_INTERVALS, normalizeData, eligibleToday, crossDayPatch} = core;
  const VISUAL_SENTINEL = "__LEXIFLOW_USER_ASSOCIATION_REQUIRED__";
  let latestLearningData = null;

  function endpointOf(input){
    try{
      const raw = typeof input === "string" ? input : input?.url || "";
      return new URL(raw, location.href).pathname;
    }catch{return "";}
  }

  function parseBody(init){
    if(!init || typeof init.body !== "string") return null;
    try{return JSON.parse(init.body);}catch{return null;}
  }

  function responseWithJson(original, data){
    const headers = new Headers(original.headers || {});
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.delete("Content-Length");
    return new Response(JSON.stringify(data), {
      status: original.status,
      statusText: original.statusText,
      headers,
    });
  }

  function requestWithJson(init, body){
    return {
      ...(init || {}),
      headers: {"Content-Type":"application/json", ...((init && init.headers) || {})},
      body: JSON.stringify(body),
    };
  }

  function findPreviousCard(cardId){
    return latestLearningData?.cards?.find(card=>card.id===cardId) || null;
  }

  function applyCrossDayGate(prev, next){
    const patch = crossDayPatch(prev, next, new Date());
    if(patch) Object.assign(next, patch);
  }

  function transformOutgoingLearningData(body){
    if(!body?.data || !Array.isArray(body.data.cards)) return body;
    const data = normalizeData(body.data);
    for(const card of data.cards){
      const prev = findPreviousCard(card.id);
      applyCrossDayGate(prev, card);
    }
    data.dailyPlan = core.buildDailyPlan(data);
    latestLearningData = JSON.parse(JSON.stringify(data));
    return {...body, data};
  }

  window.fetch = async function lexiFlowLearningEngineFetch(input, init={}){
    const endpoint = endpointOf(input);
    const method = String(init?.method || "GET").toUpperCase();

    if(endpoint === "/api/ai/visual-scene" && method === "POST"){
      const body = parseBody(init) || {};
      if(!String(body.previousScene||"").trim()){
        return new Response(JSON.stringify({
          ok:true,
          assist:{
            scene:VISUAL_SENTINEL,
            cue:"",
            practiceQuestion:`你在什么真实情境中会用到“${String(body.meaningZh||body.word||"这个词").trim()}”？`,
          },
        }), {status:200, headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
      }
    }

    if(endpoint === "/api/learning-data" && method === "POST"){
      const transformed = transformOutgoingLearningData(parseBody(init));
      return nativeFetch(input, requestWithJson(init, transformed));
    }

    const response = await nativeFetch(input, init);
    if(endpoint === "/api/learning-data" && method === "GET" && response.ok){
      try{
        const payload = await response.clone().json();
        if(payload?.data){
          payload.data = normalizeData(payload.data);
          latestLearningData = JSON.parse(JSON.stringify(payload.data));
          return responseWithJson(response, payload);
        }
      }catch{}
    }
    return response;
  };

  async function refreshEngineCache(){
    try{
      const response = await nativeFetch("/api/learning-data", {cache:"no-store"});
      if(!response.ok) return;
      const payload = await response.json();
      if(payload?.data) latestLearningData = normalizeData(payload.data);
    }catch{}
  }

  function currentCard(){
    const id=String(window.LexiFlowStudyRenderer?.currentCardId?.()||"");
    if(!id)return null;
    return latestLearningData?.cards?.find(card=>String(card.id)===id) || null;
  }

  function decorateStableStat(){
    if(!latestLearningData) return;
    document.querySelectorAll(".stat-label").forEach(label=>{
      if(label.textContent.trim()!=="连续学习") return;
      const card = label.closest(".card.stat");
      if(!card) return;
      const stable = latestLearningData.cards.filter(item=>item.memoryState==="stable").length;
      label.textContent = "长期稳定";
      const value = card.querySelector(".stat-value");
      const hint = card.querySelector(".stat-hint");
      if(value) value.textContent = String(stable);
      if(hint) hint.textContent = "已进入长期保持的词";
    });
  }

  function decorateVisualize(){
    const editor = document.getElementById("visual-note") || document.querySelector(".scene-editor");
    if(!editor) return;
    if(String(editor.value||"").includes(VISUAL_SENTINEL)){
      editor.value = "";
      editor.dispatchEvent(new Event("input", {bubbles:true}));
    }
    editor.placeholder = "先写下你自己脑海里的画面，例如：我大学那个特别大的图书馆……";
    const panel = editor.closest(".scene-panel") || editor.parentElement;
    if(panel && !panel.querySelector(".lexi-user-first-tip")){
      const tip = document.createElement("div");
      tip.className = "lexi-user-first-tip";
      tip.style.cssText = "margin:0 0 12px;padding:10px 12px;border-radius:12px;background:rgba(120,140,132,.06);font-size:13px;line-height:1.6;color:var(--muted);";
      tip.innerHTML = "<strong style=\"display:block;color:var(--text);margin-bottom:2px\">先用你自己的联想</strong><span>先在脑中想一个具体的人、地方、动作或物体，再写下来。AI 只负责帮你整理和生成图片，不替你完成第一次联想。</span>";
      panel.insertBefore(tip, editor);
    }
    document.querySelectorAll(".scene-generation-state").forEach(node=>node.remove());
    const generate = document.querySelector('[data-action="generate-visual"]');
    if(generate){
      const ready = Boolean(String(editor.value||"").trim());
      generate.disabled = !ready;
      generate.title = ready ? "" : "先写下你自己的联想场景";
    }
  }

  function decorateReviewCopy(){
    const card = currentCard();
    if(!card) return;
    document.querySelectorAll('[data-action="initial-review-rate"][data-quality="good"],[data-action="review-rate"][data-quality="good"]').forEach(btn=>{
      if(card.memoryState === "stable"){
        const next = STABLE_INTERVALS[Math.min(Number(card.stableStep||0)+1, STABLE_INTERVALS.length-1)];
        btn.textContent = `记住了 · ${next} 天后维护`;
      }else{
        const step = Math.min(Number(card.reviewStep||0)+1, REVIEW_INTERVALS.length-1);
        const next = REVIEW_INTERVALS[step];
        btn.textContent = step >= REVIEW_INTERVALS.length-1 && Number(card.reviewStep||0)>=REVIEW_INTERVALS.length-2
          ? "记住了 · 进入长期保持"
          : `记住了 · ${next} 天后复习`;
      }
    });
    document.querySelectorAll('[data-action="initial-review-rate"][data-quality="again"],[data-action="review-rate"][data-quality="again"]').forEach(btn=>{
      btn.textContent = card.memoryState === "review_again" ? "还没记住 · 明天再验证" : "没记住 · 今天稍后再试一次";
    });
  }

  function decorate(){
    decorateStableStat();
    decorateVisualize();
    decorateReviewCopy();
  }

  let observerScheduled = false;
  function scheduleDecorate(){
    if(observerScheduled) return;
    observerScheduled = true;
    requestAnimationFrame(()=>{
      observerScheduled = false;
      decorate();
    });
  }

  document.addEventListener("click", event=>{
    const button = event.target?.closest?.("[data-action]");
    if(!button) return;
    if(button.dataset.action !== "continue-learning") return;
    const eligible = latestLearningData?.cards?.filter(card=>["select","memorize","visualize","apply"].includes(core.canonicalStage(card)) && !card.inboxPending && eligibleToday(card)) || [];
    if(!eligible.length){
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener("input", event=>{
    if(event.target?.id === "visual-note") scheduleDecorate();
  }, true);

  function start(){
    refreshEngineCache().finally(scheduleDecorate);
    const app = document.getElementById("app");
    if(app) new MutationObserver(scheduleDecorate).observe(app,{childList:true,subtree:true});
    setInterval(refreshEngineCache, 5000);
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, {once:true});
  else start();
})();