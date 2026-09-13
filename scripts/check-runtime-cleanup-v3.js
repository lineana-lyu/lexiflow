const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const index=fs.readFileSync(path.join(root,"public","index.html"),"utf8");
const product=fs.readFileSync(path.join(root,"public","product-ux.js"),"utf8");
const app=fs.readFileSync(path.join(root,"public","app.js"),"utf8");
const productCss=fs.readFileSync(path.join(root,"public","product-ux.css"),"utf8");
const runtime=fs.readFileSync(path.join(root,"public","runtime-fixes.js"),"utf8");
const transport=fs.readFileSync(path.join(root,"public","transport-fixes.js"),"utf8");
const gateway=fs.readFileSync(path.join(root,"public","learning-data-gateway-v3.js"),"utf8");
const sourceContext=fs.readFileSync(path.join(root,"public","source-context-v3.js"),"utf8");
const pkg=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));

const retired=[
  "public/feedback-fixes.js",
  "public/final-ux.js",
  "public/final-ux.css",
  "public/learning-flow-fixes.js",
  "public/learning-flow-fixes.css",
  "public/product-ux-v2.js",
  "public/product-ux-v2.css",
  "public/README_ICON_FIX.txt",
  "public/icon-test.txt",
  "public/icon-v2.png",
  "public/icon-v3.b64.txt",
  "scripts/apply-core-runtime-v2.py",
  "scripts/check-runtime-authority-v2.js",
  "scripts/check-study-entry-v3.js",
];

for(const file of retired){
  assert(!fs.existsSync(path.join(root,file)),`retired runtime/debug artifact must stay deleted: ${file}`);
}

for(const name of [
  "feedback-fixes.js",
  "final-ux.js",
  "final-ux.css",
  "learning-flow-fixes.js",
  "learning-flow-fixes.css",
  "product-ux-v2.js",
  "product-ux-v2.css",
  "icon-v2.png",
  "icon-v3.b64.txt",
]){
  assert(!index.includes(name),`${name} must not be referenced by public/index.html`);
}

assert(index.includes('<link rel="icon" type="image/png" href="./icon.png" />'),"index.html must use the approved icon.png asset");
assert(fs.existsSync(path.join(root,"public","icon.png")),"public/icon.png must exist");
assert(fs.existsSync(path.join(root,"build","icon.ico")),"build/icon.ico must exist for Windows packaging");
assert(!product.includes("applyAppIcon")&&!product.includes("APP_ICON_URL"),"product UX must not patch the static brand icon after render");
assert(app.includes("lexi-brand-icon-image")&&app.includes('src="./icon.png"'),"app.js must directly render the approved icon.png brand asset");
assert(productCss.includes(".brand .logo.lexi-brand-icon"),"canonical product UX CSS must own app icon styling");
assert(!product.includes("window.fetch ="),"product UX must not rewrite global fetch; Learning Data Gateway V3 owns learning-data transport observation");
assert(!product.includes("cloneJsonResponse"),"new-user defaults must not be implemented by product-level response rewriting");
assert(!product.includes("CUSTOM_GOAL_KEY")&&!product.includes("decorateDailyGoal"),"product UX must not mirror Daily Goal state outside app.js");
assert(!product.includes('/api/learning-data'),"product UX must not issue learning-data reads for presentation decoration");
assert(app.includes('data-daily-goal-editor')&&app.includes('id="daily-goal"'),"app.js must directly render the Daily Goal editor");

// app.js is now a generic shell/bridge. Retired six-stage renderers and schedulers
// must stay physically absent instead of being hidden behind V3 overlays.
assert(!app.includes("const STAGES =")&&!app.includes("const STAGES="),"app.js must not reintroduce the retired six-stage table");
for(const retiredFunction of ["function stageSelect(","function stageMem1(","function stageMem2(","function stageVisual(","function stageApply(","function advanceStage(","function finishInitialReview(","function startReview(","function reviewSessionPage(","function rateReview("]){
  assert(!app.includes(retiredFunction),`app.js must keep retired learning authority deleted: ${retiredFunction}`);
}
assert(app.includes('function renderStage(card){')&&app.includes('data-study-stage-host-v3'),"app.js study body must be only a passive V3 stage host");
assert(app.includes('data-study-stepper-v3-host'),"app.js must expose only the passive V3 five-stage stepper host");
assert(!app.includes('/api/ai/visual-scene')&&!app.includes('/api/ai/practice-prompt'),"app.js must not own retired automatic stage AI calls");

assert(runtime.includes("transport-only"),"runtime compatibility must stay transport-only");
assert(!runtime.includes("LEGACY_STAGE_AI_BLOCKED")&&!runtime.includes("/api/ai/visual-scene")&&!runtime.includes("/api/ai/practice-prompt"),"runtime compatibility must stay free of retired Stage AI blocking/caller knowledge");
assert(!runtime.includes("MutationObserver"),"runtime compatibility must not decorate stage DOM through a global observer");
assert(!runtime.includes("visual-image-canvas")&&!runtime.includes("scene-panel.is-loading"),"legacy Visualize DOM selectors must stay out of runtime compatibility");
assert(!runtime.includes("background-generation-note"),"V3 Visualize renderer must be the only owner of image-generation progress UI");

assert(transport.includes("function visualStudyVisible()"),"transport image-job indicator must centralize Visualize visibility detection");
assert(transport.includes('document.querySelector(".lexi-v3-visual,.visual-learning-stage")'),"transport must recognize the authoritative Visualize V3 surface while retaining legacy fallback detection");
assert(transport.includes("const hiddenForStudy = visualStageVisible;"),"global image-job pill must stay hidden whenever the Visualize page already owns image status UI");
assert(!transport.includes("const hiddenForStudy = visualStageVisible &&"),"transport must not duplicate success/error image status on the Visualize V3 page");
assert(transport.includes("已保存到当前单词卡草稿"),"transport success copy must describe generated images as durable drafts until Visualize is explicitly completed");
assert(!transport.includes("可以继续编辑或进入下一步"),"transport must not claim the user can leave Visualize while image persistence is still in flight");

assert(gateway.includes("registerOutgoingMutator")&&gateway.includes("registerAfterPersist"),"Learning Data Gateway V3 must own explicit feature persistence extension points");
assert(sourceContext.includes("function syncFromGateway()"),"Source Context V3 must reuse the canonical learning-data snapshot");
assert(sourceContext.includes("requestAnimationFrame(()=>{scheduled=false;syncFromGateway();decorate();})"),"Source Context DOM mutations must decorate from the gateway snapshot without a GET");
assert(!sourceContext.includes("requestAnimationFrame(async()=>{scheduled=false;await refresh();decorate();})"),"Source Context must not refetch learning data on every DOM mutation");
assert(sourceContext.includes('window.addEventListener("lexiflow:today-plan-data",schedule)'),"Source Context must resync after authoritative Today data changes");
assert(!sourceContext.includes("window.fetch =")&&!sourceContext.includes("window.fetch="),"Source Context V3 must not rewrite global fetch after gateway hook consolidation");
assert(sourceContext.includes("gateway.registerOutgoingMutator(outgoingMutator)"),"Source Context V3 must preserve source metadata through the gateway outgoing hook");
assert(sourceContext.includes("gateway.registerAfterPersist(afterPersist)"),"Source Context V3 must clear source draft state only after successful persistence");

assert(!(pkg.scripts?.check||"").includes("public/feedback-fixes.js"),"package check must not retain the removed feedback shim");
assert(!(pkg.scripts?.check||"").includes("public/product-ux-v2.js"),"package check must not retain Product UX V2");
assert(!(pkg.scripts?.check||"").includes("check-runtime-authority-v2.js"),"package checks must not retain the obsolete V2 authority check");
assert(!(pkg.scripts?.check||"").includes("check-study-entry-v3.js"),"package checks must not retain the retired Study Entry check");

console.log("Runtime cleanup V3 checks passed.");