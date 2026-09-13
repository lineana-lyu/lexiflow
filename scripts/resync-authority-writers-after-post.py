from pathlib import Path

review_path=Path("public/review-session-v3.js")
review=review_path.read_text(encoding="utf-8")
old='''    if(!response.ok)throw new Error("SAVE_FAILED");
    data=normalized;
  }
'''
new='''    if(!response.ok)throw new Error("SAVE_FAILED");
    if(!syncFromGateway())data=normalized;
  }
'''
if review.count(old)!=1:
    raise SystemExit(f"Review persist local assignment count was {review.count(old)}")
review=review.replace(old,new,1)
if "if(!syncFromGateway())data=normalized;" not in review:
    raise SystemExit("Review persist confirmation resync missing")
review_path.write_text(review,encoding="utf-8")

today_path=Path("public/today-plan-v3.js")
today=today_path.read_text(encoding="utf-8")
old='''    if(!response.ok)throw new Error("SAVE_FAILED");
    latestData=normalized;
    try{window.dispatchEvent(new CustomEvent("lexiflow:today-plan-data",{detail:{reason:String(reason||"")}}));}catch{}
    return normalized;
  }
'''
new='''    if(!response.ok)throw new Error("SAVE_FAILED");
    if(!syncFromGateway())latestData=normalized;
    try{window.dispatchEvent(new CustomEvent("lexiflow:today-plan-data",{detail:{reason:String(reason||"")}}));}catch{}
    return latestData;
  }
'''
if today.count(old)!=1:
    raise SystemExit(f"Today persist local assignment count was {today.count(old)}")
today=today.replace(old,new,1)
if "if(!syncFromGateway())latestData=normalized;" not in today:
    raise SystemExit("Today persist confirmation resync missing")
today_path.write_text(today,encoding="utf-8")

review_check=Path("scripts/check-review-session-v3.js")
text=review_check.read_text(encoding="utf-8")
anchor='assert(source.includes(\'body:JSON.stringify({data:normalized,reviewAuthority:"v3"})\'),"Review V3 writes must identify themselves as Core-authoritative");'
addition='''\nassert(source.includes("if(!syncFromGateway())data=normalized;"),"Review V3 must continue from the Gateway-confirmed persisted snapshot after a successful write");'''
if text.count(anchor)!=1:
    raise SystemExit("Review write contract anchor not unique")
if "Gateway-confirmed persisted snapshot" not in text:
    text=text.replace(anchor,anchor+addition,1)
review_check.write_text(text,encoding="utf-8")

today_check=Path("scripts/check-today-plan-v3.js")
text=today_check.read_text(encoding="utf-8")
anchor='assert(source.includes(\'todayPlanAuthority:"v3"\'),"Today Plan writes must identify V3 authority");'
addition='''\nassert(source.includes("if(!syncFromGateway())latestData=normalized;"),"Today Plan V3 must redraw from the Gateway-confirmed persisted snapshot after a successful write");'''
if text.count(anchor)!=1:
    raise SystemExit("Today write contract anchor not unique")
if "Gateway-confirmed persisted snapshot" not in text:
    text=text.replace(anchor,anchor+addition,1)
today_check.write_text(text,encoding="utf-8")

authority_path=Path("scripts/check-runtime-authority-v3.js")
authority=authority_path.read_text(encoding="utf-8")
anchor='assert(todayPlan.includes(\'todayPlanAuthority:"v3"\'),"Today Plan V3 must identify its writes");'
addition='''\nassert(todayPlan.includes("if(!syncFromGateway())latestData=normalized;"),"Today Plan V3 local state must follow the Gateway-confirmed write result");\nassert(reviewSession.includes("if(!syncFromGateway())data=normalized;"),"Review Session V3 local state must follow the Gateway-confirmed write result");'''
if authority.count(anchor)!=1:
    raise SystemExit("Runtime authority writer-resync anchor not unique")
if "local state must follow the Gateway-confirmed write result" not in authority:
    authority=authority.replace(anchor,anchor+addition,1)
authority_path.write_text(authority,encoding="utf-8")
