const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const exists=name=>fs.existsSync(path.join(root,name));

const index=read("public/index.html");
const source=read("public/today-plan-v3.js");

assert(index.includes('<script src="./today-plan-v3.js"></script>'),"Today Plan V3 must be active");
assert(!index.includes('<script src="./today-plan-v2.js"></script>'),"Today Plan V2 must not remain in the runtime load chain");
assert(!exists("public/today-plan-v2.js"),"Today Plan V2 source must stay deleted after V3 promotion");
assert(source.includes("LexiFlowTodayPlanV3=Object.freeze"),"Today Plan V3 must expose a narrow explicit bridge");
assert(source.includes('todayPlanAuthority:"v3"'),"Today Plan writes must identify V3 authority");
assert(source.includes("if(!syncFromGateway())latestData=normalized;"),"Today Plan V3 must redraw from the Gateway-confirmed persisted snapshot after a successful write");
assert(!source.includes("window.fetch =")&&!source.includes("window.fetch="),"Today Plan V3 must not rewrite global fetch");
assert(!source.includes("response.clone().json"),"Today Plan V3 must not proxy arbitrary learning-data responses");
assert(source.includes('if(!count)return ""'),"Today card must hide zero-count task rows");
assert(source.includes('class="lexi-today-progress"'),"Today progress must remain integrated into the compact Today card");
assert(source.includes("function effectiveSelectGoal(plan)"),"Today UI must preserve an adaptive selectGoal of zero instead of falling back to the configured daily goal");
assert(!source.includes("plan?.selectGoal||latestData?.settings?.dailyGoal"),"Today UI must not treat adaptive zero new-word capacity as a missing value");
assert(source.includes('data-library-filter="${key}"'),"Word Library must own pending/learning/stable filters");
assert(source.includes("selectFromPending")&&source.includes("moveBackToPending"),"Word Library must explicitly own adding/removing Pending words from Today");
assert(source.includes('authority:"today-plan-v3"'),"Today selection activities must record V3 authority");
assert(source.includes("initialTaskIds=next.dailyPlan.initialTaskIds.filter"),"moving a selected word back to Pending must remove it from the frozen progress denominator");
assert(source.includes("function syncFromGateway"),"Today Plan V3 must share the Learning Data Gateway snapshot");
assert(source.includes("LexiFlowLearningDataGatewayV3?.current?.()"),"Today decorators must prefer the gateway snapshot over another learning-data GET");
assert(source.includes("syncFromGateway();\n      decorate();"),"MutationObserver scheduling must only sync/decorate from memory");
assert(!source.includes("setTimeout(()=>void refreshAndDecorate(),180)"),"Today Plan must not refetch learning data after every app-shell DOM mutation");
assert(source.includes('window.addEventListener("focus",()=>void refreshAndDecorate(true))'),"Today Plan V3 must force a fresh read after returning to the app");
assert(source.includes('document.addEventListener("visibilitychange",()=>{if(!document.hidden)void refreshAndDecorate(true);})'),"Today Plan V3 must force a fresh read when the app becomes visible");
assert(source.includes('window.addEventListener("lexiflow:today-plan-data",schedule)'),"Today writes must trigger an in-memory redraw rather than another GET");

console.log("Today Plan V3 checks passed.");
