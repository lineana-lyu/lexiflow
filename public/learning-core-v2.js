(() => {
  "use strict";

  const REVIEW_INTERVALS = Object.freeze([1, 3, 7, 16, 21]);
  const STABLE_INTERVALS = Object.freeze([30, 45, 68, 90]);
  const TODAY_ORDER = Object.freeze(["review", "memorize", "visualize", "apply", "select"]);

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

  function eligibleToday(card, now = new Date()){
    if(!card?.stageEligibleOn) return true;
    return valueDayKey(card.stageEligibleOn) <= dayKey(now);
  }

  function isDue(card, now = new Date()){
    return card?.stage === "review" && card?.nextReviewAt && new Date(card.nextReviewAt).getTime() <= now.getTime();
  }

  function normalizeCard(raw, now = new Date()){
    const card = {...raw};
    if(!card.memoryState){
      card.memoryState = card.stage === "review" ? "reinforcing" : card.stage === "mastered" ? "stable" : "learning";
    }
    if(!Number.isFinite(Number(card.reviewStep))) card.reviewStep = 0;
    if(!Number.isFinite(Number(card.stableStep))) card.stableStep = 0;

    if(card.stage === "mastered"){
      card.stage = "review";
      card.memoryState = "stable";
    }

    if(card.stage === "select" && card.inboxPending === undefined){
      card.inboxPending = card.todaySelectedOn ? false : !card.selectedOn;
      if(card.inboxPending && !card.inboxAddedOn) card.inboxAddedOn = valueDayKey(card.createdAt) || dayKey(now);
    }
    if(card.stage !== "select" && card.inboxPending === true) card.inboxPending = false;

    // Old builds treated the first Review as part of the Apply screen. V2 migrates
    // that legacy flag into a normal next-day Review task so Apply is never allowed
    // to count as active recall.
    if(card.stage === "review" && card.initialReviewPending){
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
      if(card.memoryState === "review_again"){
        // Next-day validation comes first. A same-day repair retest is deliberately
        // pushed behind all remaining normal due items so it behaves like queue-tail.
        return card.reviewAgainFailedOn === dayKey(now) ? 70 : -2;
      }
      return -1;
    }

    if(!eligibleToday(card, now)) return 90;
    if(card?.stage === "memorize1" || card?.stage === "memorize2") return 1;
    if(card?.stage === "visualize") return 2;
    if(card?.stage === "apply") return 3;
    if(card?.stage === "select") return 4;
    return 80;
  }

  function selectedTodayIds(cards, now = new Date()){
    const today = dayKey(now);
    return new Set((cards||[]).filter(card => valueDayKey(card.todaySelectedOn || card.selectedOn) === today).map(card => card.id));
  }

  function buildDailyPlan(data, now = new Date()){
    const cards = Array.isArray(data?.cards) ? data.cards : [];
    const goalRaw = Number(data?.settings?.dailyGoal);
    const goal = Number.isFinite(goalRaw) && goalRaw > 0 ? Math.round(goalRaw) : 3;
    const selectedIds = selectedTodayIds(cards, now);
    const review = cards.filter(card => isDue(card, now)).map(card => card.id);
    const memorize = cards.filter(card => !card.inboxPending && (card.stage === "memorize1" || card.stage === "memorize2") && eligibleToday(card, now)).map(card => card.id);
    const visualize = cards.filter(card => !card.inboxPending && card.stage === "visualize" && eligibleToday(card, now)).map(card => card.id);
    const apply = cards.filter(card => !card.inboxPending && card.stage === "apply" && eligibleToday(card, now)).map(card => card.id);
    const select = cards.filter(card => card.stage === "select" && card.inboxPending === false && eligibleToday(card, now)).map(card => card.id);
    const inbox = cards.filter(card => card.stage === "select" && card.inboxPending === true).map(card => card.id);
    return {
      date: dayKey(now),
      generatedAt: now.toISOString(),
      noVocabularyDebt: true,
      review,
      memorize,
      visualize,
      apply,
      select,
      inbox,
      selectGoal: goal,
      selectedToday: Array.from(selectedIds),
      remainingSelectSlots: Math.max(0, goal-selectedIds.size),
    };
  }

  function normalizeData(raw, now = new Date()){
    if(!raw || !Array.isArray(raw.cards)) return raw;
    const cards = raw.cards.map(card => normalizeCard(card, now));
    cards.sort((a,b)=>{
      const diff = learningPriority(a, now)-learningPriority(b, now);
      return diff || (new Date(a.createdAt||0)-new Date(b.createdAt||0));
    });
    const data = {...raw, cards};
    data.dailyPlan = buildDailyPlan(data, now);
    return data;
  }

  function crossDayPatch(prev, next, now = new Date()){
    if(!prev || !next) return null;
    const today = dayKey(now);
    if(prev.stage === "select" && next.stage === "memorize1"){
      return {stageEligibleOn:addDaysIso(now,1),selectedOn:today,memoryState:"learning",memorizeRound:1,inboxPending:false};
    }
    if(prev.stage === "memorize2" && next.stage === "visualize"){
      return {stageEligibleOn:addDaysIso(now,1),memorizeCompletedOn:today,memoryState:"learning"};
    }
    if(prev.stage === "visualize" && next.stage === "apply"){
      return {stageEligibleOn:addDaysIso(now,1),visualizeCompletedOn:today,memoryState:"learning"};
    }
    if(prev.stage === "apply" && next.stage === "review"){
      return {
        stageEligibleOn:addDaysIso(now,1),
        applyCompletedOn:today,
        memoryState:"reinforcing",
        reviewStep:0,
        stableStep:0,
        nextReviewAt:addDaysIso(now,1),
        initialReviewPending:false,
      };
    }
    return null;
  }

  function reviewSchedulePatch(prev, quality, now = new Date()){
    if(!prev) return null;
    const today = dayKey(now);

    if(prev.memoryState === "review_again"){
      const sameDay = prev.reviewAgainFailedOn === today || prev.sameDayRetestUsedOn === today;
      if(sameDay){
        return {
          memoryState:"review_again",
          reviewAgainNeedsNextDay:true,
          stableStep:0,
          nextReviewAt:addDaysIso(now,1),
        };
      }
      if(quality === "good"){
        const origin = Number.isFinite(Number(prev.reviewAgainOriginStep)) ? Number(prev.reviewAgainOriginStep) : Number(prev.reviewStep||0);
        const recovered = Math.max(0, origin-1);
        return {
          memoryState:"reinforcing",
          reviewStep:recovered,
          stableStep:0,
          reviewAgainNeedsNextDay:false,
          nextReviewAt:addDaysIso(now,REVIEW_INTERVALS[recovered]),
        };
      }
      return {
        memoryState:"review_again",
        stableStep:0,
        reviewAgainFailedOn:today,
        sameDayRetestUsedOn:today,
        reviewAgainNeedsNextDay:true,
        nextReviewAt:now.toISOString(),
      };
    }

    if(quality !== "good"){
      return {
        memoryState:"review_again",
        stableStep:0,
        reviewAgainOriginStep:Number(prev.reviewStep||0),
        reviewAgainFailedOn:today,
        sameDayRetestUsedOn:today,
        reviewAgainNeedsNextDay:true,
        nextReviewAt:now.toISOString(),
      };
    }

    if(prev.memoryState === "stable"){
      const stableStep = Math.min(Number(prev.stableStep||0)+1, STABLE_INTERVALS.length-1);
      return {memoryState:"stable",stableStep,nextReviewAt:addDaysIso(now,STABLE_INTERVALS[stableStep])};
    }

    const current = Number(prev.reviewStep||0);
    const nextStep = current+1;
    if(nextStep >= REVIEW_INTERVALS.length){
      return {
        memoryState:"stable",
        reviewStep:REVIEW_INTERVALS.length-1,
        stableStep:0,
        nextReviewAt:addDaysIso(now,STABLE_INTERVALS[0]),
      };
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
    TODAY_ORDER,
    dayKey,
    valueDayKey,
    addDaysIso,
    eligibleToday,
    isDue,
    normalizeCard,
    learningPriority,
    buildDailyPlan,
    normalizeData,
    crossDayPatch,
    reviewSchedulePatch,
    firstPlanStage,
  });
})();