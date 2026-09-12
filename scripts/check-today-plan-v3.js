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
assert(!source.includes("window.fetch =")&&!source.includes("window.fetch="),"Today Plan V3 must not rewrite global fetch");
assert(!source.includes("response.clone().json"),"Today Plan V3 must not proxy arbitrary learning-data responses");
assert(source.includes('if(!count)return ""'),"Today card must hide zero-count task rows");
assert(source.includes('class="lexi-today-progress"'),"Today progress must remain integrated into the compact Today card");
assert(source.includes('data-library-filter="${key}"'),"Word Library must own pending/learning/stable filters");
assert(source.includes("selectFromPending")&&source.includes("moveBackToPending"),"Word Library must explicitly own adding/removing Pending words from Today");
assert(source.includes('authority:"today-plan-v3"'),"Today selection activities must record V3 authority");
assert(source.includes("initialTaskIds=next.dailyPlan.initialTaskIds.filter"),"moving a selected word back to Pending must remove it from the frozen progress denominator");
assert(source.includes("setTimeout(()=>void refreshAndDecorate(),180)"),"Today Plan V3 must settle-refresh after app-shell DOM changes rather than intercept persistence globally");
assert(source.includes('window.addEventListener("focus"'),"Today Plan V3 must refresh after returning to the app");
assert(source.includes('document.addEventListener("visibilitychange"'),"Today Plan V3 must refresh when the app becomes visible");

console.log("Today Plan V3 checks passed.");
