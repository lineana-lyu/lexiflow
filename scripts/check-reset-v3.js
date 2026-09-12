const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");

const runtime=read("server-image-runtime.js");
const safety=read("public/safety-controls.js");

assert(runtime.includes('url.pathname === "/api/learning-data/reset"'),"runtime must expose a dedicated learning reset endpoint");
assert(runtime.includes("cards: []")&&runtime.includes("activities: []"),"reset endpoint must erase cards and learning history");
assert(runtime.includes("settings: { ...(previous.settings || {}) }"),"reset must preserve application learning settings");
assert(runtime.includes("removeGeneratedImages"),"reset must remove generated and uploaded learning-image residue");
assert(runtime.includes("resetGeneration++"),"reset must invalidate image jobs already in flight");
assert(runtime.includes("job.generation !== resetGeneration"),"an image finishing after reset must be discarded instead of recreating residue");
assert(safety.includes('/api/learning-data/reset'),"UI reset must call the dedicated reset endpoint");
assert(safety.includes("RESET_VERIFICATION_FAILED"),"UI must re-read persistent data and verify the reset");
assert(safety.includes("cleanupComplete"),"UI must distinguish complete cleanup from partial image-file cleanup");
assert(safety.includes("lexiflow-apply-quality-v3"),"reset must clear Apply audit state");
assert(safety.includes("lexiflow-new-user-defaults-v3"),"reset must allow fresh-user defaults to be applied again after a full reset");

console.log("Learning Reset V3 checks passed.");
