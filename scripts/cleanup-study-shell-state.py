from pathlib import Path
import re

app_path=Path("public/app.js")
text=app_path.read_text(encoding="utf-8")

# The V3 Study Session owns all stage-local session state. app.js only needs
# the exact card identity used by the narrow LexiFlowStudyRenderer bridge.
pattern=re.compile(r'''    state\.study=\{\n(?:.*\n)*?    \};\n    state\.route="study";''')
matches=list(pattern.finditer(text))
if len(matches)!=1:
    raise SystemExit(f"state.study initializer: expected one match, got {len(matches)}")
replacement='''    state.study={cardId:card.id};
    state.route="study";'''
text=pattern.sub(replacement,text,count=1)

old='''      return {
        key:`study:${card.id}:${card.stage}`,
        cardId:card.id,
        order:stageIndex(card.stage)
      };'''
new='''      const canonical=window.LexiFlowLearningCore?.canonicalStage?.(card)||String(card.stage||"");
      const stages=window.LexiFlowStudyStageSurfaceV3?.stages||[];
      return {
        key:`study:${card.id}:${canonical}`,
        cardId:card.id,
        order:Math.max(0,stages.indexOf(canonical))
      };'''
if text.count(old)!=1:
    raise SystemExit(f"study motion legacy stageIndex block count was {text.count(old)}")
text=text.replace(old,new,1)

if "stageIndex(" in text:
    raise SystemExit("legacy stageIndex reference remains")
if "state.study={cardId:card.id};" not in text:
    raise SystemExit("narrow StudyRenderer state not installed")
for legacy in [
    "revealed:false",
    "applyText:card.userSentence",
    "originalApplyText:",
    "applyApproved:false",
    "visualSceneLoading:false",
    "practicePromptLoading:false",
]:
    if legacy in text:
        raise SystemExit(f"legacy app-owned study session field remains: {legacy}")
for required in [
    "window.LexiFlowStudyStageSurfaceV3?.stages",
    "window.LexiFlowLearningCore?.canonicalStage?.(card)",
    "window.LexiFlowStudyRenderer=Object.freeze",
    "data-study-stage-host-v3",
]:
    if required not in text:
        raise SystemExit(f"required V3 Study shell contract missing: {required}")

app_path.write_text(text,encoding="utf-8")

check_path=Path("scripts/check-runtime-authority-v3.js")
check=check_path.read_text(encoding="utf-8")
anchor='assert(!app.includes("return stageSelect(card)")&&!app.includes("return stageVisual(card)")&&!app.includes("return stageApply(card)"),"app.js must not dispatch into retired stage renderers");'
addition='''
assert(app.includes("state.study={cardId:card.id};"),"app.js Study bridge state must contain only the exact card identity");
assert(!app.includes("stageIndex("),"app.js must not retain or call a legacy stage-order helper");
assert(app.includes("window.LexiFlowStudyStageSurfaceV3?.stages"),"Study shell motion ordering must reuse the V3 stage surface authority");'''
if check.count(anchor)!=1:
    raise SystemExit("runtime authority dispatch anchor not uniquely found")
if "Study bridge state must contain only the exact card identity" not in check:
    check=check.replace(anchor,anchor+addition,1)
check_path.write_text(check,encoding="utf-8")
