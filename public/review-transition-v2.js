(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before review-transition-v2.js");

  const previousFetch=window.fetch.bind(window);
  const REVIEW_AUTH_FIELDS=[
    "memoryState","reviewStep","stableStep","nextReviewAt","initialReviewPending","lastReviewedAt",
    "reviewAgainOriginStep","reviewAgainFailedOn","sameDayRetestUsedOn","reviewAgainNeedsNextDay"
  ];
  let snapshot=null;
  let pendingIntent=null;
  const authoritativeAttempts=new Map();

  const normalize=value=>String(value||"").trim().toLowerCase();

  function endpointOf(input){
    try{return new URL(typeof input==="string"?input:input?.url||"",location.href).pathname;}catch{return"";}
  }
  function parseBody(init){
    if(!init||typeof init.body!=="string")return null;
    try{return JSON.parse(init.body);}catch{return null;}
  }
  function requestWithJson(init,body){
    return {...(init||{}),headers:{"Content-Type":"application/json",...((init&&init.headers)||{})},body:JSON.stringify(body)};
  }

  function domWord(){
    return normalize(
      document.querySelector("[data-lexi-r2-word]")?.dataset.lexiR2Word||
      document.querySelector(".review-depth-stage .target-word-text")?.textContent||
      document.querySelector(".study-card-focus .target-word-text")?.textContent||""
    );
  }

  function currentQuestionType(){
    try{
      const saved=JSON.parse(localStorage.getItem("lexiflow-review-resume-v2")||"{}");
      return String(saved?.active?.type||"");
    }catch{return"";}
  }

  function latestReviewActivity(data,cardId){
    const list=Array.isArray(data?.activities)?data.activities:[];
    for(let i=list.length-1;i>=0;i--){
      const item=list[i];
      if(item?.type==="review"&&item?.cardId===cardId)return item;
    }
    return null;
  }

  function reviewKind(card,now){
    if(card.memoryState==="review_again"){
      return card.reviewAgainFailedOn===core.dayKey(now)?"same-day-repair":"next-day-validation";
    }
    return card.memoryState==="stable"?"stable-maintenance":"scheduled";
  }

  function captureAuthority(card){
    const fields={};
    for(const key of REVIEW_AUTH_FIELDS){
      if(Object.prototype.hasOwnProperty.call(card,key))fields[key]=card[key];
    }
    return{reviewCount:Number(card.reviewCount||0),fields};
  }

  function applyAuthority(card,authority){
    if(!authority)return;
    card.reviewCount=authority.reviewCount;
    for(const key of REVIEW_AUTH_FIELDS){
      if(Object.prototype.hasOwnProperty.call(authority.fields,key))card[key]=authority.fields[key];
      else delete card[key];
    }
  }

  function transformReviewMutations(body){
    if(!body?.data||!Array.isArray(body.data.cards)||!snapshot?.cards)return{body,failed:false};
    const data=body.data;
    let failed=false;

    for(const next of data.cards){
      if(next?.stage!=="review")continue;
      const prev=snapshot.cards.find(card=>card.id===next.id);
      if(!prev)continue;

      const nextCount=Number(next.reviewCount||0);
      const existingAuthority=authoritativeAttempts.get(next.id);

      // app.js currently calls saveData twice for one Review rating (recordActivity +
      // explicit save). The second snapshot still contains its legacy +3/+1 fields.
      // Re-apply the first Core result so the duplicate write is idempotent instead of
      // silently overwriting the authoritative schedule.
      if(existingAuthority&&nextCount===existingAuthority.reviewCount){
        applyAuthority(next,existingAuthority);
        continue;
      }
      if(Number(next.reviewCount||0)<=Number(prev.reviewCount||0))continue;

      const activity=latestReviewActivity(data,next.id);
      const quality=String(activity?.quality||pendingIntent?.quality||"");
      if(!["good","again"].includes(quality))continue;

      const now=new Date();
      const patch=core.reviewSchedulePatch(prev,quality,now);
      if(!patch)continue;

      next.initialReviewPending=false;
      Object.assign(next,patch);
      next.updatedAt=now.toISOString();
      authoritativeAttempts.set(next.id,captureAuthority(next));

      if(activity){
        activity.kind=reviewKind(prev,now);
        activity.questionType=pendingIntent?.word===normalize(next.word)?String(pendingIntent.questionType||""):String(activity.questionType||"");
        activity.reviewStepBefore=Number(prev.reviewStep||0);
        activity.reviewStepAfter=Number(next.reviewStep||0);
        activity.memoryStateBefore=String(prev.memoryState||"reinforcing");
        activity.memoryStateAfter=String(next.memoryState||"reinforcing");
        activity.reviewCountAfter=nextCount;
      }

      if(quality==="again")failed=true;
    }

    data.dailyPlan=core.buildDailyPlan(data,new Date());
    pendingIntent=null;
    return{body:{...body,data},failed};
  }

  window.fetch=async function lexiReviewTransitionFetch(input,init={}){
    const endpoint=endpointOf(input),method=String(init?.method||"GET").toUpperCase();

    if(endpoint==="/api/learning-data"&&method==="POST"){
      const transformed=transformReviewMutations(parseBody(init));
      const response=await previousFetch(input,requestWithJson(init,transformed.body));
      if(response.ok&&transformed.body?.data){
        snapshot=core.normalizeData(JSON.parse(JSON.stringify(transformed.body.data)));
        if(transformed.failed)setTimeout(()=>location.reload(),180);
      }
      return response;
    }

    const response=await previousFetch(input,init);
    if(endpoint==="/api/learning-data"&&method==="GET"&&response.ok){
      try{
        const payload=await response.clone().json();
        if(payload?.data)snapshot=core.normalizeData(payload.data);
      }catch{}
    }
    return response;
  };

  // The legacy app may still advance its in-memory Review cursor, but the persisted
  // interval/state is rewritten here from Learning Core before it reaches storage.
  // This keeps a seamless multi-card Review session without giving legacy +3/+1 logic
  // authority over Review Again or Stable scheduling.
  document.addEventListener("click",event=>{
    const button=event.target?.closest?.('[data-action="review-rate"],[data-action="initial-review-rate"]');
    if(!button)return;
    const quality=String(button.dataset.quality||"");
    if(!["good","again"].includes(quality))return;
    pendingIntent={
      word:domWord(),
      quality,
      questionType:currentQuestionType(),
      capturedAt:new Date().toISOString(),
    };
  },true);
})();