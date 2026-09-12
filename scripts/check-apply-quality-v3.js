const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");

const index=read("public/index.html");
const quality=read("public/apply-quality-v3.js");
const feedbackFixes=read("public/feedback-fixes.js");
const server=read("server.js");

assert(index.includes("apply-quality-v3.js"),"Apply Quality V3 must load in index.html");
assert(index.indexOf("apply-quality-v3.js")<index.indexOf("stage-transition-v2.js"),"Apply quality capture gate must register before authoritative stage completion");
assert(quality.includes("correctionHeldBack:true"),"early failed Apply rounds must hold back the full correction");
assert(quality.includes("round>=3"),"full correction may appear only from the third failed revision round");
assert(quality.includes("lastFailedInput"),"re-submitting the exact same sentence must not consume another feedback round");
assert(quality.includes("originalPass"),"gate must distinguish an approved original sentence from an approved correction");
assert(quality.includes("suggestionPass"),"an adopted AI correction may pass only when that correction was approved");
assert(quality.includes("event.stopImmediatePropagation()"),"unapproved Apply completion must stop before stage-transition-v2");
assert(quality.includes("你修改了句子，需要重新检查后再继续"),"editing after an audit must invalidate the previous approval");
assert(quality.includes("isReferenceExampleCopy"),"Apply must deterministically detect exact copies of the dictionary example");
assert(quality.includes('[data-action="submit-apply"]'),"copied examples must be stopped before an unnecessary AI check");
assert(quality.includes("这句话和词典参考例句相同"),"copied reference examples must explain why they cannot complete Apply");
assert(quality.includes("LexiFlowStudyRenderer?.currentCardId"),"reference-copy checks must bind to the exact current learning card");
assert(!feedbackFixes.includes("optionalSuggestion"),"legacy feedback compatibility must not downgrade required corrections into optional polish");
assert(server.includes("完全正确时 suggestion 为空"),"server contract must explicitly reserve empty suggestion for a fully correct original sentence");
assert(server.includes("只要句子不完整、语法错误、搭配不自然或明显表达不完整，suggestion 必须给出"),"server contract must return a correction for materially flawed English input");

console.log("Apply Quality V3 contract checks passed.");