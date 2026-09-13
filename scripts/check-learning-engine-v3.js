const fs = require("fs");
const path = require("path");
const vm = require("vm");

function assert(condition,message){ if(!condition) throw new Error(message); }
function eq(actual,expected,message){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a!==e) throw new Error(`${message}\nexpected: ${e}\nactual:   ${a}`);
}
function date(y,m,d,h=12){ return new Date(y,m-1,d,h,0,0,0); }
function diffDays(a,b){ return Math.round((new Date(b)-new Date(a))/86400000); }

const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const exists=name=>fs.existsSync(path.join(root,name));
const sandbox={window:{},console,Date,setTimeout,clearTimeout};
vm.createContext(sandbox);
vm.runInContext(read("public/learning-core-v3.js"),sandbox,{filename:"learning-core-v3.js"});
const core=sandbox.window.LexiFlowLearningCore;
assert(core,"learning core did not initialize");

eq(core.REVIEW_INTERVALS,[1,3,7,16,21],"Review ladder changed unexpectedly");
eq(core.STABLE_INTERVALS,[30,45,68,90],"Stable ladder changed unexpectedly");
eq(core.TODAY_ORDER,["review","memorize","visualize","apply","select"],"Today order changed unexpectedly");
assert(core.PLAN_VERSION===4,"DailyPlan version must include the canonical learning-stage model");
assert(core.canonicalStage("memorize1")==="memorize"&&core.canonicalStage("memorize2")==="memorize","legacy Memorize stages must collapse to one canonical stage");

const index=read("public/index.html");
const runtimeOrder=[
  "learning-core-v3.js","learning-data-gateway-v3.js","studyday-boundary-v3.js","stage-transition-v3.js",
  "today-plan-v3.js","daily-plan-persistence-v3.js","advance-learning-v3.js","source-context-v3.js","app.js","study-stage-surface-v3.js","study-session-v3.js",
  "select-stage-v3.js","visualize-stage-v3.js","apply-stage-v3.js","review-transaction-v3.js","review-session-v3.js","memorize-stage-v3.js","study-drafts-v3.js",
  "apply-actions-v3.js","review-policy-v3.js","visualize-actions-v3.js","apply-guard-v3.js"
];
let previous=-1;
for(const file of runtimeOrder){
  const i=index.indexOf(file);
  assert(i>=0,`${file} is not loaded by public/index.html`);
  assert(i>previous,`${file} is loaded out of order in public/index.html`);
  previous=i;
}
for(const retired of ["learning-core-v2.js","learning-engine-v2.js","legacy-data-fix.js","studyday-boundary-v2.js","stage-transition-v2.js","today-plan-v2.js","daily-plan-persistence-v2.js","advance-learning-v2.js","study-entry-v3.js","review-transition-v2.js","review-v2.js","review-session-state-v2.js","study-resume-v2.js","visualize-v2.js","memorize-v2.js","source-context-v2.js","review-policy-v2.js","apply-guard-v2.js"]){
  assert(!index.includes(`<script src="./${retired}"></script>`),`${retired} must not execute in the V3 runtime`);
  if(["learning-core-v2.js","learning-engine-v2.js","legacy-data-fix.js","studyday-boundary-v2.js","stage-transition-v2.js","today-plan-v2.js","daily-plan-persistence-v2.js","advance-learning-v2.js","memorize-v2.js","source-context-v2.js","review-policy-v2.js","apply-guard-v2.js"].includes(retired))assert(!exists(`public/${retired}`),`${retired} must stay deleted after V3 promotion`);
}

const gateway=read("public/learning-data-gateway-v3.js");
assert(gateway.includes("core.normalizeData"),"Learning Data Gateway V3 must normalize learning data");
assert(gateway.includes("core.crossDayPatch"),"Learning Data Gateway V3 must preserve deterministic cross-day guards");
assert(gateway.includes('learningDataAuthority:source.learningDataAuthority||"gateway-v3"'),"Learning Data Gateway V3 writes must identify V3 authority");
assert(gateway.includes("repairLegacyMeanings"),"Learning Data Gateway V3 must own safe legacy meaning repair");
assert(gateway.includes("registerOutgoingMutator")&&gateway.includes("registerAfterPersist"),"Learning Data Gateway V3 must expose explicit feature hooks instead of forcing feature fetch wrappers");
assert(gateway.includes("if(response.ok&&body?.data?.cards)commitSnapshot"),"Learning Data Gateway V3 must advance its in-memory snapshot only after a successful POST");
assert(!gateway.includes("/api/ai/visual-scene"),"Learning Data Gateway V3 must not own Visualize AI behavior");
const stageTransition=read("public/stage-transition-v3.js");
assert(stageTransition.includes('stageTransitionAuthority:"v3"'),"Stage Transition V3 writes must identify V3 authority");
assert(stageTransition.includes('card.stage="memorize"')&&!stageTransition.includes('card.stage="memorize1"'),"Select completion must write canonical Memorize directly");
const advance=read("public/advance-learning-v3.js");
assert(advance.includes('advanceLearningAuthority:"v3"'),"Advance Learning V3 writes must identify V3 authority");
assert(!advance.includes('return"review"'),"Advance Learning V3 must never unlock Review early");
const sourceContext=read("public/source-context-v3.js");
assert(sourceContext.includes("core.canonicalStage(card)"),"Source Context V3 must use canonical stage identity");
assert(sourceContext.includes('DRAFT_KEY="lexiflow-source-context-draft-v2"'),"Source Context V3 must preserve the prior draft key for upgrades");
assert(!sourceContext.includes("window.fetch=" )&&!sourceContext.includes("window.fetch ="),"Source Context V3 must use gateway hooks instead of rewriting global fetch");
assert(sourceContext.includes("gateway.registerOutgoingMutator(outgoingMutator)"),"Source Context V3 must preserve source fields through the gateway outgoing hook");
assert(sourceContext.includes("gateway.registerAfterPersist(afterPersist)"),"Source Context V3 must clear pending source drafts only after a successful persistence callback");
const applyGuard=read("public/apply-guard-v3.js");
assert(applyGuard.includes("LexiFlowStudyRenderer?.currentCardId"),"Apply Guard V3 must use explicit Study card identity");
assert(!applyGuard.includes('document.querySelector(".apply-word-hero .target-word-text'),"Apply Guard V3 must not infer target word from DOM text");
const planPersistence=read("public/daily-plan-persistence-v3.js");
assert(!planPersistence.includes("window.fetch="),"DailyPlan persistence must be explicit rather than a global fetch side effect");
assert(planPersistence.includes('dailyPlanAuthority:"v3"'),"DailyPlan persistence writes must identify V3 authority");
const studyDayBoundary=read("public/studyday-boundary-v3.js");
assert(studyDayBoundary.includes('RUNTIME_KEY="lexiflow-studyday-runtime-v3"'),"StudyDay boundary must own the V3 runtime-day marker");
assert(studyDayBoundary.includes('LEGACY_RUNTIME_KEY="lexiflow-studyday-runtime-v2"'),"StudyDay boundary must migrate the prior runtime-day marker");

const todayUi=read("public/today-plan-v3.js");
assert(todayUi.includes('if(!count)return ""'),"Today UI must hide zero-count task rows");
assert(todayUi.includes('class="lexi-today-progress"'),"Today progress must be integrated into the compact Today card");
assert(todayUi.includes('data-library-filter="${key}"'),"Word Library must own the pending/learning/stable filters");
assert(todayUi.includes("待学习"),"collected words must be presented as Pending inside Word Library");
assert(!todayUi.includes('id="lexi-inbox"'),"Home must not expose a separate Inbox panel");
assert(todayUi.includes("next.dailyPlan.initialTaskIds=next.dailyPlan.initialTaskIds.filter"),"moving a selected word back to Pending must remove it from the frozen progress denominator rather than count it as completed");
assert(todayUi.includes('todayPlanAuthority:"v3"'),"Today Plan writes must identify V3 authority");
assert(!todayUi.includes("window.fetch =")&&!todayUi.includes("window.fetch="),"Today Plan V3 must not rewrite global fetch");

const d1=date(2026,9,1), d2=date(2026,9,2);
const collected=core.normalizeCard({id:"inbox",stage:"select",createdAt:d1.toISOString()},d1);
assert(collected.inboxPending===true,"newly collected cards must enter internal pending state");
const selected=core.normalizeCard({id:"picked",stage:"select",todaySelectedOn:"2026-09-01",createdAt:d1.toISOString()},d1);
assert(selected.inboxPending===false,"Today-selected cards must leave internal pending state");
const legacyMem=core.normalizeCard({id:"legacy-m",stage:"memorize2",memorizeRound:2,createdAt:d1.toISOString()},d1);
assert(legacyMem.stage==="memorize"&&legacyMem.learningStage==="memorize","legacy persisted memorize2 cards must physically expose one canonical Memorize stage");
assert(legacyMem.memorizeRound===2,"canonical stage normalization must preserve Memorize round progress");

const data={version:1,cards:[],activities:[],settings:{dailyGoal:3}};
const plan=core.buildDailyPlan(data,d1);
eq(plan.order,["review","memorize","visualize","apply","select"],"DailyPlan order changed");
assert(plan.frozen===true,"DailyPlan must be frozen");

const dueCard={id:"r1",stage:"review",learningStage:"review",nextReviewAt:d1.toISOString(),createdAt:d1.toISOString()};
const normalizedDue=core.normalizeCard(dueCard,d1);
assert(core.isDue(normalizedDue,d1),"review card should be due on its StudyDay");
assert(!core.isDue(normalizedDue,date(2026,8,31)),"review card must not be due before its StudyDay");

const first=core.scheduleReview(normalizedDue,"good",d1,{firstAttempt:true});
assert(diffDays(d1,first.nextReviewAt)===3,"first successful Review must advance from the 1d entry to 3d");
const second=core.scheduleReview({...first,reviewStep:1},"good",d2,{firstAttempt:true});
assert(diffDays(d2,second.nextReviewAt)===7,"second successful Review must advance to 7d");

console.log("Learning Engine V3 checks passed.");