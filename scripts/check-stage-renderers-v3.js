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
const visualSupport=read("public/visualize-v2.js");
const applyActions=read("public/apply-actions-v3.js");

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
before("visualize-stage-v3.js","visualize-v2.js");

assert(surface.includes('["select","选词确认"]')&&surface.includes('["memorize","记忆"]')&&surface.includes('["review","复习巩固"]'),"study surface must expose five canonical product stages");
assert(!surface.includes('memorize1')&&!surface.includes('memorize2'),"study surface must not expose legacy Memorize sub-stages");
assert(surface.includes("core.canonicalStage(card)"),"study surface must label stages from the canonical domain stage");
assert(surface.includes("const ROOTS=Object.freeze"),"study surface must know the authoritative V3 renderer roots");
assert(surface.includes("data-study-stage-host-v3"),"study surface must replace the legacy stage body with a passive host while a V3 renderer loads");
assert(surface.includes("不会回退到旧学习流程"),"passive study host must explicitly fail closed rather than expose legacy stage UI");
assert(surface.includes("window.LexiFlowStudyStageSurfaceV3=Object.freeze"),"study surface must expose only a narrow canonical-stage descriptor");
assert(surface.includes('text==="英→中"||text==="中→英"'),"legacy Memorize labels must be normalized on residual shell surfaces");

assert(select.includes("LexiFlowStudyRenderer?.currentCardId"),"Select renderer must bind to explicit Study Session card identity");
assert(visual.includes("LexiFlowStudyRenderer?.currentCardId"),"Visualize renderer must bind to explicit Study Session card identity");
assert(apply.includes("LexiFlowStudyRenderer?.currentCardId"),"Apply renderer must bind to explicit Study Session card identity");
assert(visual.includes('core.canonicalStage(card)==="visualize"'),"Visualize renderer must use canonical stage identity");
assert(apply.includes('core.canonicalStage(card)==="apply"'),"Apply renderer must use canonical stage identity");

assert(visual.includes("先用你自己的记忆和经历想画面"),"Visualize must keep learner association before AI assistance");
assert(visual.includes('data-visual-v3="assist"'),"Visualize AI assistance must be an explicit user action");
assert(visual.includes("previousScene:note"),"Visualize AI assistance must refine the learner's existing association instead of inventing the first one");
assert(visual.includes('fetch("/api/ai/image"'),"Visualize Stage V3 must own image generation instead of relying on app.js stage rendering");
assert(visual.includes('fetch("/api/images/local"'),"Visualize Stage V3 must own local-image upload");
assert(visual.includes('data-action="finish-visual"'),"Visualize completion must still delegate persistence to the authoritative stage transition");

assert(apply.includes("先自己表达，再让 AI 检查"),"Apply must preserve learner-first expression before AI feedback");
assert(apply.includes('fetch("/api/ai/text"'),"Apply Stage V3 must own AI expression checking");
assert(apply.includes("copyNorm(text)===copyNorm(card.exampleEn"),"Apply Stage V3 must reject direct reference-example copying before AI checking");
assert(apply.includes('data-action="pass-apply"'),"Apply completion must still delegate to the authoritative stage transition");
assert(apply.includes('fetch("/api/ai/practice-prompt"'),"Apply Stage V3 must own optional prompt refresh");
assert(apply.includes("suggestionApproved"),"Apply renderer must distinguish an approved correction from ordinary feedback");

assert(visualSupport.includes('core.canonicalStage(current)==="visualize"'),"Visualize skip support must follow canonical stage identity");
assert(applyActions.includes('core.canonicalStage(card)==="apply"'),"Apply Draft/Skip support must follow canonical stage identity");

console.log("Stage Renderer V3 checks passed.");
