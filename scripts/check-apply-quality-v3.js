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
const feedbackContract=require("../lib/sentence-feedback-contract");
const feedbackPolicy=require("../lib/sentence-feedback-policy");
const {buildSentenceFeedbackPrompt}=require("../lib/sentence-feedback-prompt");

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
assert(applyStage.includes("async function requestApplyCheck(body)")&&applyStage.includes("payload?.userError")&&applyStage.includes("err.userMessage"),"Apply transport must preserve structured server error reasons instead of collapsing failures into a generic error");
assert(applyStage.includes("checkError:null")&&applyStage.includes("s.checkError=normalizeCheckError(err)")&&applyStage.includes("s.feedback=null"),"Apply check failures must be a first-class session state separate from language feedback");
assert(applyStage.includes('data-apply-stage-v3="retry"')&&applyStage.includes('if(action==="submit"||action==="retry")void submit();'),"failed Apply checks must offer a direct retry using the preserved sentence");
assert(applyStage.includes('s.checkError?"检查未完成"')&&applyStage.includes("<b>原因：</b>")&&applyStage.includes("错误代码："),"failure UI must identify that checking did not complete and show the concrete reason/code");
assert(!applyStage.includes('throw new Error("APPLY_AI_FAILED")'),"Apply must not discard the server userError contract behind a generic transport error");
assert(applyStage.includes("function currentState()")&&applyStage.includes("approved:Boolean(s.approved)")&&applyStage.includes("text:String(s.text||\"\")"),"Apply Stage must expose the authoritative checked sentence state");
assert(quality.includes("LexiFlowApplyStageV3?.currentState?.()")&&guard.includes("LexiFlowApplyStageV3?.currentState?.()"),"Apply validators must consume Apply Stage state instead of requiring textarea DOM");
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
assert(transition.includes("const live=window.LexiFlowApplyStageV3?.currentState?.();")&&transition.includes("!live.approved"),"Apply completion must persist only the authoritative AI-approved session sentence");
assert(!transition.includes('document.getElementById("apply-text")?.value||card.applyDraft||card.userSentence'),"Apply completion must not fall back to stale DOM or card sentence fields");

assert(!transport.includes('endpoint === "/api/ai/text"'),"transport layer must not reinterpret authoritative Apply feedback");
assert(!transport.includes("softenNearIdenticalSentenceFeedback"),"transport layer must not downgrade required corrections into optional polish");
assert(!transport.includes("optionalSuggestion"),"transport layer must not manufacture optional Apply suggestions");
assert(server.includes('require("./lib/sentence-feedback-prompt")')&&server.includes("buildSentenceFeedbackPrompt({ word, meaningZh, sentence })"),"server must consume the isolated generic Apply prompt policy rather than embed regression-specific prompt text");
assert(server.includes('require("./lib/sentence-feedback-contract")')&&server.includes("feedback.issues = normalizeSentenceDiagnostics("),"server must use the centralized sentence feedback contract instead of maintaining ad-hoc diagnostic normalization");
assert(server.includes("detectEnglishMechanics(sentence)")&&server.includes("[...mechanicsIssues, ...feedback.issues]"),"server must merge deterministic English mechanics with AI diagnostics before approval");
assert(server.includes("Progression is a product policy, not a model opinion")&&server.includes("feedback.approved = !hasBlockingIssue"),"Apply progression must be derived from normalized blocking severity rather than raw model approval");
const genericPrompt=buildSentenceFeedbackPrompt({word:"reliable",meaningZh:"可靠的",sentence:"I rely on her."});
assert(genericPrompt.includes("error：必须修正")&&genericPrompt.includes("warning：书写层面的明确问题")&&genericPrompt.includes("suggestion：只是更自然"),"production prompt must define a three-level diagnostic model");
assert(genericPrompt.includes("非目标词的普通拼写错误、大小写、标点、空格和排版问题必须是 warning")&&genericPrompt.includes("approved 只取决于是否仍存在 error"),"production prompt must keep surface-writing issues advisory while preserving correctness gates");
assert(!genericPrompt.includes("第一人称单数代词")&&!genericPrompt.includes("ride-or-die")&&!genericPrompt.includes("montain"),"regression fixtures and grammar-specific examples must stay out of the production prompt");
assert(!server.includes("if (!feedback.issues.length && feedback.suggestion && feedback.changes.length)"),"legacy fallback issue synthesis must not bypass the normalized diagnostic authority");
assert(applyStage.includes("lexi-apply-v3-inline-issue")&&applyStage.includes('data-apply-stage-v3="focus-issue"'),"Apply must render diagnosed sentence spans as interactive diagnostics");
assert(applyStage.includes("lexi-apply-v3-inline-issue.blocking")&&applyStage.includes("lexi-apply-v3-inline-issue.optional"),"Apply must visually distinguish blocking red errors from optional yellow suggestions");
assert(applyStage.includes("lexi-apply-v3-review-composer")&&applyStage.includes('spellcheck="false"'),"Apply must enter an immediate diagnostic review state after checking and suppress the browser spelling-wave UI");
assert(applyStage.includes("background:rgba(201,73,73,.12)")&&applyStage.includes("background:rgba(210,159,54,.14)")&&!applyStage.includes("border-bottom:2px solid rgba(194,74,74,.72)"),"blocking errors must use soft red and optional suggestions soft yellow without underline UI");
assert(applyStage.includes("function normalizeIssue(")&&applyStage.includes("function blockingIssues(")&&applyStage.includes("function optionalIssues("),"Apply must normalize issue severity and separate blocking from optional diagnostics");
assert(applyStage.includes("function coalesceIssues(text,issues=[])")&&applyStage.includes("candidate._range.start<item._range.end")&&applyStage.includes("mergeDisplayIssues(text,mergedBlocking,freshOptional)"),"Apply UI must coalesce any residual overlapping diagnostics before rendering");
assert(applyStage.includes("filter(issue=>issue.blocking).slice(0,3)")&&applyStage.includes("blockingIssues(merged).slice(0,3)")&&applyStage.includes("3-required.length"),"all three review slots must be available to blocking errors so the checker does not reveal hidden required fixes in later rounds");
assert(applyStage.includes("<b>原因：</b>")&&applyStage.includes("一键改为")&&applyStage.includes("一键修正")&&applyStage.includes("一键优化为"),"error, warning, and suggestion diagnostics must use distinct learner-facing action language");
assert(applyStage.includes('data-apply-stage-v3="fix-issue"')&&applyStage.includes("function applyIssueFix(index)"),"Apply must support one-click local replacement for each fixable issue");
assert(applyStage.includes("const surfaceNorm=")&&applyStage.includes("const hasSurfaceEdit="),"Apply must distinguish visible edits from semantic-copy normalization");
assert(applyStage.includes("hasSurfaceEdit(issue.span,replacement)")&&!applyStage.includes("copyNorm(replacement)!==copyNorm(issue.span)"),"punctuation and spacing fixes must remain actionable instead of being hidden as semantically equivalent");
assert(applyStage.includes("One AI check creates one correction transaction")&&applyStage.includes("issues:[...remainingBlocking,...remainingOptional]"),"accepted local fixes must stay within the original diagnostic transaction so later checks cannot introduce unrelated advice");
assert(applyStage.includes('suggestion:approved?"":norm(s.feedback?.suggestion)')&&applyStage.includes('level:approved?"good":"warn"'),"finishing all blocking fixes must close the transaction without a fresh AI review");
assert(!applyStage.slice(applyStage.indexOf("function applyIssueFix(index)"),applyStage.indexOf("function adopt()")).includes("void submit()"),"one-click fixes must consume the current correction plan instead of starting a fresh generative review");
assert(applyStage.includes("pendingIssues:[]")&&applyStage.includes("const remainingBlocking=blockingIssues(surviving)")&&applyStage.includes("s.pendingIssues=remainingBlocking"),"one-click fixes must keep untouched blocking issues inside the same correction transaction");
assert(applyStage.includes("const originalApproved=Boolean(")&&applyStage.includes("mergedBlocking.length===0")&&applyStage.includes("s.pendingIssues=mergedBlocking"),"automatic recheck must block only on unresolved blocking issues");
assert(applyStage.includes("s.approved=originalApproved")&&applyStage.includes('optional.length?"保留原句 · 明天首次复习"'),"a sentence with only optional suggestions must remain approved and allow the learner to keep the original");
assert(applyStage.includes("hasUnactionableBlocking")&&applyStage.includes("showFallback=Boolean(suggestion&&!s.approved&&(!issues.length||hasUnactionableBlocking))"),"full corrected sentence must remain available when a blocking diagnostic cannot provide a local replacement");
assert(applyStage.includes("lexi-apply-v3-inline-fixed")&&applyStage.includes("lastFix")&&applyStage.includes("reviewMode=Boolean(!s.editing&&(s.submitting||s.feedback||s.checkError||s.lastFix||s.approved))"),"accepted fixes and failed checks must remain explicit stable review states");
assert(!applyStage.includes("state.lastFix=null;render();"),"automatic recheck must not erase the green resolved marker on a timer");
assert(applyStage.includes("cardId:card.id"),"Apply feedback must stay bound to the exact card ID");
assert(!applyStage.includes("第 1 次自改")&&!applyStage.includes("第 2 次检查")&&!applyStage.includes("/ 3 轮"),"Apply UI must not expose correction-round rituals");
assert(applyStage.includes("修改原因")&&applyStage.includes("lexi-apply-v3-changes"),"Apply fallback full correction must retain concise reasons when local diagnostics are unavailable");

const mechanics=feedbackContract.detectEnglishMechanics("My boss is very dependable,because he never makes any mistakes");
assert(mechanics.length===1&&mechanics[0].span==="dependable,because"&&mechanics[0].replacement==="dependable, because","deterministic mechanics must catch missing punctuation spacing");
assert(mechanics[0].severity==="warning"&&mechanics[0].blocking===false&&mechanics[0].category==="spacing","mechanical punctuation/spacing issues must be advisory, not learning gates");
assert(feedbackContract.joinReasonFragments(["第一条原因。","第二条原因；"])==="第一条原因；第二条原因","merged Chinese explanations must keep canonical punctuation");

const punctuation=feedbackContract.normalizeSentenceDiagnostics({
  sentence:"My boss is very dependable,because he never makes any mistakes",
  issues:[...mechanics],
  changes:[],
});
assert(punctuation.length===1&&punctuation[0].severity==="warning"&&!punctuation[0].blocking,"surface mechanics must remain warning-level after normalization");

const pronoun=feedbackContract.normalizeSentenceDiagnostics({
  sentence:"My friend and i hike.",
  issues:[
    ...feedbackContract.detectEnglishMechanics("My friend and i hike."),
    {span:"i",reason:"这里的人称代词要大写",hint:"改成 I",replacement:"I",category:"capitalization",severity:"error",source:"issue"}
  ],
  changes:[],
});
assert(pronoun.length===1&&pronoun[0].replacement==="I","same-span mechanics/model records must collapse to one issue");
assert(pronoun[0].severity==="warning"&&!pronoun[0].blocking,"capitalization must remain advisory even when the model tries to escalate it");

const spelling=feedbackContract.normalizeSentenceDiagnostics({
  sentence:"I often climb montain with her",
  issues:[{span:"montain",reason:"拼写错误",hint:"改正拼写",replacement:"mountain",category:"spelling",severity:"error",source:"issue"}],
  changes:[{from:"montain",to:"mountains",reason:"完整修正版使用复数",category:"spelling",severity:"error",source:"change"}],
});
assert(spelling.length===1&&spelling[0].replacement==="mountains","same-span issue/change conflicts must keep one final replacement authority");
assert(spelling[0].severity==="warning"&&!spelling[0].blocking,"non-target spelling must never be promoted into a blocking error by model severity");

const grammar=feedbackContract.normalizeSentenceDiagnostics({
  sentence:"He go to school.",
  issues:[{span:"He go",reason:"第三人称单数主谓不一致",hint:"改为 He goes",replacement:"He goes",category:"grammar",severity:"error",source:"issue"}],
  changes:[],
});
assert(grammar.length===1&&grammar[0].severity==="error"&&grammar[0].blocking,"real grammar correctness errors must remain blocking");

const targetUsage=feedbackContract.normalizeSentenceDiagnostics({
  sentence:"I dependabled on him.",
  issues:[{span:"dependabled",reason:"目标词词形错误",hint:"改为 depended",replacement:"depended",category:"target_usage",severity:"error",source:"issue"}],
  changes:[],
});
assert(targetUsage.length===1&&targetUsage[0].blocking,"target-word correctness must remain a learning gate");

assert(feedbackPolicy.applySeverityPolicy({category:"capitalization",severity:"error"}).severity==="warning","server policy must cap capitalization at warning");
assert(feedbackPolicy.applySeverityPolicy({category:"spelling",severity:"error"}).severity==="warning","server policy must cap ordinary spelling at warning");
assert(feedbackPolicy.applySeverityPolicy({category:"grammar",severity:"error"}).blocking===true,"server policy must allow grammar errors to block");
assert(feedbackPolicy.applySeverityPolicy({category:"unknown",severity:"error"}).blocking===false,"unknown model categories must fail open as advisory instead of blocking learning");

console.log("Apply Quality V3 contract checks passed.");