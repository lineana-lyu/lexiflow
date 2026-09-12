(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before review-transaction-v3.js");

  const SESSION_KEY="lexiflow-review-session-v3";
  const previousFetch=window.fetch.bind(window);
  const PENDING_GRACE_MS=30000;

  function endpointOf(input){
    try{return new URL(typeof input==="string"?input:input?.url||"",location.href).pathname;}catch{return"";}
  }
  function parseBody(init){
    if(!init||typeof init.body!=="string")return null;
    try{return JSON.parse(init.body);}catch{return null;}
  }
  function loadSession(){
    try{
      const value=JSON.parse(localStorage.getItem(SESSION_KEY)||"null");
      return value&&typeof value==="object"?value:null;
    }catch{return null;}
  }
  function saveSession(session){
    try{
      if(session)localStorage.setItem(SESSION_KEY,JSON.stringify({...session,updatedAt:new Date().toISOString()}));
      else localStorage.removeItem(SESSION_KEY);
    }catch{}
  }

  function latestV3Activity(data,cardId){
    const activities=Array.isArray(data?.activities)?data.activities:[];
    for(let index=activities.length-1;index>=0;index--){
      const item=activities[index];
      if(item?.type==="review"&&item?.cardId===cardId&&item?.authority==="review-session-v3")return item;
    }
    return null;
  }

  function pendingFromWrite(body,session){
    if(body?.reviewAuthority!=="v3"||!body?.data||!session?.active?.cardId)return null;
    const cardId=String(session.active.cardId||"");
    const card=body.data.cards?.find(item=>item.id===cardId);
    const activity=latestV3Activity(body.data,cardId);
    if(!card||!activity)return null;
    const after=Number(card.reviewCount||0);
    const baseline=Math.max(0,after-1);
    return {
      cardId,
      quality:String(activity.quality||""),
      questionType:String(activity.questionType||session.active?.type||""),
      phase:session.phase==="repair"?"repair":"normal",
      cursor:Number(session.cursor||0),
      repairCursor:Number(session.repairCursor||0),
      baselineReviewCount:baseline,
      expectedReviewCount:after,
      wasRepair:String(activity.kind||"")==="same-day-repair"||session.phase==="repair",
      activityId:String(activity.id||""),
      createdAt:new Date().toISOString(),
    };
  }

  function markPending(pending){
    if(!pending)return;
    const session=loadSession();
    if(!session)return;
    session.pendingCommit=pending;
    saveSession(session);
  }

  function activityConfirms(data,pending){
    const activity=latestV3Activity(data,pending.cardId);
    if(!activity)return false;
    if(pending.activityId&&activity.id!==pending.activityId)return false;
    return Number(activity.reviewCountAfter||0)>=Number(pending.expectedReviewCount||pending.baselineReviewCount+1);
  }

  function storageConfirms(data,pending){
    const card=data?.cards?.find(item=>item.id===pending.cardId);
    if(!card)return false;
    return Number(card.reviewCount||0)>=Number(pending.expectedReviewCount||pending.baselineReviewCount+1)&&activityConfirms(data,pending);
  }

  function finalizePending(pending){
    const session=loadSession();
    if(!session||session.date!==core.dayKey(new Date()))return;
    const samePending=session.pendingCommit;
    if(!samePending||samePending.cardId!==pending.cardId||Number(samePending.expectedReviewCount||0)!==Number(pending.expectedReviewCount||0))return;

    if(pending.quality==="again"&&!pending.wasRepair){
      session.repairTail=Array.isArray(session.repairTail)?session.repairTail:[];
      if(!session.repairTail.includes(pending.cardId))session.repairTail.push(pending.cardId);
      session.repairTypeByCard=session.repairTypeByCard&&typeof session.repairTypeByCard==="object"?session.repairTypeByCard:{};
      session.repairTypeByCard[pending.cardId]=String(pending.questionType||"");
    }

    if(pending.phase==="repair"){
      session.repairCursor=Math.max(Number(session.repairCursor||0),Number(pending.repairCursor||0)+1);
    }else{
      session.cursor=Math.max(Number(session.cursor||0),Number(pending.cursor||0)+1);
    }
    session.active=null;
    delete session.pendingCommit;
    session.lastRecoveredCommit={
      cardId:pending.cardId,
      reviewCount:Number(pending.expectedReviewCount||0),
      recoveredAt:new Date().toISOString(),
    };
    saveSession(session);
  }

  function clearUncommittedPending(pending){
    const session=loadSession();
    if(!session?.pendingCommit)return;
    if(session.pendingCommit.cardId!==pending.cardId)return;
    delete session.pendingCommit;
    saveSession(session);
  }

  function pendingIsStale(pending){
    const started=new Date(pending?.createdAt||0).getTime();
    return Number.isFinite(started)&&Date.now()-started>PENDING_GRACE_MS;
  }

  function reconcileFromData(data){
    const session=loadSession();
    const pending=session?.pendingCommit;
    if(!pending)return;
    if(storageConfirms(data,pending)){
      finalizePending(pending);
      return;
    }
    if(pendingIsStale(pending))clearUncommittedPending(pending);
  }

  window.fetch=async function lexiFlowReviewTransactionFetch(input,init={}){
    const endpoint=endpointOf(input),method=String(init?.method||"GET").toUpperCase();
    const body=endpoint==="/api/learning-data"&&method==="POST"?parseBody(init):null;
    const session=loadSession();
    const pending=pendingFromWrite(body,session);
    if(pending)markPending(pending);

    let response;
    try{
      response=await previousFetch(input,init);
    }catch(err){
      if(pending)clearUncommittedPending(pending);
      throw err;
    }

    if(endpoint==="/api/learning-data"&&method==="POST"&&pending){
      if(response.ok)finalizePending(pending);
      else clearUncommittedPending(pending);
      return response;
    }

    if(endpoint==="/api/learning-data"&&method==="GET"&&response.ok){
      try{
        const payload=await response.clone().json();
        if(payload?.data)reconcileFromData(payload.data);
      }catch{}
    }
    return response;
  };
})();