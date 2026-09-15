from pathlib import Path

quality_path=Path("public/apply-quality-v3.js")
quality=quality_path.read_text(encoding="utf-8")

line='''  const previousFetch=window.fetch.bind(window);\n'''
if quality.count(line)!=1:
    raise SystemExit(f"Apply Quality previousFetch declaration count was {quality.count(line)}")
quality=quality.replace(line,"",1)

start='''  function endpointOf(input){'''
end='''  function loadStore(){'''
if quality.count(start)!=1 or quality.count(end)!=1:
    raise SystemExit("Apply Quality transport-helper anchors are not unique")
a=quality.index(start); b=quality.index(end,a)
quality=quality[:a]+quality[b:]

wrapper_start='''  window.fetch=async function lexiFlowApplyQualityFetch(input,init={}){'''
wrapper_end='''  function auditForCurrent(){'''
if quality.count(wrapper_start)!=1 or quality.count(wrapper_end)!=1:
    raise SystemExit("Apply Quality fetch-wrapper anchors are not unique")
a=quality.index(wrapper_start); b=quality.index(wrapper_end,a)
bridge='''  window.LexiFlowApplyQualityV3=Object.freeze({
    processFeedback(payload,body){return progressiveFeedback(payload,body);},
  });

'''
quality=quality[:a]+bridge+quality[b:]

old_start='''    new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
    window.addEventListener("lexiflow:today-plan-data",schedule);'''
new_start='''    new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
    window.LexiFlowLearningDataGatewayV3?.registerAfterPersist?.(()=>schedule());
    window.addEventListener("lexiflow:today-plan-data",schedule);'''
if quality.count(old_start)!=1:
    raise SystemExit(f"Apply Quality start hook block count was {quality.count(old_start)}")
quality=quality.replace(old_start,new_start,1)

for retired in [
    "previousFetch",
    "lexiFlowApplyQualityFetch",
    "function endpointOf(",
    "function parseBody(",
    "function jsonResponse(",
    'endpoint==="/api/learning-data"',
    'endpoint!=="/api/ai/text"',
    "window.fetch=",
    "window.fetch =",
]:
    if retired in quality:
        raise SystemExit(f"retired Apply Quality transport interception remains: {retired}")
for required in [
    "LexiFlowApplyQualityV3=Object.freeze",
    "processFeedback(payload,body){return progressiveFeedback(payload,body);}",
    "function syncFromGateway()",
    "registerAfterPersist?.(()=>schedule())",
    "correctionHeldBack:true",
]:
    if required not in quality:
        raise SystemExit(f"Apply Quality explicit-bridge contract missing: {required}")
quality_path.write_text(quality,encoding="utf-8")

stage_path=Path("public/apply-stage-v3.js")
stage=stage_path.read_text(encoding="utf-8")
old='''      const payload=await response.json();const fb=payload.feedback||{};const suggestion=norm(fb.suggestion);const inputLanguage=fb.inputLanguage==="zh"||/[\\u3400-\\u9fff]/.test(text)?"zh":"en";'''
new='''      const rawPayload=await response.json();
      const payload=window.LexiFlowApplyQualityV3?.processFeedback?.(rawPayload,{word:card.word,meaningZh:card.meaningZh,sentence:text})||rawPayload;
      const fb=payload.feedback||{};const suggestion=norm(fb.suggestion);const inputLanguage=fb.inputLanguage==="zh"||/[\\u3400-\\u9fff]/.test(text)?"zh":"en";'''
if stage.count(old)!=1:
    raise SystemExit(f"Apply Stage AI response interpretation block count was {stage.count(old)}")
stage=stage.replace(old,new,1)
for required in [
    'fetch("/api/ai/text"',
    "LexiFlowApplyQualityV3?.processFeedback?.",
    "rawPayload",
]:
    if required not in stage:
        raise SystemExit(f"Apply Stage explicit quality bridge missing: {required}")
stage_path.write_text(stage,encoding="utf-8")

check_path=Path("scripts/check-apply-quality-v3.js")
check=check_path.read_text(encoding="utf-8")
read_anchor='''const quality=read("public/apply-quality-v3.js");'''
if check.count(read_anchor)!=1:
    raise SystemExit("Apply Quality check read anchor not unique")
if 'const applyStage=read("public/apply-stage-v3.js");' not in check:
    check=check.replace(read_anchor,read_anchor+'\nconst applyStage=read("public/apply-stage-v3.js");',1)
order_anchor='''assert(index.indexOf("apply-quality-v3.js")<index.indexOf("stage-transition-v3.js"),"Apply quality capture gate must register before authoritative stage completion");'''
order_add='''
assert(index.indexOf("apply-quality-v3.js")<index.indexOf("apply-stage-v3.js"),"Apply Quality bridge must load before Apply Stage consumes AI feedback");'''
if check.count(order_anchor)!=1:
    raise SystemExit("Apply Quality check order anchor not unique")
if "Apply Quality bridge must load before Apply Stage consumes AI feedback" not in check:
    check=check.replace(order_anchor,order_anchor+order_add,1)
contract_anchor='''assert(quality.includes("correctionHeldBack:true"),"early failed Apply rounds must hold back the full correction");'''
contract_add='''
assert(quality.includes("LexiFlowApplyQualityV3=Object.freeze")&&quality.includes("processFeedback(payload,body)"),"Apply Quality must expose a narrow explicit feedback-processing bridge");
assert(!quality.includes("window.fetch=")&&!quality.includes("window.fetch ="),"Apply Quality must not wrap global fetch after Apply Stage adopts the explicit bridge");
assert(!quality.includes("/api/learning-data"),"Apply Quality must use the Learning Data Gateway snapshot instead of observing learning-data transport");
assert(quality.includes("registerAfterPersist?.(()=>schedule())"),"Apply Quality must redraw from Gateway-confirmed persistence events");
assert(applyStage.includes('fetch("/api/ai/text"')&&applyStage.includes("LexiFlowApplyQualityV3?.processFeedback?."),"Apply Stage must own the AI request and explicitly pass its response through Apply Quality before interpretation");'''
if check.count(contract_anchor)!=1:
    raise SystemExit("Apply Quality explicit-bridge contract anchor not unique")
if "must expose a narrow explicit feedback-processing bridge" not in check:
    check=check.replace(contract_anchor,contract_anchor+contract_add,1)
check_path.write_text(check,encoding="utf-8")
