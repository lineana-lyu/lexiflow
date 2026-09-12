const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const exists=name=>fs.existsSync(path.join(root,name));

const index=read("public/index.html");
const source=read("public/review-session-v3.js");
const transaction=read("public/review-transaction-v3.js");
const boundary=read("public/studyday-boundary-v3.js");
const app=read("public/app.js");

assert(index.includes("review-session-v3.js"),"Review Session V3 must be loaded by index.html");
assert(index.indexOf("app.js")<index.indexOf("review-session-v3.js"),"Review V3 should attach after the app shell while retaining capture-phase entry authority");
assert(source.includes("plan.review.filter"),"Review V3 must derive its queue from frozen DailyPlan.review");
assert(source.includes("plan.frozen!==true"),"Review V3 must require a frozen Today plan");
assert(source.includes("core.reviewSchedulePatch"),"Review V3 must delegate memory transitions to Learning Core");
assert(source.includes('body:JSON.stringify({data:normalized,reviewAuthority:"v3"})'),"Review V3 writes must identify themselves as Core-authoritative");
assert(source.includes('event.target?.closest?.(\'[data-action="start-review"]\')'),"Review V3 must intercept the existing Review entry point");
assert(source.includes("event.stopImmediatePropagation()"),"Review V3 must own Review entry before generic app handlers run");
assert(source.includes("window.LexiFlowReviewSessionV3=Object.freeze"),"Review V3 must expose a narrow open bridge");
assert(app.includes("window.LexiFlowReviewSessionV3?.open"),"app fallback must delegate Review entry back to V3");
assert(!app.includes("function startReview("),"legacy app Review queue builder must be removed");
assert(!app.includes("function rateReview("),"legacy +3/+1 Review scheduler must be removed");
assert(!app.includes("function reviewSessionPage("),"legacy app Review session renderer must be removed");
assert(source.includes("repairTail"),"Review V3 must keep failed normal recalls for one same-day repair tail");
assert(source.includes("repairTypeByCard"),"Review V3 must remember which question type failed before same-day repair");
assert(source.includes("all.filter(item=>item.type!==failed)"),"same-day repair must choose from question types different from the failed type");
assert(transaction.includes("questionType:String(activity.questionType"),"crash-safe Review transaction must preserve the failed question type");
assert(transaction.includes("session.repairTypeByCard[pending.cardId]"),"crash recovery must restore repair question-type memory");
assert(source.includes("const baseline=Number(active?.reviewCount??card.reviewCount??0)"),"Review V3 must capture the persisted reviewCount baseline for restart-safe idempotency");
assert(source.includes("session.paused=true"),"explicit Review exit must preserve a resumable paused session");
assert(source.includes("if(Number(card.reviewCount||0)<=baseline)"),"resume must not double-commit an already persisted Review attempt");
assert(!source.includes("dueCards()"),"Review V3 must never rebuild its queue from every due card");
assert(transaction.includes("pendingCommit"),"Review V3 crash recovery must remain delegated to Review Transaction V3");
assert(!exists("public/review-transition-v2.js"),"retired Review transition shim must stay deleted");
assert(!exists("public/studyday-boundary-v2.js"),"retired StudyDay Boundary V2 must stay deleted");
assert(boundary.includes("lexiflow-review-session-v3"),"StudyDay Boundary V3 must expire Review V3 UI/session state");
assert(boundary.includes('RUNTIME_KEY="lexiflow-studyday-runtime-v3"'),"Review recovery must be guarded by the V3 StudyDay boundary");

console.log("Review Session V3 contract checks passed.");