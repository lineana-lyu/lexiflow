(() => {
  "use strict";

  const core = window.LexiFlowLearningCore;
  if(!core) throw new Error("LexiFlowLearningCore must load before review-transition-v2.js");

  let saving = false;
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `review-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const normalize = value => String(value || "").trim().toLowerCase();

  async function loadData(){
    const response = await fetch("/api/learning-data",{cache:"no-store"});
    if(!response.ok) throw new Error("LOAD_FAILED");
    const payload = await response.json();
    return payload?.data ? core.normalizeData(payload.data) : null;
  }

  async function persist(data){
    const response = await fetch("/api/learning-data",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({data}),
    });
    if(!response.ok) throw new Error("SAVE_FAILED");
  }

  function domWord(){
    return normalize(
      document.querySelector("[data-lexi-r2-word]")?.dataset.lexiR2Word ||
      document.querySelector(".review-depth-stage .target-word-text")?.textContent ||
      document.querySelector(".study-card-focus .target-word-text")?.textContent || ""
    );
  }

  function cardForDom(data){
    const word = domWord();
    if(!word || !Array.isArray(data?.cards)) return null;
    return data.cards.find(card=>card.stage === "review" && normalize(card.word) === word) || null;
  }

  function activeQuestionType(card){
    try{
      const saved = JSON.parse(localStorage.getItem("lexiflow-review-resume-v2") || "{}");
      const active = saved?.active;
      if(active?.cardId === card.id && active?.type) return String(active.type);
    }catch{}
    return "";
  }

  function reviewKind(card, now){
    if(card.memoryState === "review_again"){
      return card.reviewAgainFailedOn === core.dayKey(now) ? "same-day-repair" : "next-day-validation";
    }
    return card.memoryState === "stable" ? "stable-maintenance" : "scheduled";
  }

  function updateReviewSessionLocal(card, quality, now){
    const key = "lexiflow-review-session-state-v2";
    try{
      const current = JSON.parse(localStorage.getItem(key) || "null");
      if(!current || current.date !== core.dayKey(now)) return;
      const isRepair = card.memoryState === "review_again" && card.reviewAgainFailedOn === core.dayKey(now);
      const attempt = `${card.id}:${isRepair?"repair":"normal"}`;
      current.attempted = Array.isArray(current.attempted) ? current.attempted : [];
      if(!current.attempted.includes(attempt)) current.attempted.push(attempt);
      current.repairTail = Array.isArray(current.repairTail) ? current.repairTail : [];
      if(quality !== "good" && !isRepair && !current.repairTail.includes(card.id)) current.repairTail.push(card.id);
      current.activeCardId = card.id;
      current.activeKind = isRepair ? "repair" : "normal";
      current.updatedAt = now.toISOString();
      localStorage.setItem(key,JSON.stringify(current));
    }catch{}
  }

  async function complete(button, quality){
    if(saving) return;
    saving = true;
    const originalText = button?.textContent || "";
    if(button) button.disabled = true;
    try{
      const data = await loadData();
      const card = cardForDom(data);
      if(!card) throw new Error("REVIEW_CARD_NOT_FOUND");

      const now = new Date();
      const prev = {...card};
      const patch = core.reviewSchedulePatch(prev,quality,now);
      if(!patch) throw new Error("REVIEW_PATCH_FAILED");

      card.reviewCount = Number(card.reviewCount || 0) + 1;
      card.lastReviewedAt = now.toISOString();
      card.initialReviewPending = false;
      Object.assign(card,patch);
      card.updatedAt = now.toISOString();

      data.activities = Array.isArray(data.activities) ? data.activities : [];
      data.activities.push({
        id:uid(),
        type:"review",
        cardId:card.id,
        quality,
        kind:reviewKind(prev,now),
        questionType:activeQuestionType(card),
        reviewStepBefore:Number(prev.reviewStep || 0),
        reviewStepAfter:Number(card.reviewStep || 0),
        memoryStateBefore:String(prev.memoryState || "reinforcing"),
        memoryStateAfter:String(card.memoryState || "reinforcing"),
        at:now.toISOString(),
      });

      updateReviewSessionLocal(prev,quality,now);
      data.dailyPlan = core.buildDailyPlan(data,now);
      await persist(data);

      if(button){
        button.textContent = quality === "good" ? "已记录" : "已加入修复复测";
      }
      setTimeout(()=>location.reload(),120);
    }catch(err){
      console.error("authoritative review transition failed",err);
      if(button){
        button.disabled = false;
        button.textContent = originalText;
      }
    }finally{
      saving = false;
    }
  }

  // Capture Review ratings before the legacy app button handler. The legacy app still
  // renders Review UI, but it no longer decides intervals, Review Again, or Stable state.
  document.addEventListener("click",event=>{
    const button = event.target?.closest?.('[data-action="review-rate"],[data-action="initial-review-rate"]');
    if(!button) return;
    const quality = String(button.dataset.quality || "");
    if(!["good","again"].includes(quality)) return;

    event.preventDefault();
    event.stopPropagation();
    void complete(button,quality);
  },true);
})();
