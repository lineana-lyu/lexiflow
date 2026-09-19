const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");

const index=read("public/index.html");
const quality=read("public/apply-quality-v3.js");
const applyStage=read("public/apply-stage-v3.js");
const guard=read("public/apply-guard-v3.js");
const transport=read("public/transport-fixes.js");
const transition=read("public/stage-transition-v3.js");
const server=read("server.js");

assert(index.includes("apply-quality-v3.js"),"Apply Quality V3 must load in index.html");
assert(index.includes("apply-guard-v3.js"),"Apply Guard V3 must load in index.html");
assert(!index.includes("feedback-fixes.js"),"retired feedback compatibility shim must not return to runtime");
assert(!fs.existsSync(path.join(root,"public","feedback-fixes.js")),"retired feedback compatibility shim must stay deleted");
assert(!index.includes('<script src="./apply-guard-v2.js"></script>'),"legacy Apply Guard V2 must not execute beside V3");
assert(index.indexOf("apply-quality-v3.js")<index.indexOf("stage-transition-v3.js"),"Apply quality capture gate must register before authoritative stage completion");
assert(index.indexOf("apply-quality-v3.js")<index.indexOf("apply-stage-v3.js"),"Apply Quality bridge must load before Apply Stage consumes AI feedback");
assert(!quality.includes("correctionHeldBack")&&!quality.includes("feedbackRound"),"Apply must not use staged correction rounds after interactive diagnostics");
assert(quality.includes("LexiFlowApplyQualityV3=Object.freeze")&&quality.includes("processFeedback(payload,body)"),"Apply Quality must expose a narrow explicit feedback-processing bridge");
assert(!quality.includes("window.fetch=")&&!quality.includes("window.fetch ="),"Apply Quality must not wrap global fetch after Apply Stage adopts the explicit bridge");
assert(!quality.includes("/api/learning-data"),"Apply Quality must use the Learning Data Gateway snapshot instead of observing learning-data transport");
assert(quality.includes("registerAfterPersist?.(()=>schedule())"),"Apply Quality must redraw from Gateway-confirmed persistence events");
assert(applyStage.includes('fetch("/api/ai/text"')&&applyStage.includes("LexiFlowApplyQualityV3?.processFeedback?."),"Apply Stage must own the AI request and explicitly pass its response through Apply Quality before interpretation");
assert(quality.includes("function immediateFeedback(payload,body)")&&quality.includes("recordAudit(body,feedback);"),"Apply feedback must be available immediately for interactive diagnostics");
assert(!quality.includes("lastFailedInput")&&!quality.includes("audit.round"),"Apply quality must not track correction rounds");
assert(quality.includes("originalPass"),"gate must distinguish an approved original sentence from an approved correction");
assert(quality.includes("suggestionPass"),"an adopted AI correction may pass only when that correction was approved");
assert(quality.includes("event.stopImmediatePropagation()"),"unapproved Apply completion must stop before Stage Transition V3");
assert(quality.includes("你修改了句子，需要重新检查后再继续"),"editing after an audit must invalidate the previous approval");
assert(quality.includes("isReferenceExampleCopy"),"Apply must deterministically detect exact copies of the dictionary example");
assert(quality.includes('[data-action="submit-apply"]'),"copied examples must be stopped before an unnecessary AI check");
assert(quality.includes("这句话和词典参考例句相同"),"copied reference examples must explain why they cannot complete Apply");
assert(quality.includes("LexiFlowStudyRenderer?.currentCardId"),"reference-copy checks must bind to the exact current learning card");
assert(quality.includes("function syncFromGateway()"),"Apply Quality must resolve current-card audit identity from the learning-data gateway snapshot");
assert(quality.includes("keyOf(card.id,card.word,card.meaningZh)"),"Apply audit lookup must bind feedback progress to the exact card ID");
assert(!quality.includes("function currentWord(")&&!quality.includes("function currentMeaning("),"Apply Quality must not infer audit identity from rendered word or meaning text");
assert(quality.includes("requestAnimationFrame(()=>{queued=false;syncFromGateway();decorate();});"),"Apply Quality mutation decoration must stay on the in-memory snapshot");

assert(guard.includes("LexiFlowStudyRenderer?.currentCardId"),"Apply Guard V3 must bind validation to the exact current card ID");
assert(guard.includes('core.canonicalStage(card)==="apply"'),"Apply Guard V3 must verify canonical Apply stage identity");
assert(guard.includes("uses(value,card.word)"),"Apply Guard V3 must validate the target word from card data");
assert(!guard.includes('document.querySelector(".apply-word-hero .target-word-text'),"Apply Guard V3 must not infer target identity from rendered word text");
assert(guard.includes("event.stopImmediatePropagation()"),"invalid final Apply attempts must fail closed before stage completion");
assert(guard.includes("function syncFromGateway()"),"Apply Guard must reuse the canonical learning-data snapshot");
assert(guard.includes("requestAnimationFrame(()=>{\n      queued=false;\n      syncFromGateway();\n      decorate();"),"Apply Guard DOM mutations must validate from the in-memory gateway snapshot");
assert(!guard.includes("if(refreshData)await refresh()"),"Apply Guard must not GET learning data on every renderer mutation");
assert(transition.includes('stageTransitionAuthority:"v3"'),"approved Apply completion must persist through Stage Transition V3");

assert(!transport.includes('endpoint === "/api/ai/text"'),"transport layer must not reinterpret authoritative Apply feedback");
assert(!transport.includes("softenNearIdenticalSentenceFeedback"),"transport layer must not downgrade required corrections into optional polish");
assert(!transport.includes("optionalSuggestion"),"transport layer must not manufacture optional Apply suggestions");
assert(server.includes("完全正确时 suggestion 为空"),"server contract must explicitly reserve empty suggestion for a fully correct original sentence");
assert(server.includes("只要句子不完整、语法错误、搭配不自然或明显表达不完整，suggestion 必须给出"),"server contract must return a correction for materially flawed English input");
assert(server.includes('"changes":[{"from":"原片段","to":"修改后片段","reason":"一句简洁准确的中文解释"}]'),"server feedback contract must return concise explanations for actual corrections");
assert(server.includes("不确定具体语法规则时，只说明更自然的实际用法，不要编造规则"),"correction explanations must prefer accurate usage guidance over invented grammar rules");
assert(server.includes("\"issues\":[{\"span\":\"原句中的问题片段\"")&&server.includes("\"replacement\":\"可直接替换 span 的局部修正\""),"server feedback must locate exact problem spans and return a local one-click replacement");
assert(server.includes("if (!feedback.issues.length && feedback.suggestion && feedback.changes.length)")&&server.includes('if (feedback.level === "good" && !feedback.suggestion) feedback.issues = [];'),"corrected suggestions must preserve or synthesize issue diagnostics instead of clearing them");
assert(applyStage.includes("lexi-apply-v3-inline-issue")&&applyStage.includes('data-apply-stage-v3="focus-issue"'),"Apply must highlight diagnosed sentence spans as interactive red issues");
assert(applyStage.includes("lexi-apply-v3-review-composer")&&applyStage.includes('spellcheck="false"'),"Apply must enter an immediate diagnostic review state after checking and suppress the browser spelling-wave UI");
assert(applyStage.includes("background:rgba(201,73,73,.12)")&&!applyStage.includes("border-bottom:2px solid rgba(194,74,74,.72)"),"diagnosed text must use a soft red background rather than a red underline");
assert(applyStage.includes("if(direct.length)return direct;")&&applyStage.includes("return feedbackChanges(fb).map(change=>"),"Apply must fall back from changes to visible issues when the AI omits the issue array");
assert(applyStage.includes("<b>原因：</b>")&&applyStage.includes("一键改为"),"each issue must show a clear reason and a local one-click replacement");
assert(applyStage.includes('data-apply-stage-v3="fix-issue"')&&applyStage.includes("function applyIssueFix(index)"),"Apply must support one-click local replacement for each fixable issue");
assert(applyStage.includes("setTimeout(()=>{")&&applyStage.includes("void submit();"),"one-click fixes must automatically recheck the corrected sentence");
assert(applyStage.includes("lexi-apply-v3-inline-fixed")&&applyStage.includes("已替换 · 正在自动复检"),"accepted fixes must show a short resolved-state animation while rechecking");
assert(applyStage.includes("cardId:card.id"),"Apply feedback must stay bound to the exact card ID");
assert(!applyStage.includes("第 1 次自改")&&!applyStage.includes("第 2 次检查")&&!applyStage.includes("/ 3 轮"),"Apply UI must not expose correction-round rituals");
assert(applyStage.includes("为什么这样改")&&applyStage.includes("lexi-apply-v3-changes"),"Apply UI must retain concise reasons for full corrections");

console.log("Apply Quality V3 contract checks passed.");