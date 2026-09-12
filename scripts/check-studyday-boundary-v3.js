const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const exists=name=>fs.existsSync(path.join(root,name));

const index=read("public/index.html");
const boundary=read("public/studyday-boundary-v3.js");

assert(index.includes('<script src="./studyday-boundary-v3.js"></script>'),"StudyDay Boundary V3 must be active");
assert(!index.includes('<script src="./studyday-boundary-v2.js"></script>'),"StudyDay Boundary V2 must be retired from runtime");
assert(!exists("public/studyday-boundary-v2.js"),"StudyDay Boundary V2 source must stay deleted after promotion");
assert(boundary.includes('RUNTIME_KEY="lexiflow-studyday-runtime-v3"'),"StudyDay Boundary V3 must own the new runtime-day marker");
assert(boundary.includes('LEGACY_RUNTIME_KEY="lexiflow-studyday-runtime-v2"'),"StudyDay Boundary V3 must migrate the previous runtime-day marker");
assert(boundary.includes("localStorage.removeItem(LEGACY_RUNTIME_KEY)"),"StudyDay Boundary V3 must clean the legacy runtime marker after migration");
assert(boundary.includes('STUDY_SESSION_V3_KEY="lexiflow-study-session-v3"'),"StudyDay Boundary V3 must expire stale Study Session V3 state");
assert(boundary.includes('REVIEW_SESSION_V3_KEY="lexiflow-review-session-v3"'),"StudyDay Boundary V3 must expire stale Review Session V3 state");
assert(boundary.includes('MEMORIZE_KEY="lexiflow-memorize-v2"'),"StudyDay Boundary V3 must preserve compatibility cleanup for in-progress Memorize sessions");
assert(boundary.includes('window.addEventListener("focus",checkBoundary)'),"StudyDay boundary must re-check when the application regains focus");
assert(boundary.includes('document.addEventListener("visibilitychange"'),"StudyDay boundary must re-check when the application becomes visible");
assert(boundary.includes("setInterval(checkBoundary,30000)"),"StudyDay boundary must also detect midnight while the application stays open");
assert(boundary.includes("location.reload()"),"crossing into a new StudyDay must rebuild the runtime from current persisted state");
assert(boundary.includes("window.LexiFlowStudyDayBoundaryV3=Object.freeze"),"StudyDay Boundary V3 must expose only a narrow diagnostics bridge");

console.log("StudyDay Boundary V3 checks passed.");
