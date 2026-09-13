const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");

const index=read("public/index.html");
const surface=read("public/study-stage-surface-v3.js");
const select=read("public/select-stage-v3.js");
const visual=read("public/visualize-stage-v3.js");
const apply=read("public/apply-stage-v3.js");
const visualActions=read("public/visualize-actions-v3.js");
const applyActions=read("public/apply-actions-v3.js");
const runtime=read("public/runtime-fixes.js");
const ai=read("public/ai-assist-v3.js");

function before(a,b){
  const ai=index.indexOf(a),bi=index.indexOf(b);
  assert(ai>=0,`${a} missing from index.html`);
  assert(bi>=0,`${b} missing from index.html`);
  assert(ai<bi,`${a} must load before ${b}`);
}

before("app.js","study-stage-surface-v3.js");
before("study-stage-surface-v3.js","study-session-v3.js");
before("study-stage-surface-v3.js","select-stage-v3.js");
before("select-stage-v3.js","visualize-stage-v3.js");
before("visualize-stage-v3.js","apply-stage-v3.js");
before("apply-stage-v3.js","apply-actions-v3.js");
before("visualize-stage-v3.js","visualize-actions-v3.js");
before("ai-assist-v3.js","runtime-fixes.js");
assert(!index.includes('<script src="./visualize-v2.js"></script>'),"legacy Visualize V2 action shim must not remain in the runtime load chain");

assert(surface.includes('["select","选词确认"]')&&surface.includes('["memorize","记忆"]')&&surface.includes('["review","复习巩固"]'),"study surface must expose five canonical product stages");
assert(!surface.includes('memorize1')&&!surface.includes('memorize2'),"study surface must not expose legacy Memorize sub-stages");
assert(surface.includes("core.canonicalStage(card)"),"study surface must label stages from the canonical domain stage");
assert(surface.includes("const ROOTS=Object.freeze"),"study surface must know the authoritative V3 renderer roots");
assert(surface.includes("data-study-stage-host-v3"),"study surface must replace the legacy stage body with a passive host while a V3 renderer loads");
assert(surface.includes("不会回退到旧学习流程"),"passive study host must explicitly fail closed rather than expose legacy stage UI");
assert(surface.includes('.study-card-focus:not([data-stage-host-v3]){visibility:hidden}'),"legacy stage body must stay visually hidden before the V3 host is established");
assert(surface.includes('.study-card-focus[data-stage-host-v3]{visibility:visible}'),"V3 stage host must become visible only after authority handoff");
assert(surface.includes("window.LexiFlowStudyStageSurfaceV3=Object.freeze"),"study surface must expose only a narrow canonical-stage descriptor");
assert(surface.includes('text==="英→中"||text==="中→英"||text==="memorize"'),"legacy and canonical Memorize labels must normalize to the same product label on residual shell surfaces");
assert(surface.includes("LexiFlowLearningDataGatewayV3?.current?.()"),"study surface must reuse the canonical learning-data gateway snapshot after startup");
assert(surface.includes("syncFromGateway();\n      decorate();"),"DOM mutation decoration must use the in-memory gateway snapshot instead of refetching");
assert(!surface.includes("requestAnimationFrame(async()=>{\n      queued=false;\n      decorateLegacyBadges();\n      await refresh();"),"DOM mutations must not trigger a learning-data GET on every renderer update");

assert(select.includes("LexiFlowStudyRenderer?.currentCardId"),"Select renderer must bind to explicit Study Session card identity");
assert(visual.includes("LexiFlowStudyRenderer?.currentCardId"),"Visualize renderer must bind to explicit Study Session card identity");
assert(apply.includes("LexiFlowStudyRenderer?.currentCardId"),"Apply renderer must bind to explicit Study Session card identity");
assert(visual.includes('core.canonicalStage(card)==="visualize"'),"Visualize renderer must use canonical stage identity");
assert(apply.includes('core.canonicalStage(card)==="apply"'),"Apply renderer must use canonical stage identity");

assert(visual.includes("先用你自己的记忆和经历想画面"),"Visualize must keep learner association before AI assistance");
assert(visual.includes('data-visual-v3="assist"'),"Visualize AI assistance must be an explicit user action");
assert(visual.includes("previousScene:note"),"Visualize AI assistance must refine the learner's existing association instead of inventing the first one");
assert(visual.includes("LexiFlowAiAssistV3?.visualScene"),"Visualize Stage V3 must call the explicit AI Assist V3 authority directly");
assert(ai.includes('postJson("/api/ai/visual-scene"'),"AI Assist V3 must own the real Visualize AI request path");
assert(!runtime.includes("LEGACY_STAGE_AI_BLOCKED")&&!runtime.includes("/api/ai/visual-scene")&&!runtime.includes("/api/ai/practice-prompt"),"runtime compatibility must not retain retired Stage AI caller/block knowledge once AI Assist V3 is the sole frontend authority");
assert(!runtime.includes("LexiFlowAiAssistV3?.visualScene"),"legacy Visualize auto-call paths must not delegate into AI Assist V3");
assert(!runtime.includes("stableInternalVisualScene"),"Visualize V3 must never fall back to a synthetic echo");
assert(visual.includes("let assistBusy=false")&&visual.includes("let imageBusy=false"),"Visualize text assistance and image generation must have independent busy state");
assert(visual.includes('const generating=generation.status==="generating"||imageBusy'),"Visualize text AI assistance must not impersonate image generation in the UI");
assert(!visual.includes('generation.status==="generating"||busy'),"Visualize must not reuse a generic busy flag for image-generation state");
assert(visual.includes('fetch("/api/ai/image"'),"Visualize Stage V3 must own image generation instead of relying on app.js stage rendering");
assert(visual.includes('fetch("/api/images/local"'),"Visualize Stage V3 must own local-image upload");
assert(visual.includes('data-action="finish-visual"'),"Visualize completion must still delegate persistence to the authoritative stage transition");
assert(visual.includes("LexiFlowLearningDataGatewayV3?.current?.()"),"Visualize renderer must consume the learning-data gateway snapshot for redraws");
assert(visual.includes("if(!syncFromGateway())data=normalized;"),"Visualize renderer writes must continue from the Gateway-confirmed persisted snapshot");
assert(visual.includes("loadData(true)"),"Visualize async card patches must retain a fresh source read before mutation");
assert(visual.includes("requestAnimationFrame(()=>{queued=false;syncFromGateway();render();});"),"Visualize DOM mutations must redraw from memory instead of GETing learning data");
assert(visual.includes('beginStageWrite?.(cardId,"visualize",now)'),"Visualize async AI/image writes must serialize with terminal stage completion");
assert(visual.includes('core.canonicalStage(card)!=="visualize"'),"Visualize async patches must fail closed if the card has already left Visualize");
assert(visual.includes("LexiFlowVisualizeStageV3=Object.freeze({isBusy})"),"Visualize stage must expose only its busy state for action-surface coordination");
assert(visual.includes("visualImageConfirmed=false"),"generated or uploaded Visualize images must persist first as unconfirmed checkpoints");
assert(visual.includes("visualImagePreparedAt"),"Visualize image checkpoints must record when the durable draft image was prepared");
assert(visual.includes('visualImageSource="generated"')&&visual.includes('visualImageSource="upload"'),"Visualize checkpoints must preserve generated versus uploaded source semantics");
assert(visual.includes("这张图片已经保存为当前 Visualize 草稿"),"Visualize must tell the learner that an unconfirmed image survives reload before stage completion");
assert(visualActions.includes("LexiFlowVisualizeStageV3?.isBusy?.()"),"Visualize skip UI must reflect an in-flight Visualize write instead of allowing a silent no-op");

assert(apply.includes("先自己表达，再让 AI 检查"),"Apply must preserve learner-first expression before AI feedback");
assert(apply.includes('fetch("/api/ai/text"'),"Apply Stage V3 must own AI expression checking");
assert(apply.includes("copyNorm(text)===copyNorm(card.exampleEn"),"Apply Stage V3 must reject direct reference-example copying before AI checking");
assert(apply.includes('data-action="pass-apply"'),"Apply completion must still delegate to the authoritative stage transition");
assert(apply.includes("LexiFlowAiAssistV3?.practicePrompt"),"Apply Stage V3 must call AI Assist V3 directly for optional prompt refresh");
assert(ai.includes('postJson("/api/ai/practice-prompt"'),"AI Assist V3 must own the real Apply prompt request path");
assert(!runtime.includes("LexiFlowAiAssistV3?.practicePrompt"),"legacy Apply auto-prompt paths must not delegate into AI Assist V3");
assert(apply.includes("suggestionApproved"),"Apply renderer must distinguish an approved correction from ordinary feedback");
assert(apply.includes("LexiFlowLearningDataGatewayV3?.current?.()"),"Apply renderer must consume the learning-data gateway snapshot for redraws");
assert(apply.includes("if(!syncFromGateway())data=normalized;"),"Apply renderer writes must continue from the Gateway-confirmed persisted snapshot");
assert(apply.includes("loadData(true)"),"Apply async card patches must retain a fresh source read before mutation");
assert(apply.includes("requestAnimationFrame(()=>{queued=false;syncFromGateway();render();});"),"Apply DOM mutations must redraw from memory instead of GETing learning data");
assert(apply.includes('beginStageWrite?.(cardId,"apply",now)'),"Apply prompt persistence must serialize with terminal Apply completion");
assert(apply.includes('core.canonicalStage(card)!=="apply"'),"Apply async patches must fail closed if the card has already left Apply");
assert(apply.includes("LexiFlowApplyStageV3=Object.freeze"),"Apply stage must expose a narrow busy-state bridge for action coordination");

assert(visualActions.includes('core.canonicalStage(current)==="visualize"'),"Visualize skip support must follow canonical stage identity");
assert(visualActions.includes('data-visual-actions-v3="skip"'),"Visualize skip support must expose only the V3 action marker");
assert(applyActions.includes('core.canonicalStage(card)==="apply"'),"Apply Draft/Skip support must follow canonical stage identity");

console.log("Stage Renderer V3 checks passed.");