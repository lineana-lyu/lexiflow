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
const feedbackEvidence=require("../lib/sentence-feedback-evidence");
const {buildSentenceFeedbackPrompt}=require("../lib/sentence-feedback-prompt");
const {stableFeedbackKey}=require("../lib/sentence-feedback-store");
const feedbackActions=require("../lib/sentence-feedback-actions");
const {
  buildSentenceActionPrompt,
  buildSentenceActionValidationPrompt,
}=require("../lib/sentence-feedback-action-prompt");

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
assert(server.includes("detectEnglishMechanics(sentence)")&&server.includes("[...mechanicsIssues, ...feedback.issues]"),"server must merge deterministic mechanics into the diagnostic normalization pipeline");
assert(server.includes("Progression is a product policy, not a model opinion")&&server.includes("feedback.approved = !hasBlockingIssue"),"Apply progression must be derived from normalized blocking diagnostics rather than raw model approval");
assert(server.includes('require("./lib/sentence-feedback-store")')&&server.includes("PersistentSentenceFeedbackStore")&&server.includes('cacheScope: "persistent"'),"same Apply input must reuse a persistent content-addressed review instead of re-running a generative checker after restart");
assert(!server.includes("const sentenceFeedbackCache = new Map()"),"Apply review stability must not depend on process-local memory only");
assert(server.includes("targetWord: word")&&!server.includes("changes: feedback.changes"),"suggestion change summaries must not participate in diagnostic authority");
assert(server.includes('require("./lib/sentence-feedback-actions")')&&server.includes('require("./lib/sentence-feedback-action-prompt")'),"Apply server must separate diagnostic authority from code-action planning");
assert(server.includes("feedback.actions = []")&&server.includes("buildSentenceActionPrompt")&&server.includes("buildSentenceActionValidationPrompt"),"English one-click edits must be planned and independently validated after diagnostics");
assert(server.includes("finalizeVerifiedActions")&&server.includes('console.warn("Apply code-action planning failed:"'),"unsafe or failed code-action planning must fail closed without invalidating the diagnostic review");
const genericPrompt=buildSentenceFeedbackPrompt({word:"reliable",meaningZh:"可靠的",sentence:"I rely on her."});
assert(genericPrompt.includes("这不是作文润色器，也不是排版检查器")&&genericPrompt.includes("明确拼错的英文单词使用 category=spelling、severity=error"),"production prompt must be usage-focused while treating definite spelling mistakes as correctness errors");
assert(genericPrompt.includes("不要把大小写、标点、空格、排版等表层书写问题输出为 issue")&&genericPrompt.includes("changes 只是完整 suggestion 的变更摘要，不是诊断来源"),"production prompt must suppress low-value mechanics and separate diagnostics from suggestion edits");
assert(genericPrompt.includes("start/end 是该 span 在用户原句中的 0-based 字符区间")&&genericPrompt.includes('"start":0,"end":1'),"production prompt must require positional diagnostic identity instead of span text alone");
assert(genericPrompt.includes("replacement 是诊断阶段的“候选最小修正”")&&genericPrompt.includes("它不是最终一键修改动作"),"diagnostic prompt must explicitly prevent issue replacements from becoming executable actions");
assert(!genericPrompt.includes("第一人称单数代词")&&!genericPrompt.includes("ride-or-die")&&!genericPrompt.includes("montain"),"regression fixtures and grammar-specific examples must stay out of the production prompt");
const genericActionPrompt=buildSentenceActionPrompt({
  word:"reserved",meaningZh:"保留的",
  sentence:"She speaks with people.",
  issues:[{id:"issue-1",span:"with",start:11,end:15,category:"collocation",severity:"error",reason:"介词搭配错误"}],
});
assert(genericActionPrompt.includes("诊断已经完成；你不能新增、删除或改写诊断本身")&&genericActionPrompt.includes("最小字符区间"),"code-action planner must treat diagnostics as immutable and produce minimal edits");
assert(genericActionPrompt.includes("保留原句里已经正确的介词")&&genericActionPrompt.includes("如果无法给出一个你能确认安全的局部修复"),"code-action planner must preserve correct structure words and fail closed when unsafe");
const genericValidatorPrompt=buildSentenceActionValidationPrompt({
  word:"reserved",meaningZh:"保留的",sentence:"She speaks with people.",
  issues:[],actions:[],
});
assert(genericValidatorPrompt.includes("不负责重新诊断")&&genericValidatorPrompt.includes("误删、误改了原本正确的介词"),"code-action verifier must independently validate post-edit grammar and preserve structure words");
assert(!server.includes("if (!feedback.issues.length && feedback.suggestion && feedback.changes.length)"),"legacy fallback issue synthesis must not bypass the normalized diagnostic authority");
assert(applyStage.includes("lexi-apply-v3-inline-issue")&&applyStage.includes('data-apply-stage-v3="focus-issue"'),"Apply must render diagnosed sentence spans as interactive diagnostics");
assert(applyStage.includes("lexi-apply-v3-inline-issue.blocking")&&applyStage.includes("lexi-apply-v3-inline-issue.optional"),"Apply must visually distinguish blocking red errors from optional yellow suggestions");
assert(applyStage.includes("lexi-apply-v3-review-composer")&&applyStage.includes('spellcheck="false"'),"Apply must enter an immediate diagnostic review state after checking and suppress the browser spelling-wave UI");
assert(applyStage.includes("background:rgba(201,73,73,.12)")&&applyStage.includes("background:rgba(210,159,54,.14)")&&!applyStage.includes("border-bottom:2px solid rgba(194,74,74,.72)"),"blocking errors must use soft red and optional suggestions soft yellow without underline UI");
assert(applyStage.includes("function normalizeIssue(")&&applyStage.includes("function blockingIssues(")&&applyStage.includes("function optionalIssues("),"Apply must normalize issue severity and separate blocking from optional diagnostics");
assert(applyStage.includes("function coalesceIssues(text,issues=[])")&&applyStage.includes("candidate._range.start<item._range.end")&&applyStage.includes("mergeDisplayIssues(text,mergedBlocking,freshOptional)"),"Apply UI must coalesce any residual overlapping diagnostics before rendering");
assert(applyStage.includes("filter(issue=>issue.blocking).slice(0,3)")&&applyStage.includes("blockingIssues(merged).slice(0,3)")&&applyStage.includes("3-required.length"),"all three review slots must be available to blocking errors so the checker does not reveal hidden required fixes in later rounds");
assert(applyStage.includes("<b>原因：</b>")&&applyStage.includes("一键改为")&&applyStage.includes("一键优化为"),"diagnostics must keep reasons while verified actions remain available when safe");
assert(applyStage.includes("function feedbackActions(fb)")&&applyStage.includes("function actionForIssue(issue,actions)")&&applyStage.includes("function issueReplacement(issue,actions)"),"Apply UI must source one-click edits from verified code actions, not diagnostic replacement text");
assert(!applyStage.includes("replacement:norm(item?.replacement)"),"diagnostic normalization in the UI must not expose raw issue replacements as executable actions");
assert(applyStage.includes("start:Number.isInteger(item?.start)?item.start:null")&&applyStage.includes("function issueRange(text,issue)"),"Apply UI must preserve server diagnostic offsets and resolve issues by range identity");
assert(applyStage.includes("rebaseIssuesAfterEdit")&&applyStage.includes("start:range.start+delta")&&applyStage.includes("end:range.end+delta"),"remaining diagnostic ranges must rebase after a one-click edit instead of being rediscovered by text search");
assert(applyStage.includes("wordLikeSpan(target)")&&applyStage.includes("!wordChar(source[start-1])")&&applyStage.includes("!wordChar(source[end])"),"fallback diagnostic lookup must respect token boundaries and never match a letter inside a larger word");
assert(!applyStage.includes("return feedbackChanges(fb).map(change=>normalizeIssue"),"full-suggestion changes must not be synthesized into diagnostics when issues are absent");
assert(applyStage.includes('data-apply-stage-v3="fix-issue"')&&applyStage.includes("function applyIssueFix(index)"),"Apply must support one-click local replacement for each fixable issue");
assert(applyStage.includes("const surfaceNorm=")&&applyStage.includes("const hasSurfaceEdit="),"Apply must distinguish visible edits from semantic-copy normalization");
assert(applyStage.includes("actionRange(s.text,action)")&&applyStage.includes("hasSurfaceEdit(action.before,replacement)"),"one-click fixes must validate the exact verified action range and before-text before editing");
assert(applyStage.includes("Diagnostics and code actions are separate")&&applyStage.includes("issues:[...remainingBlocking,...remainingOptional]")&&applyStage.includes("actions:remainingActions"),"accepted verified actions must stay inside the original correction transaction without re-diagnosing the sentence");
assert(applyStage.includes('suggestion:approved?"":norm(s.feedback?.suggestion)')&&applyStage.includes('level:approved?"good":"warn"'),"finishing all blocking fixes must close the transaction without a fresh AI review");
assert(!applyStage.slice(applyStage.indexOf("function applyIssueFix(index)"),applyStage.indexOf("function adopt()")).includes("void submit()"),"one-click fixes must consume the current correction plan instead of starting a fresh generative review");
assert(applyStage.includes("pendingIssues:[]")&&applyStage.includes("const remainingBlocking=blockingIssues(surviving)")&&applyStage.includes("s.pendingIssues=remainingBlocking"),"one-click fixes must keep untouched blocking issues inside the same correction transaction");
assert(applyStage.includes("rebaseActionsAfterEdit")&&applyStage.includes("removedIssueId"),"remaining verified code actions must rebase after an earlier local edit and remove the consumed action");
assert(applyStage.includes("const originalApproved=Boolean(")&&applyStage.includes("mergedBlocking.length===0")&&applyStage.includes("s.pendingIssues=mergedBlocking"),"automatic recheck must block only on unresolved blocking issues");
assert(applyStage.includes("s.approved=originalApproved")&&applyStage.includes('optional.length?"保留原句 · 明天首次复习"'),"a sentence with only optional suggestions must remain approved and allow the learner to keep the original");
assert(applyStage.includes("hasUnactionableBlocking")&&applyStage.includes('showFallback=Boolean(fb.inputLanguage==="zh"'),"English blockers without a verified code action must not expose an unverified full-sentence rewrite as a one-click escape hatch");
assert(applyStage.includes("lexi-apply-v3-inline-fixed")&&applyStage.includes("lastFix")&&applyStage.includes("reviewMode=Boolean(!s.editing&&(s.submitting||s.feedback||s.checkError||s.lastFix||s.approved))"),"accepted fixes and failed checks must remain explicit stable review states");
assert(!applyStage.includes("state.lastFix=null;render();"),"automatic recheck must not erase the green resolved marker on a timer");
assert(applyStage.includes("cardId:card.id"),"Apply feedback must stay bound to the exact card ID");
assert(!applyStage.includes("第 1 次自改")&&!applyStage.includes("第 2 次检查")&&!applyStage.includes("/ 3 轮"),"Apply UI must not expose correction-round rituals");
assert(applyStage.includes("修改原因")&&applyStage.includes("lexi-apply-v3-changes"),"Apply fallback full correction must retain concise reasons when local diagnostics are unavailable");

const rangeSentence="My ride or die is exuberant, because i often climb.";
const standaloneI=rangeSentence.indexOf(" i ")+1;
const resolvedI=feedbackContract.feedbackSpanRange(rangeSentence,"i");
assert(resolvedI&&resolvedI.start===standaloneI&&resolvedI.end===standaloneI+1,"single-token diagnostics must resolve the standalone token, not the i inside ride");
const rideInnerI=rangeSentence.indexOf("ride")+1;
const rejectedInner=feedbackContract.validatedExplicitRange(rangeSentence,"i",rideInnerI,rideInnerI+1);
assert(rejectedInner===null,"an explicit model offset pointing inside ride must be rejected for standalone i");
const mechanicsI=feedbackContract.detectEnglishMechanics(rangeSentence).find(issue=>issue.span==="i");
assert(mechanicsI&&mechanicsI.start===standaloneI&&mechanicsI.end===standaloneI+1,"deterministic mechanics must carry the canonical source range from detection time");

const mechanics=feedbackContract.detectEnglishMechanics("My boss is very dependable,because he never makes any mistakes");
assert(mechanics.length===1&&mechanics[0].category==="spacing","deterministic mechanics may detect spacing internally");
const hiddenMechanics=feedbackContract.normalizeSentenceDiagnostics({
  sentence:"My boss is very dependable,because he never makes any mistakes",
  issues:mechanics,
});
assert(hiddenMechanics.length===0,"Apply must not surface punctuation/spacing mechanics in the learner-facing review");

const pronounReminder=feedbackContract.normalizeSentenceDiagnostics({
  sentence:"My friend and i hike.",
  issues:[
    ...feedbackContract.detectEnglishMechanics("My friend and i hike."),
    {span:"i",reason:"这里的人称代词要大写",hint:"改成 I",replacement:"I",category:"capitalization",severity:"error",source:"issue"}
  ],
});
assert(pronounReminder.length===1&&pronounReminder[0].category==="pronoun_case","standalone first-person i must remain a deterministic learner-facing reminder");
assert(pronounReminder[0].severity==="warning"&&!pronounReminder[0].blocking,"pronoun capitalization should be visible but non-blocking");

const verifiedSpelling=feedbackContract.normalizeSentenceDiagnostics({
  sentence:"I often climb montain with her",
  issues:[{span:"montain",reason:"montain 拼写错误",hint:"改正拼写",replacement:"mountain",category:"spelling",severity:"error",source:"issue"}],
  spellingVerifier:()=>({verified:true,reason:"test-lexicon"}),
});
assert(verifiedSpelling.length===1&&verifiedSpelling[0].severity==="error"&&verifiedSpelling[0].blocking,"locally verified spelling mistakes must be red blocking errors");
assert(verifiedSpelling[0].replacement==="mountain","spelling diagnostic must keep its own minimal replacement instead of adopting a full-suggestion inflection");

const unverifiedSpelling=feedbackContract.normalizeSentenceDiagnostics({
  sentence:"I met Zyphora today",
  issues:[{span:"Zyphora",reason:"可能拼写错误",hint:"检查拼写",replacement:"Zephora",category:"spelling",severity:"error",source:"issue"}],
  spellingVerifier:()=>({verified:false,reason:"not-in-local-evidence"}),
});
assert(unverifiedSpelling.length===0,"unverified spelling claims must not create noisy learner-facing diagnostics");

const grammar=feedbackContract.normalizeSentenceDiagnostics({
  sentence:"He go to school.",
  issues:[{span:"He go",reason:"第三人称单数主谓不一致",hint:"改为 He goes",replacement:"He goes",category:"grammar",severity:"error",source:"issue"}],
});
assert(grammar.length===1&&grammar[0].blocking&&grammar[0].severity==="error","clear grammar errors must remain blocking");

const targetUsage=feedbackContract.normalizeSentenceDiagnostics({
  sentence:"I dependabled on him.",
  targetWord:"dependable",
  issues:[{span:"dependabled",reason:"目标词词形错误",hint:"改为 dependable",replacement:"dependable",category:"spelling",severity:"error",source:"issue"}],
  spellingVerifier:()=>({verified:true,reason:"test-lexicon"}),
});
assert(targetUsage.length===1&&targetUsage[0].category==="target_usage"&&targetUsage[0].blocking,"corrections resolving directly to the learning word must be treated as target-word correctness");

const blockerSuppressesStyle=feedbackContract.normalizeSentenceDiagnostics({
  sentence:"He go home quickly.",
  issues:[
    {span:"He go",reason:"主谓不一致",hint:"改为 He goes",replacement:"He goes",category:"grammar",severity:"error",source:"issue"},
    {span:"quickly",reason:"这里也可以用 right away",hint:"可改为 right away",replacement:"right away",category:"style",severity:"suggestion",source:"issue"}
  ],
});
assert(blockerSuppressesStyle.length===1&&blockerSuppressesStyle[0].blocking,"when correctness blockers exist, Apply must not add style noise to the same review");

const blockerKeepsPronoun=feedbackContract.normalizeSentenceDiagnostics({
  sentence:"i go montain",
  issues:[
    ...feedbackContract.detectEnglishMechanics("i go montain"),
    {span:"go",reason:"这里需要第三人称形式",hint:"改为 goes",replacement:"goes",category:"grammar",severity:"error",source:"issue"},
    {span:"montain",reason:"拼写错误",hint:"改为 mountain",replacement:"mountain",category:"spelling",severity:"error",source:"issue"}
  ],
  spellingVerifier:()=>({verified:true,reason:"test-lexicon"}),
});
assert(blockerKeepsPronoun.length===3,"two blockers plus the deterministic pronoun reminder must stay visible in one stable review");
assert(blockerKeepsPronoun.some(issue=>issue.category==="pronoun_case"&&!issue.blocking),"a visible pronoun reminder must not be dropped just because blockers also exist");

const onlyStyle=feedbackContract.normalizeSentenceDiagnostics({
  sentence:"I finished quickly.",
  issues:[
    {span:"quickly",reason:"可以更口语化",hint:"可改为 fast",replacement:"fast",category:"style",severity:"suggestion",source:"issue"},
    {span:"finished",reason:"也可以用 wrapped up",hint:"可改为 wrapped up",replacement:"wrapped up",category:"style",severity:"suggestion",source:"issue"}
  ],
});
assert(onlyStyle.length===1&&!onlyStyle[0].blocking,"with no correctness error, Apply must surface at most one optional language suggestion");

assert(feedbackPolicy.applyDiagnosticPolicy({category:"capitalization",severity:"error"}).report===false,"capitalization must be silent in Apply");
assert(feedbackPolicy.applyDiagnosticPolicy({category:"pronoun_case",severity:"error"}).report===true&&feedbackPolicy.applyDiagnosticPolicy({category:"pronoun_case",severity:"error"}).blocking===false,"standalone pronoun case must be a visible non-blocking deterministic reminder");
assert(feedbackPolicy.applyDiagnosticPolicy({category:"spacing",severity:"error"}).report===false,"spacing must be silent in Apply");
assert(feedbackPolicy.applyDiagnosticPolicy({category:"spelling",severity:"error",evidence:{spellingVerified:true}}).blocking===true,"verified spelling must block");
assert(feedbackPolicy.applyDiagnosticPolicy({category:"spelling",severity:"error",evidence:{spellingVerified:false}}).report===false,"unverified spelling must not surface");
assert(feedbackPolicy.applyDiagnosticPolicy({category:"grammar",severity:"error"}).blocking===true,"grammar errors must block");
assert(feedbackPolicy.applyDiagnosticPolicy({category:"unknown",severity:"error"}).report===false,"unknown model categories must not surface");

const muchSentence="My sister is very reserved, and she is afraid to speak to much people";
const muchStart=muchSentence.indexOf("to much");
const muchIssue={
  id:"issue-1",span:"to much",start:muchStart,end:muchStart+"to much".length,
  category:"grammar",severity:"error",blocking:true,
};
const badAction=feedbackActions.normalizeActionCandidate(muchSentence,muchIssue,{
  issueId:"issue-1",start:muchStart,end:muchStart+"to much".length,before:"to much",replacement:"too many",
  resultSentence:muchSentence.slice(0,muchStart)+"too many"+muchSentence.slice(muchStart+"to much".length),
});
assert(badAction&&badAction.resultSentence.includes("speak too many people"),"structural action normalization alone must not pretend a grammatically unsafe candidate is valid");
assert(feedbackActions.finalizeVerifiedActions([badAction],[{issueId:"issue-1",valid:false}]).length===0,"a candidate rejected by independent post-edit validation must never become a one-click action");
const muchWordStart=muchSentence.indexOf("much");
const goodAction=feedbackActions.normalizeActionCandidate(muchSentence,muchIssue,{
  issueId:"issue-1",start:muchWordStart,end:muchWordStart+4,before:"much",replacement:"many",
  resultSentence:muchSentence.slice(0,muchWordStart)+"many"+muchSentence.slice(muchWordStart+4),
});
assert(goodAction&&goodAction.resultSentence.includes("speak to many people"),"a code action may safely edit a narrower subrange than the diagnostic span");
const verifiedGood=feedbackActions.finalizeVerifiedActions([goodAction],[{issueId:"issue-1",valid:true}]);
assert(verifiedGood.length===1&&verifiedGood[0].replacement==="many"&&verifiedGood[0].verified===true,"only independently verified safe edits may power one-click fixes");

const stableKeyA=stableFeedbackKey({schema:"v",model:"m",word:"Ride-or-die",meaningZh:"死党",sentence:"My friend and i hike."});
const stableKeyB=stableFeedbackKey({schema:"v",model:"m",word:"ride-or-die",meaningZh:"死党",sentence:"My friend and i hike."});
assert(stableKeyA===stableKeyB,"exact same Apply content must resolve to the same persistent review key across runs");

const evidence=feedbackEvidence.verifySpellingCorrection({
  span:"montain",
  replacement:"mountain",
  lookupWord:word=>word==="mountain",
});
assert(evidence.verified===true,"spelling verification must require an unknown source word and known replacement");
const distant=feedbackEvidence.verifySpellingCorrection({
  span:"table",
  replacement:"mountain",
  lookupWord:word=>word==="table"||word==="mountain",
});
assert(distant.verified===false,"known source words must never be treated as misspellings");

console.log("Apply Quality V3 contract checks passed.");