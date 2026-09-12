(() => {
  "use strict";

  const nativeFetch = window.fetch.bind(window);
  const REVIEW_INTERVALS = [1, 3, 7, 16, 21];
  const STABLE_INTERVALS = [30, 45, 68, 90];
  const VISUAL_SENTINEL = "__LEXIFLOW_USER_ASSOCIATION_REQUIRED__";
  let latestLearningData = null;
  let reloadTimer = null;

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

  function dayKey(input = new Date()){
    const d = input instanceof Date ? input : new Date(input);
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }

  function addDaysIso(input, days){
    const d = input instanceof Date ? new Date(input) : new Date(input || Date.now());
    d.setHours(12,0,0,0);
    d.setDate(d.getDate()+days);
    return d.toISOString();
  }

  function eligibleToday(card){
    if(!card?.stageEligibleOn) return true;
    return dayKey(card.stageEligibleOn) <= dayKey();
  }

  function isDue(card){
    if(card?.stage !== "review" || !card?.nextReviewAt) return false;
    return new Date(card.nextReviewAt).getTime() <= Date.now();
  }

  function normalizeCard(raw){
    const card = {...raw};
    if(!card.memoryState){
      card.memoryState = card.stage === "review" ? "reinforcing" : card.stage === "mastered" ? "stable" : "learning";
    }
    if(!Number.isFinite(Number(card.reviewStep))) card.reviewStep = 0;
    if(!Number.isFinite(Number(card.stableStep))) card.stableStep = 0;
    if(card.stage === "mastered") card.stage = "review";
    if(card.memoryState === "stable" && !card.nextReviewAt){
      card.nextReviewAt = addDaysIso(new Date(), STABLE_INTERVALS[Math.min(card.stableStep, STABLE_INTERVALS.length-1)]);
    }
    return card;
  }

  function activePriority(card){
    if(!eligibleToday(card)) return 99;
    if(card.stage === "memorize1" || card.stage === "memorize2") return 1;
    if(card.stage === "visualize") return 2;
    if(card.stage === "apply") return 3;
    if(card.stage === "select") return 4;
    if(card.stage === "review" && card.initialReviewPending) return 5;
    return 90;
  }

  function normalizeLearningData(data){
    if(!data || !Array.isArray(data.cards)) return data;
    const cards = data.cards.map(normalizeCard);
    cards.sort((a,b)=>{
      const pa = activePriority(a), pb = activePriority(b);
      if(pa !== pb) return pa-pb;
      return new Date(a.createdAt||0)-new Date(b.createdAt||0);
    });
    return {...data, cards};
  }

  function latestReviewActivity(data, cardId){
    const list = Array.isArray(data?.activities) ? data.activities : [];
    for(let i=list.length-1;i>=0;i--){
      const item = list[i];
      if(item?.type === "review" && item?.cardId === cardId) return item;
    }
    return null;
  }

  function findPreviousCard(cardId){
    return latestLearningData?.cards?.find(c=>c.id===cardId) || null;
  }

  function applyReviewSchedule(nextData, nextCard){
    const prev = findPreviousCard(nextCard.id);
    if(!prev) return;
    if(Number(nextCard.reviewCount||0) <= Number(prev.reviewCount||0)) return;

    const activity = latestReviewActivity(nextData, nextCard.id);
    const quality = String(activity?.quality || "");
    const today = dayKey();
    const now = new Date();

    if(prev.memoryState === "review_again"){
      const sameDay = prev.reviewAgainFailedOn === today || prev.sameDayRetestUsedOn === today;
      if(sameDay){
        nextCard.memoryState = "review_again";
        nextCard.reviewAgainNeedsNextDay = true;
        nextCard.nextReviewAt = addDaysIso(now, 1);
        return;
      }
      if(quality === "good"){
        const origin = Number.isFinite(Number(prev.reviewAgainOriginStep)) ? Number(prev.reviewAgainOriginStep) : Number(prev.reviewStep||0);
        const recovered = Math.max(0, origin-1);
        nextCard.memoryState = "reinforcing";
        nextCard.reviewStep = recovered;
        nextCard.reviewAgainNeedsNextDay = false;
        nextCard.nextReviewAt = addDaysIso(now, REVIEW_INTERVALS[recovered]);
      }else{
        nextCard.memoryState = "review_again";
        nextCard.reviewAgainFailedOn = today;
        nextCard.sameDayRetestUsedOn = today;
        nextCard.nextReviewAt = now.toISOString();
      }
      return;
    }

    if(quality !== "good"){
      nextCard.memoryState = "review_again";
      nextCard.reviewAgainOriginStep = Number(prev.reviewStep||0);
      nextCard.reviewAgainFailedOn = today;
      nextCard.sameDayRetestUsedOn = today;
      nextCard.reviewAgainNeedsNextDay = true;
      nextCard.nextReviewAt = now.toISOString();
      return;
    }

    if(prev.memoryState === "stable"){
      const stableStep = Math.min(Number(prev.stableStep||0)+1, STABLE_INTERVALS.length-1);
      nextCard.memoryState = "stable";
      nextCard.stableStep = stableStep;
      nextCard.nextReviewAt = addDaysIso(now, STABLE_INTERVALS[stableStep]);
      return;
    }

    const current = Number(prev.reviewStep||0);
    const nextStep = current + 1;
    if(nextStep >= REVIEW_INTERVALS.length){
      nextCard.memoryState = "stable";
      nextCard.reviewStep = REVIEW_INTERVALS.length-1;
      nextCard.stableStep = 0;
      nextCard.nextReviewAt = addDaysIso(now, STABLE_INTERVALS[0]);
    }else{
      nextCard.memoryState = "reinforcing";
      nextCard.reviewStep = nextStep;
      nextCard.nextReviewAt = addDaysIso(now, REVIEW_INTERVALS[nextStep]);
    }
  }

  function inferCrossDayGate(prev, next){
    if(!prev || !next) return;
    const today = dayKey();
    if(prev.stage === "select" && next.stage === "memorize1"){
      next.stageEligibleOn = addDaysIso(new Date(), 1);
      next.selectedOn = today;
      next.memoryState = "learning";
      next.memorizeRound = 1;
    }else if(prev.stage === "memorize2" && next.stage === "visualize"){
      next.stageEligibleOn = addDaysIso(new Date(), 1);
      next.memorizeCompletedOn = today;
      next.memoryState = "learning";
    }else if(prev.stage === "visualize" && next.stage === "apply"){
      next.stageEligibleOn = addDaysIso(new Date(), 1);
      next.visualizeCompletedOn = today;
      next.memoryState = "learning";
    }else if(prev.stage === "apply" && next.stage === "review"){
      next.stageEligibleOn = addDaysIso(new Date(), 1);
      next.applyCompletedOn = today;
      next.memoryState = "reinforcing";
      next.reviewStep = 0;
      next.nextReviewAt = addDaysIso(new Date(), 1);
      next.initialReviewPending = true;
    }
  }

  function transformOutgoingLearningData(body){
    if(!body?.data || !Array.isArray(body.data.cards)) return body;
    const data = normalizeLearningData(body.data);
    for(const card of data.cards){
      const prev = findPreviousCard(card.id);
      inferCrossDayGate(prev, card);
      applyReviewSchedule(data, card);
    }
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
      const response = await nativeFetch(input, requestWithJson(init, transformed));
      return response;
    }

    const response = await nativeFetch(input, init);
    if(endpoint === "/api/learning-data" && method === "GET" && response.ok){
      try{
        const payload = await response.clone().json();
        if(payload?.data){
          payload.data = normalizeLearningData(payload.data);
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
      if(payload?.data) latestLearningData = normalizeLearningData(payload.data);
    }catch{}
  }

  function scheduleReload(delay=450){
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(()=>location.reload(), delay);
  }

  function currentStudyWord(){
    return String(document.querySelector(".word-hero,.word-title,.apply-word-hero strong,.study-card h2")?.textContent||"").trim().toLowerCase();
  }

  function currentCard(){
    const word = currentStudyWord();
    if(!word) return null;
    return latestLearningData?.cards?.find(c=>String(c.word||"").trim().toLowerCase()===word) || null;
  }

  function decorateHome(){
    const homeTitle = Array.from(document.querySelectorAll("h1,h2")).find(x=>x.textContent.trim()==="今日学习");
    if(!homeTitle || !latestLearningData) return;
    const due = latestLearningData.cards.filter(isDue);
    const eligible = latestLearningData.cards.filter(c=>["select","memorize1","memorize2","visualize","apply"].includes(c.stage) && eligibleToday(c));
    const primary = document.querySelector('[data-action="continue-learning"],[data-action="start-review"]');
    if(primary && due.length){
      primary.dataset.action = "start-review";
      primary.textContent = `先复习 ${due.length} 个到期词`;
    }else if(primary && !eligible.length){
      primary.disabled = true;
      primary.textContent = "今天的学习推进已完成";
      primary.title = "下一阶段会在下一个学习日开放";
    }

    document.querySelectorAll(".stat-label").forEach(label=>{
      if(label.textContent.trim()==="连续学习"){
        const card = label.closest(".card.stat");
        if(card){
          const stable = latestLearningData.cards.filter(c=>c.memoryState==="stable").length;
          const value = card.querySelector(".stat-value");
          const hint = card.querySelector(".stat-hint");
          label.textContent = "长期稳定";
          if(value) value.textContent = String(stable);
          if(hint) hint.textContent = "已进入长期保持的词";
        }
      }
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
    if(generate && !String(editor.value||"").trim()){
      generate.disabled = true;
      generate.title = "先写下你自己的联想场景";
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
    decorateHome();
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
    const action = button.dataset.action;

    if(action === "continue-learning"){
      const eligible = latestLearningData?.cards?.filter(c=>["select","memorize1","memorize2","visualize","apply"].includes(c.stage) && eligibleToday(c)) || [];
      if(!eligible.length){
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
    }

    if(action === "complete-stage" && button.dataset.next === "memorize1") scheduleReload();
    if(action === "memory-rate" && currentCard()?.stage === "memorize2") scheduleReload();
    if(action === "finish-visual") scheduleReload();
    if(action === "pass-apply") scheduleReload(700);
    if(action === "initial-review-rate") scheduleReload(650);
    if(action === "review-rate" && button.dataset.quality === "again") scheduleReload(650);
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
