from pathlib import Path


def patch_session(path_str, label):
    path=Path(path_str)
    text=path.read_text(encoding="utf-8")
    old='''  async function refresh(){
    const response=await fetch("/api/learning-data",{cache:"no-store"});
    if(!response.ok)throw new Error("LOAD_FAILED");
    const payload=await response.json();
    data=payload?.data?core.normalizeData(payload.data):null;
    return data;
  }
'''
    new='''  function syncFromGateway(){
    try{
      const current=window.LexiFlowLearningDataGatewayV3?.current?.();
      if(!current?.cards)return false;
      data=core.normalizeData(current);
      return true;
    }catch{return false;}
  }

  async function refresh(force=false){
    if(!force&&syncFromGateway())return data;
    const response=await fetch("/api/learning-data",{cache:"no-store"});
    if(!response.ok)throw new Error("LOAD_FAILED");
    const payload=await response.json();
    data=payload?.data?core.normalizeData(payload.data):null;
    return data;
  }
'''
    if text.count(old)!=1:
        raise SystemExit(f"{label}: refresh block count was {text.count(old)}")
    text=text.replace(old,new,1)
    for required in [
        "function syncFromGateway()",
        "window.LexiFlowLearningDataGatewayV3?.current?.()",
        "if(!force&&syncFromGateway())return data;",
        'fetch("/api/learning-data",{cache:"no-store"})',
    ]:
        if required not in text:
            raise SystemExit(f"{label}: gateway-first read contract missing: {required}")
    path.write_text(text,encoding="utf-8")

patch_session("public/study-session-v3.js","Study Session")
patch_session("public/review-session-v3.js","Review Session")

study_check=Path("scripts/check-study-session-v3.js")
study=study_check.read_text(encoding="utf-8")
anchor='assert(session.includes("plannedLearningIds"),"Study Session V3 must derive its queue from the frozen DailyPlan");'
addition='''\nassert(session.includes("function syncFromGateway()")&&session.includes("LexiFlowLearningDataGatewayV3?.current?.()"),"Study Session V3 must reuse the persistence-confirmed Gateway snapshot before network fallback");\nassert(session.includes("if(!force&&syncFromGateway())return data;"),"Study Session V3 must avoid a redundant learning-data GET when the Gateway already has current data");'''
if study.count(anchor)!=1:
    raise SystemExit("Study Session check anchor not unique")
if "must reuse the persistence-confirmed Gateway snapshot" not in study:
    study=study.replace(anchor,anchor+addition,1)
study_check.write_text(study,encoding="utf-8")

review_check=Path("scripts/check-review-session-v3.js")
review=review_check.read_text(encoding="utf-8")
anchor='assert(source.includes("plan.review.filter"),"Review V3 must derive its queue from frozen DailyPlan.review");'
addition='''\nassert(source.includes("function syncFromGateway()")&&source.includes("LexiFlowLearningDataGatewayV3?.current?.()"),"Review Session V3 must reuse the persistence-confirmed Gateway snapshot before network fallback");\nassert(source.includes("if(!force&&syncFromGateway())return data;"),"Review Session V3 must avoid a redundant learning-data GET when the Gateway already has current data");'''
if review.count(anchor)!=1:
    raise SystemExit("Review Session check anchor not unique")
if "must reuse the persistence-confirmed Gateway snapshot" not in review:
    review=review.replace(anchor,anchor+addition,1)
review_check.write_text(review,encoding="utf-8")

authority_path=Path("scripts/check-runtime-authority-v3.js")
authority=authority_path.read_text(encoding="utf-8")
anchor='assert(reviewSession.includes("plannedQueue()"),"Review Session V3 must derive its queue from DailyPlan.review");'
addition='''\nassert(reviewSession.includes("LexiFlowLearningDataGatewayV3?.current?.()"),"Review Session V3 reads must prefer the canonical Gateway snapshot");\nassert(studySession.includes("LexiFlowLearningDataGatewayV3?.current?.()"),"Study Session V3 reads must prefer the canonical Gateway snapshot");'''
if authority.count(anchor)!=1:
    raise SystemExit("Runtime authority session-read anchor not unique")
if "reads must prefer the canonical Gateway snapshot" not in authority:
    authority=authority.replace(anchor,anchor+addition,1)
authority_path.write_text(authority,encoding="utf-8")
