const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");

const index=read("public/index.html");
const source=read("public/study-entry-v3.js");
const core=read("public/learning-core-v2.js");

assert(index.includes("study-entry-v3.js"),"Study Entry V3 must load in index.html");
assert(index.indexOf("app.js")<index.indexOf("study-entry-v3.js"),"Study Entry V3 must guard the already-rendered legacy entry point");
assert(source.includes('["memorize","visualize","apply","select"]'),"learning entry must follow Today learning-stage order after Review is empty");
assert(source.includes("plan.frozen!==true"),"learning entry must require a frozen DailyPlan");
assert(source.includes("legacyFirstActiveId"),"guard must compare the legacy selector result with the DailyPlan result");
assert(source.includes("legacyId!==expectedId"),"mismatched legacy and DailyPlan entry must fail closed");
assert(source.includes("event.stopImmediatePropagation()"),"entry guard must be able to stop an unsafe legacy start");
assert(source.includes("button.click()"),"validated entry must hand control back to the existing study renderer");
assert(source.includes("showMismatch"),"post-render mismatch must block interaction instead of silently studying the wrong item");
assert(core.includes("if(frozenToday)"),"Learning Core must prioritize frozen-plan cards ahead of unplanned cards");
assert(core.includes("return aPlanned ? -1 : 1"),"planned cards must sort ahead of unplanned legacy candidates");

console.log("Study Entry V3 contract checks passed.");