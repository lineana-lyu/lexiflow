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
assert(server.includes("approved 表示“用户原句是否已经可以正确使用”")&&server.includes("若只有 improve/polish 建议，approved=true、level=good"),"server contract must allow a valid original sentence to pass even when optional optimization exists");
assert(server.includes('severity 只能是 "error"、"improve"、"polish"')&&server.includes("blocking=true，必须修正才能通过"),"server contract must classify blocking errors separately from optional suggestions");
assert(server.includes('"changes":[{"from":"原片段","to":"修改后片段","reason":"一句简洁准确的中文解释","severity":"error|improve|polish","blocking":true}]'),"server feedback contract must classify actual corrections so optional polish is not promoted into an error");
assert(server.includes("不能只写“表达不自然”“更自然”“有拼写或表达问题”这种泛泛结论")&&server.includes("拼写问题要明确正确拼写或词形规则")&&server.includes("语法问题要指出具体结构关系"),"correction explanations must identify a concrete spelling, grammar, collocation, or meaning reason");
assert(server.includes("不要把个人风格偏好伪装成 error")&&server.includes("可以作为 improve/polish issue 返回"),"optional stylistic polish must be represented as non-blocking feedback");
assert(server.includes("\"issues\":[{\"span\":\"原句中的问题片段\"")&&server.includes("\"severity\":\"error|improve|polish\"")&&server.includes("\"blocking\":true"),"server feedback must locate problem spans and classify whether they block completion");
assert(server.includes('require("./lib/sentence-feedback-contract")')&&server.includes("feedback.issues = normalizeSentenceDiagnostics("),"server must use the centralized sentence feedback contract instead of maintaining ad-hoc diagnostic normalization");
assert(server.includes("detectEnglishMechanics(sentence)")&&server.includes("[...mechanicsIssues, ...feedback.issues]"),"server must merge deterministic English mechanics with AI diagnostics before approval");
assert(server.includes("issues 必须按“独立可执行修改”拆分")&&server.includes("不同的词或不同的连续片段")&&server.includes("不得臆测“句首、句中、从句、时态”等位置或语法条件"),"AI contract must require atomic corrections and evidence-bound explanations instead of broad inferred grammar stories");
assert(!server.includes("if (!feedback.issues.length && feedback.suggestion && feedback.changes.length)"),"legacy fallback issue synthesis must not bypass the normalized diagnostic authority");
assert(applyStage.includes("lexi-apply-v3-inline-issue")&&applyStage.includes('data-apply-stage-v3="focus-issue"'),"Apply must render diagnosed sentence spans as interactive diagnostics");
assert(applyStage.includes("lexi-apply-v3-inline-issue.blocking")&&applyStage.includes("lexi-apply-v3-inline-issue.optional"),"Apply must visually distinguish blocking red errors from optional yellow suggestions");
assert(applyStage.includes("lexi-apply-v3-review-composer")&&applyStage.includes('spellcheck="false"'),"Apply must enter an immediate diagnostic review state after checking and suppress the browser spelling-wave UI");
assert(applyStage.includes("background:rgba(201,73,73,.12)")&&applyStage.includes("background:rgba(210,159,54,.14)")&&!applyStage.includes("border-bottom:2px solid rgba(194,74,74,.72)"),"blocking errors must use soft red and optional suggestions soft yellow without underline UI");
assert(applyStage.includes("function normalizeIssue(")&&applyStage.includes("function blockingIssues(")&&applyStage.includes("function optionalIssues("),"Apply must normalize issue severity and separate blocking from optional diagnostics");
assert(applyStage.includes("function coalesceIssues(text,issues=[])")&&applyStage.includes("candidate._range.start<item._range.end")&&applyStage.includes("mergeDisplayIssues(text,mergedBlocking,freshOptional)"),"Apply UI must coalesce any residual overlapping diagnostics before rendering");
assert(applyStage.includes("filter(issue=>issue.blocking).slice(0,3)")&&applyStage.includes("blockingIssues(merged).slice(0,3)")&&applyStage.includes("3-required.length"),"all three review slots must be available to blocking errors so the checker does not reveal hidden required fixes in later rounds");
assert(applyStage.includes("<b>原因：</b>")&&applyStage.includes("一键改为")&&applyStage.includes("一键优化为"),"blocking errors and optional suggestions must both explain the reason while using different action language");
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
assert(mechanics.length===1&&mechanics[0].span==="dependable,because"&&mechanics[0].replacement==="dependable, because","deterministic mechanics must catch missing punctuation spacing on the first check");
assert(feedbackContract.joinReasonFragments(["第一条原因。","第二条原因；"])==="第一条原因；第二条原因","merged Chinese explanations must not produce duplicated mixed punctuation such as 。；");
const actionable=feedbackContract.normalizeSentenceDiagnostics(
  "My boss is very dependable,because he never makes any mistakes",
  [{span:"dependable,because",reason:"逗号后需要空格。",hint:"加空格",replacement:"",severity:"error",blocking:true}],
  [{from:"dependable,because",to:"dependable, because",reason:"补上英文逗号后的空格",severity:"error",blocking:true}],
  false,
  "warn"
);
assert(actionable.length===1&&actionable[0].replacement==="dependable, because","diagnostic merge must prefer an actionable replacement when issue and change cover the same span");
assert(!actionable[0].reason.includes("。；"),"diagnostic merge must keep reason punctuation canonical");

const pronounMechanics=feedbackContract.detectEnglishMechanics("My ride-or-die is exuberant, and i often climb montain with her in sunday");
const pronounI=pronounMechanics.find(issue=>issue.span==="i");
assert(pronounI&&pronounI.replacement==="I","deterministic mechanics must catch lowercase first-person pronoun I anywhere in the sentence");
assert(!pronounI.reason.includes("句首")&&pronounI.reason.includes("无论位于句中何处"),"pronoun-I explanation must state the actual rule instead of inventing a sentence-initial condition");

const broadSentence="My ride-or-die is exuberant, and i often climb montain with her in sunday";
const broadIssue={
  span:"i often climb montain with her in sunday",
  reason:"句首人称代词 I 必须大写；montain 拼写错误，应为 mountains；表示每周日应使用 on Sundays；修正大小写、拼写、名词单复数和时间介词",
  hint:"统一修正大小写、拼写和介词",
  replacement:"I often climb mountains with her on Sundays",
  severity:"error",blocking:true,
};
const atomic=feedbackContract.normalizeSentenceDiagnostics(
  broadSentence,
  [...pronounMechanics,broadIssue],
  [],
  false,
  "warn"
);
assert(atomic.length===3&&atomic.every(issue=>issue.blocking),"one broad model correction with three independent edits must normalize into three blocking actions in the same review");
assert(atomic[0].span==="i"&&atomic[0].replacement==="I"&&!atomic[0].reason.includes("句首"),"atomic normalization must replace unsupported positional explanations with the evidence-backed pronoun rule");
assert(atomic.some(issue=>issue.span==="montain"&&issue.replacement==="mountains"),"atomic normalization must preserve the spelling/number edit as its own action");
assert(atomic.some(issue=>issue.span==="in sunday"&&issue.replacement==="on Sundays"),"atomic normalization must preserve the time-preposition/day expression edit as its own action");

console.log("Apply Quality V3 contract checks passed.");