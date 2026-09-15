const fs=require("fs");
const path=require("path");
function read(p){return fs.readFileSync(path.join(__dirname,"..",p),"utf8").replace(/\r\n/g,"\n");}
function assert(v,m){if(!v)throw new Error(m);}
const ai=read("public/ai-assist-v3.js");
const visual=read("public/visualize-stage-v3.js");
const guard=read("public/visualize-input-guard-v3.js");
const actions=read("public/visualize-actions-v3.js");
const transition=read("public/stage-transition-v3.js");
const server=read("server.js");
assert(ai.includes("userScene")&&!ai.includes("sceneAvoidance("),"AI concrete-scene flow must preserve the user's scene instead of avoiding it");
assert(server.includes("用户原始联想（最高优先级，必须保留）"),"Server prompt must anchor on the user's own scene");
assert(guard.includes("LexiFlowVisualizeInputGuardV3")&&guard.includes("clearDraft"),"Visual input needs one shared draft authority");
assert(visual.includes("图片后台生成中 · 完成视觉联想")&&visual.includes("saveCardAnyStagePatch"),"Image generation must not block stage completion");
assert(visual.includes("cardId:card.id,requestId"),"Background image job must identify its card and request");
assert(actions.includes('pending=current.imageGeneration?.status==="generating"'),"Visual action decorator must treat a pending image as continuable");
assert(transition.includes("visualImagePendingAtAdvance"),"Stage transition must preserve pending generation intent");
assert(server.includes("attachVisualGenerationToCard")&&server.includes("await attachVisualGenerationToCard(body,image)"),"Server must attach background image results even after navigation");
assert(visual.includes("lexi-v3-generation-dots")&&!visual.includes('<span class="mini-spinner"></span><strong>正在生成联想图'),"Visual generation state must use the refined non-blocking animation");
console.log("Visualize product-flow checks passed.");
