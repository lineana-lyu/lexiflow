const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");

const index=read("public/index.html");
const session=read("public/study-session-v3.js");
const resume=read("public/study-resume-v2.js");
const boundary=read("public/studyday-boundary-v2.js");
const app=read("public/app.js");

function before(a,b){
  const ai=index.indexOf(a),bi=index.indexOf(b);
  assert(ai>=0,`${a} missing from index.html`);
  assert(bi>=0,`${b} missing from index.html`);
  assert(ai<bi,`${a} must load before ${b}`);
}

before("app.js","study-session-v3.js");
before("study-session-v3.js","review-transaction-v3.js");
assert(!index.includes('<script src="./study-entry-v3.js"></script>'),"legacy Study Entry V3 guard must not run beside Study Session V3");

assert(session.includes('const KEY="lexiflow-study-session-v3"'),"Study Session V3 must persist an exact same-day session");
assert(session.includes('const LEARNING_KEYS=["memorize","visualize","apply","select"]'),"Study Session V3 must preserve Today learning-stage order after Review");
assert(session.includes("plannedLearningIds"),"Study Session V3 must derive its queue from the frozen DailyPlan");
assert(session.includes("current.review")&&session.includes("return[]"),"Study Session V3 must refuse learning while Today Review remains");
assert(session.includes("window.LexiFlowStudyRenderer"),"Study Session V3 must use the explicit renderer bridge");
assert(session.includes("view.openCard(card.id)"),"Study Session V3 must open the exact planned card ID");
assert(!session.includes("legacyFirstActiveId"),"Study Session V3 must not consult the legacy first-active queue");
assert(session.includes("event.stopImmediatePropagation()"),"Study Session V3 must intercept the old continue-learning authority before app.js");
assert(session.includes("pauseSession"),"Study Session V3 must distinguish user exit from crash/restart resume");
assert(session.includes("maybeResume"),"Study Session V3 must resume an unpaused same-day session after reload");
assert(session.includes("window.LexiFlowStudySessionV3"),"Study Session V3 must expose a narrow runtime control surface");
assert(!session.includes("activeLearningCards()[0]"),"Study Session V3 must never choose work from the legacy activeLearningCards queue");

assert(app.includes("function startStudy(cardId)"),"renderer must retain explicit-card rendering support");
assert(app.includes("window.LexiFlowStudyRenderer=Object.freeze"),"app renderer must expose a narrow explicit-card bridge");
assert(app.includes("openCard(cardId){return startStudy"),"renderer bridge must call startStudy with a card ID");
assert(!app.includes("cardId?getCard(cardId):activeLearningCards()[0]"),"renderer must not fall back to the legacy active-learning queue");
assert(!app.includes('if(action==="continue-learning"){startStudy();return;}'),"legacy continue-learning must not invoke a no-argument renderer path");
assert(app.includes("window.LexiFlowStudySessionV3?.open"),"legacy continue-learning handler must delegate to Study Session V3 if it is reached");

assert(!resume.includes("resumeIfNeeded"),"study-resume-v2 must no longer own session auto-resume");
assert(!resume.includes("setActive("),"study-resume-v2 must no longer persist a competing active-session authority");
assert(!resume.includes('[data-action="continue-learning"]'),"draft recovery must not click the learning entry button");
assert(resume.includes("lexiflow-study-drafts-v2"),"Visualize/Apply draft recovery must remain active");

assert(boundary.includes('const STUDY_SESSION_V3_KEY="lexiflow-study-session-v3"'),"StudyDay boundary must know the Study Session V3 key");
assert(boundary.includes("purgeSingle(STUDY_SESSION_V3_KEY"),"StudyDay boundary must expire stale Study Session V3 state");

console.log("Study Session V3 checks passed.");
