(() => {
  "use strict";

  const REVIEW_INTERVALS = Object.freeze([1, 3, 7, 16, 21]);
  const STABLE_INTERVALS = Object.freeze([30, 45, 68, 90]);
  const STABLE_WINDOWS = Object.freeze([2, 3, 4, 5]);
  const TODAY_ORDER = Object.freeze(["review", "memorize", "visualize", "apply", "select"]);
  const PLAN_VERSION = 5;
  // Kept only as a compatibility export. Review V4 has no hard cap for critical reviews.
  const REVIEW_INTELLIGENT_CAP = null;
  const STABLE_DAILY_TARGET = 6;

  function dayKey(input = new Date()){
    const d = input instanceof Date ? input : new Date(input);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }

  function valueDayKey(value){
    const raw = String(value || "").trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return raw ? dayKey(raw) : "";
  }

  function addDaysIso(input, days){
    const d = input instanceof Date ? new Date(input) : new Date(input || Date.now());
    d.setHours(12,0,0,0);
    d.setDate(d.getDate()+days);
    return d.toISOString();
  }

  function dayOrdinal(value){
    const key=valueDayKey(value);
    if(!key)return null;
    const [y,m,d]=key.split("-").map(Number);
    return Math.round(Date.UTC(y,m-1,d)/86400000);
  }

  function dayDistance(from,to){
    const a=dayOrdinal(from),b=dayOrdinal(to);
    return a===null||b===null?Number.POSITIVE_INFINITY:b-a;
  }

  function canonicalStage(value){
    const raw = String(value && typeof value === "object" ? (value.learningStage || value.stage || "") : (value || "")).trim().toLowerCase();
    if(raw === "memorize" || raw === "memorize1" || raw === "memorize2") return "memorize";
    if(raw === "mastered") return "review";
    return raw;
  }

  function eligibleToday(card, now = new Date()){
    if(!card?.stageEligibleOn) return true;
    return valueDayKey(card.stageEligibleOn) <= dayKey(now);
  }

  function isDue(card, now = new Date()){
    if(canonicalStage(card) !== "review" || !card?.nextReviewAt) return false;
    return valueDayKey(card.nextReviewAt) <= dayKey(now);
  }

  function normalizeCard(raw, now = new Date()){
    const card = {...raw};
    if(!card.memoryState){
      card.memoryState = canonicalStage(card) === "review" ? "reinforcing" : card.stage === "mastered" ? "stable" : "learning";
    }
    if(!Number.isFinite(Number(card.reviewStep))) card.reviewStep = 0;
    if(!Number.isFinite(Number(card.stableStep))) card.stableStep = 0;

    if(card.stage === "mastered"){
      card.stage = "review";
      card.memoryState = "stable";
    }
    if(card.stage === "memorize1" || card.stage === "memorize2"){
      card.stage = "memorize";
    }

    card.learningStage = canonicalStage(card.stage);

    if(card.learningStage === "select" && card.inboxPending === undefined){
      card.inboxPending = card.todaySelectedOn ? false : !card.selectedOn;
      if(card.inboxPending && !card.inboxAddedOn) card.inboxAddedOn = valueDayKey(card.createdAt) || dayKey(now);
    }
    if(card.learningStage !== "select" && card.inboxPending === true) card.inboxPending = false;

    if(card.learningStage === "review" && card.initialReviewPending){
      card.initialReviewPending = false;
      if(!card.nextReviewAt){
        const base = card.applyCompletedOn && !Number.isNaN(new Date(card.applyCompletedOn).getTime())
          ? new Date(card.applyCompletedOn)
          : now;
        card.nextReviewAt = addDaysIso(base, 1);
      }
    }

    if(card.memoryState === "stable" && !card.nextReviewAt){
      card.nextReviewAt = addDaysIso(now, STABLE_INTERVALS[Math.min(Number(card.stableStep||0), STABLE_INTERVALS.length-1)]);
    }
    return card;
  }

  function learningPriority(card, now = new Date()){
    if(card?.inboxPending) return 100;
    if(isDue(card, now)){
      if(card.memoryState === "review_again") return card.reviewAgainFailedOn === dayKey(now) ? 70 : -2;
      if(card.memoryState === "stable") return 0;
      return -1;
    }
    if(!eligibleToday(card, now)) return 90;
    const stage = canonicalStage(card);
    if(stage === "memorize") return 1;
    if(stage === "visualize") return 2;
    if(stage === "apply") return 3;
    if(stage === "select") return 4;
    return 80;
  }

  function selectedTodayIds(cards, now = new Date()){
    const today = dayKey(now);
    return new Set((cards||[]).filter(card => valueDayKey(card.todaySelectedOn || card.selectedOn) === today).map(card => card.id));
  }

  function currentBuckets(cards, now){
    return {
      review: cards.filter(card => isDue(card, now)).map(card => card.id),
      memorize: cards.filter(card => !card.inboxPending && canonicalStage(card) === "memorize" && eligibleToday(card, now)).map(card => card.id),
      visualize: cards.filter(card => !card.inboxPending && canonicalStage(card) === "visualize" && eligibleToday(card, now)).map(card => card.id),
      apply: cards.filter(card => !card.inboxPending && canonicalStage(card) === "apply" && eligibleToday(card, now)).map(card => card.id),
      select: cards.filter(card => canonicalStage(card) === "select" && card.inboxPending === false && eligibleToday(card, now)).map(card => card.id),
      inbox: cards.filter(card => canonicalStage(card) === "select" && card.inboxPending === true).map(card => card.id),
    };
  }

  function stableWindowDays(card){
    const index=Math.max(0,Math.min(Number(card?.stableStep||0),STABLE_WINDOWS.length-1));
    return STABLE_WINDOWS[index];
  }

  function reviewCardSort(a,b){
    if(a?.memoryState==="review_again"&&b?.memoryState!=="review_again")return -1;
    if(b?.memoryState==="review_again"&&a?.memoryState!=="review_again")return 1;
    const ad=dayOrdinal(a?.nextReviewAt),bd=dayOrdinal(b?.nextReviewAt);
    if(ad!==bd)return (ad??Number.MAX_SAFE_INTEGER)-(bd??Number.MAX_SAFE_INTEGER);
    const ac=new Date(a?.createdAt||0).getTime(),bc=new Date(b?.createdAt||0).getTime();
    if(ac!==bc)return ac-bc;
    return String(a?.id||"").localeCompare(String(b?.id||""));
  }

  function stableDailyTarget(criticalCount){
    if(criticalCount>=17)return 0;
    if(criticalCount>=13)return 2;
    if(criticalCount>=9)return 4;
    return STABLE_DAILY_TARGET;
  }

  function reviewWorkload(cards, now = new Date()){
    const reviewCards=(cards||[]).filter(card=>canonicalStage(card)==="review"&&card?.nextReviewAt);
    const critical=reviewCards.filter(card=>card.memoryState!=="stable"&&isDue(card,now)).sort(reviewCardSort);
    const stable=reviewCards.filter(card=>card.memoryState==="stable").map(card=>({
      card,
      distance:dayDistance(now,card.nextReviewAt),
      window:stableWindowDays(card),
    }));
    const stableUrgent=stable.filter(item=>item.distance < -item.window).sort((a,b)=>a.distance-b.distance||reviewCardSort(a.card,b.card));
    const stableDue=stable.filter(item=>item.distance<=0&&item.distance>=-item.window).sort((a,b)=>a.distance-b.distance||reviewCardSort(a.card,b.card));
    const stableNear=stable.filter(item=>item.distance>0&&item.distance<=item.window).sort((a,b)=>a.distance-b.distance||reviewCardSort(a.card,b.card));

    const target=stableDailyTarget(critical.length);
    const optionalCapacity=Math.max(0,target-stableUrgent.length);
    const selectedDue=stableDue.slice(0,optionalCapacity);
    const remainingCapacity=Math.max(0,optionalCapacity-selectedDue.length);
    const selectedNear=stableNear.slice(0,remainingCapacity);
    const stableScheduled=[...stableUrgent,...selectedDue,...selectedNear].map(item=>item.card);
    const review=[...critical,...stableScheduled];

    return {
      review:review.map(card=>card.id),
      candidateIds:new Set([...critical,...stableUrgent.map(item=>item.card),...stableDue.map(item=>item.card),...stableNear.map(item=>item.card)].map(card=>card.id)),
      criticalCount:critical.length,
      stableScheduledCount:stableScheduled.length,
      stableUrgentCount:stableUrgent.length,
      stableDueTotal:stableUrgent.length+stableDue.length,
      stableDeferredCount:Math.max(0,stableDue.length-selectedDue.length),
      stablePulledForwardCount:selectedNear.length,
      reviewDueTotal:critical.length+stableUrgent.length+stableDue.length,
      pressure:review.length,
      stableTarget:target,
    };
  }

  function adaptiveNewWordGoal(baseGoal, reviewPressure){
    const base=Math.max(0,Math.round(Number(baseGoal)||0));
    const pressure=Math.max(0,Number(reviewPressure)||0);
    if(!base)return 0;
    if(pressure>=17)return 0;
    if(pressure>=13)return Math.min(base,Math.max(1,Math.ceil(base/3)));
    if(pressure>=9)return Math.min(base,Math.max(1,Math.ceil(base*2/3)));
    return base;
  }

  function reviewPolicy(){
    return {mode:"adaptive-v4",cap:null};
  }

  function keepFrozenOrder(previousIds, currentIds){
    const current = new Set(currentIds || []);
    return (previousIds || []).filter(id => current.has(id));
  }

  function appendTodaySelections(base, candidates, cards, now){
    const seen = new Set(base);
    const today = dayKey(now);
    const extra = (cards || [])
      .filter(card => candidates.includes(card.id) && !seen.has(card.id) && valueDayKey(card.todaySelectedOn || card.selectedOn) === today)
      .sort((a,b)=>new Date(a.inboxSelectedAt || a.updatedAt || a.createdAt || 0)-new Date(b.inboxSelectedAt || b.updatedAt || b.createdAt || 0))
      .map(card => card.id);
    return [...base, ...extra];
  }

  function uniqueIds(ids){ return Array.from(new Set((ids||[]).filter(Boolean))); }
  function planTaskIds(review,memorize,visualize,apply,select){
    return uniqueIds([...(review||[]),...(memorize||[]),...(visualize||[]),...(apply||[]),...(select||[])]);
  }

  function buildDailyPlan(data, now = new Date()){
    const cards = Array.isArray(data?.cards) ? data.cards : [];
    const goalRaw = Number(data?.settings?.dailyGoal);
    const baseGoal = Number.isFinite(goalRaw) && goalRaw > 0 ? Math.round(goalRaw) : 3;
    const selectedIds = selectedTodayIds(cards, now);
    const buckets = currentBuckets(cards, now);
    const reviewLoad=reviewWorkload(cards,now);
    const previous = data?.dailyPlan;
    // A plan generated by an older version is still frozen for the rest of that
    // StudyDay. Review V4 starts changing membership only on the next StudyDay.
    const sameDayFrozen = previous?.frozen === true && previous?.date === dayKey(now);

    let review = reviewLoad.review;
    let memorize = buckets.memorize;
    let visualize = buckets.visualize;
    let apply = buckets.apply;
    let select = buckets.select;

    if(sameDayFrozen){
      review = keepFrozenOrder(previous.review, Array.from(reviewLoad.candidateIds));
      memorize = keepFrozenOrder(previous.memorize, buckets.memorize);
      visualize = keepFrozenOrder(previous.visualize, buckets.visualize);
      apply = keepFrozenOrder(previous.apply, buckets.apply);
      select = appendTodaySelections(keepFrozenOrder(previous.select, buckets.select), buckets.select, cards, now);
    }

    const previousMaxGoal=sameDayFrozen?Number(previous?.selectMaxGoal):Number.NaN;
    const goalSettingChanged=sameDayFrozen&&Number.isFinite(previousMaxGoal)&&previousMaxGoal!==baseGoal;
    const frozenGoal=Math.max(0,Number(previous?.selectGoal ?? baseGoal)||0);
    const pressureForGoalChange=Math.max(0,Number(previous?.reviewPressure ?? reviewLoad.pressure)||0);
    const recalculatedGoal=adaptiveNewWordGoal(baseGoal,pressureForGoalChange);
    const effectiveGoal=sameDayFrozen
      ? (goalSettingChanged
          ? Math.max(selectedIds.size,Math.min(baseGoal,recalculatedGoal))
          : Math.max(selectedIds.size,frozenGoal))
      : adaptiveNewWordGoal(baseGoal,reviewLoad.pressure);
    const remainingTaskIds=planTaskIds(review,memorize,visualize,apply,select);
    let initialTaskIds=sameDayFrozen
      ? uniqueIds(Array.isArray(previous.initialTaskIds)?previous.initialTaskIds:planTaskIds(previous.review,previous.memorize,previous.visualize,previous.apply,previous.select))
      : [...remainingTaskIds];
    if(sameDayFrozen){
      for(const id of select)if(!initialTaskIds.includes(id))initialTaskIds.push(id);
    }
    const taskTotal=initialTaskIds.length;
    const taskRemaining=remainingTaskIds.length;
    const taskCompleted=Math.max(0,taskTotal-taskRemaining);
    const legacyFrozen=sameDayFrozen&&Number(previous.planVersion||0)<PLAN_VERSION;
    const remainingReviewCards=review.map(id=>cards.find(card=>card.id===id)).filter(Boolean);
    const remainingCriticalCount=remainingReviewCards.filter(card=>card.memoryState!=="stable").length;
    const remainingStableCount=remainingReviewCards.filter(card=>card.memoryState==="stable").length;

    return {
      date: dayKey(now),
      generatedAt: sameDayFrozen ? previous.generatedAt : now.toISOString(),
      planVersion: PLAN_VERSION,
      frozen: true,
      noVocabularyDebt: true,
      noReviewDebt: true,
      review,
      memorize,
      visualize,
      apply,
      select,
      inbox: buckets.inbox,
      reviewMode:"adaptive-v4",
      reviewLoadMode:legacyFrozen?"frozen-legacy":"adaptive-v4",
      reviewCap:null,
      reviewDueTotal:legacyFrozen?Number(previous.reviewDueTotal??reviewLoad.reviewDueTotal):reviewLoad.reviewDueTotal,
      reviewDeferredCount:legacyFrozen?Number(previous.reviewDeferredCount||0):reviewLoad.stableDeferredCount,
      reviewCriticalCount:remainingCriticalCount,
      reviewStableScheduledCount:remainingStableCount,
      reviewStableUrgentCount:legacyFrozen?0:reviewLoad.stableUrgentCount,
      reviewStableDeferredCount:legacyFrozen?Number(previous.reviewDeferredCount||0):reviewLoad.stableDeferredCount,
      reviewStablePulledForwardCount:legacyFrozen?0:reviewLoad.stablePulledForwardCount,
      reviewStableTarget:legacyFrozen?null:reviewLoad.stableTarget,
      reviewPressure:review.length,
      selectMaxGoal:baseGoal,
      selectGoal:effectiveGoal,
      selectedToday: Array.from(selectedIds),
      remainingSelectSlots: Math.max(0, effectiveGoal-selectedIds.size),
      initialTaskIds,
      taskTotal,
      taskRemaining,
      taskCompleted,
      taskProgressPercent:taskTotal?Math.round(taskCompleted/taskTotal*100):100,
    };
  }

  function planIndexMap(plan){
    const result = new Map();
    let index = 0;
    for(const key of TODAY_ORDER){
      for(const id of plan?.[key] || []){
        if(!result.has(id)) result.set(id,index++);
      }
      index += 1000;
    }
    return result;
  }

  function normalizeData(raw, now = new Date()){
    if(!raw || !Array.isArray(raw.cards)) return raw;
    const cards = raw.cards.map(card => normalizeCard(card, now));
    const previousPlan = raw.dailyPlan;
    const frozenToday = previousPlan?.date === dayKey(now) && previousPlan?.frozen;
    const order = frozenToday ? planIndexMap(previousPlan) : new Map();
    cards.sort((a,b)=>{
      if(frozenToday){
        const aPlanned = order.has(a.id), bPlanned = order.has(b.id);
        if(aPlanned !== bPlanned) return aPlanned ? -1 : 1;
      }
      const diff = learningPriority(a, now)-learningPriority(b, now);
      if(diff) return diff;
      const ai = order.has(a.id) ? order.get(a.id) : Number.MAX_SAFE_INTEGER;
      const bi = order.has(b.id) ? order.get(b.id) : Number.MAX_SAFE_INTEGER;
      if(ai !== bi) return ai-bi;
      return new Date(a.createdAt||0)-new Date(b.createdAt||0);
    });
    const data = {...raw, cards};
    data.dailyPlan = buildDailyPlan(data, now);
    return data;
  }

  function earlyCompletionPatch(prev, today){
    if(valueDayKey(prev?.earlyStudyOn) !== today) return {};
    return {
      lastEarlyStudiedOn:today,
      earlyStudyOn:null,
      earlyStudyAt:null,
      earlyOriginalStageEligibleOn:null,
    };
  }

  function crossDayPatch(prev, next, now = new Date()){
    if(!prev || !next) return null;
    const today = dayKey(now);
    const early = earlyCompletionPatch(prev,today);
    const prevStage = canonicalStage(prev);
    const nextStage = canonicalStage(next);
    if(prevStage === "select" && nextStage === "memorize"){
      return {stageEligibleOn:addDaysIso(now,1),selectedOn:today,memoryState:"learning",memorizeRound:1,inboxPending:false,...early};
    }
    if(prevStage === "memorize" && nextStage === "visualize"){
      return {stageEligibleOn:addDaysIso(now,1),memorizeCompletedOn:today,memoryState:"learning",...early};
    }
    if(prevStage === "visualize" && nextStage === "apply"){
      return {stageEligibleOn:addDaysIso(now,1),visualizeCompletedOn:today,memoryState:"learning",...early};
    }
    if(prevStage === "apply" && nextStage === "review"){
      return {stageEligibleOn:addDaysIso(now,1),applyCompletedOn:today,memoryState:"reinforcing",reviewStep:0,stableStep:0,nextReviewAt:addDaysIso(now,1),initialReviewPending:false,...early};
    }
    return null;
  }

  function reviewSchedulePatch(prev, quality, now = new Date()){
    if(!prev) return null;
    const today = dayKey(now);
    if(prev.memoryState === "review_again"){
      const sameDay = prev.reviewAgainFailedOn === today || prev.sameDayRetestUsedOn === today;
      if(sameDay){
        return {memoryState:"review_again",reviewAgainNeedsNextDay:true,stableStep:0,nextReviewAt:addDaysIso(now,1)};
      }
      if(quality === "good"){
        const origin = Number.isFinite(Number(prev.reviewAgainOriginStep)) ? Number(prev.reviewAgainOriginStep) : Number(prev.reviewStep||0);
        const recovered = Math.max(0, origin-1);
        return {memoryState:"reinforcing",reviewStep:recovered,stableStep:0,reviewAgainNeedsNextDay:false,nextReviewAt:addDaysIso(now,REVIEW_INTERVALS[recovered])};
      }
      return {memoryState:"review_again",stableStep:0,reviewAgainFailedOn:today,sameDayRetestUsedOn:null,reviewAgainNeedsNextDay:true,nextReviewAt:addDaysIso(now,1)};
    }

    if(quality !== "good"){
      return {memoryState:"review_again",stableStep:0,reviewAgainOriginStep:Number(prev.reviewStep||0),reviewAgainFailedOn:today,sameDayRetestUsedOn:today,reviewAgainNeedsNextDay:true,nextReviewAt:now.toISOString()};
    }

    if(prev.memoryState === "stable"){
      const stableStep = Math.min(Number(prev.stableStep||0)+1, STABLE_INTERVALS.length-1);
      return {memoryState:"stable",stableStep,nextReviewAt:addDaysIso(now,STABLE_INTERVALS[stableStep])};
    }

    const current = Number(prev.reviewStep||0);
    const nextStep = current+1;
    if(nextStep >= REVIEW_INTERVALS.length){
      return {memoryState:"stable",reviewStep:REVIEW_INTERVALS.length-1,stableStep:0,nextReviewAt:addDaysIso(now,STABLE_INTERVALS[0])};
    }
    return {memoryState:"reinforcing",reviewStep:nextStep,nextReviewAt:addDaysIso(now,REVIEW_INTERVALS[nextStep])};
  }

  function firstPlanStage(plan){
    for(const key of TODAY_ORDER) if((plan?.[key]||[]).length) return key;
    return "";
  }

  window.LexiFlowLearningCore = Object.freeze({
    REVIEW_INTERVALS,
    STABLE_INTERVALS,
    STABLE_WINDOWS,
    TODAY_ORDER,
    PLAN_VERSION,
    REVIEW_INTELLIGENT_CAP,
    STABLE_DAILY_TARGET,
    dayKey,
    valueDayKey,
    addDaysIso,
    canonicalStage,
    eligibleToday,
    isDue,
    normalizeCard,
    learningPriority,
    reviewPolicy,
    reviewWorkload,
    adaptiveNewWordGoal,
    buildDailyPlan,
    normalizeData,
    crossDayPatch,
    reviewSchedulePatch,
    firstPlanStage,
  });
})();
