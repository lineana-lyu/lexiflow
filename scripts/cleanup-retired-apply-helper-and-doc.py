from pathlib import Path

app_path=Path("public/app.js")
app=app_path.read_text(encoding="utf-8")
start_marker="  function localFeedback(text,word){"
end_marker="  function reviewPage(){"
if app.count(start_marker)!=1 or app.count(end_marker)!=1:
    raise SystemExit("localFeedback/reviewPage cleanup anchors are not unique")
start=app.index(start_marker)
end=app.index(end_marker,start)
app=app[:start]+app[end:]
if "function localFeedback(" in app:
    raise SystemExit("localFeedback declaration remains")
app_path.write_text(app,encoding="utf-8")

check_path=Path("scripts/check-runtime-authority-v3.js")
check=check_path.read_text(encoding="utf-8")
old='["stageKicker","stageTop","stageSelect","ensureVisualSceneSuggestion","ensurePracticePrompt","stageVisual","stageApply"]'
new='["stageKicker","stageTop","stageSelect","ensureVisualSceneSuggestion","ensurePracticePrompt","stageVisual","stageApply","localFeedback"]'
if check.count(old)!=1:
    raise SystemExit(f"retired stage body list count was {check.count(old)}")
check=check.replace(old,new,1)
check_path.write_text(check,encoding="utf-8")

doc_path=Path("docs/RUNTIME_AUTHORITY_V3.md")
doc=doc_path.read_text(encoding="utf-8")
replacements={
'''Dormant historical `app.js` callers for `/api/ai/visual-scene` and `/api/ai/practice-prompt` are now deliberately failed closed with `LEGACY_STAGE_AI_BLOCKED`. They must not be delegated into real AI work. This guarantees that rendering a retired stage body cannot spend an AI request, invent the learner's first Visualize association, or create an Apply prompt without an explicit learner action.''':
'''Historical `app.js` callers for `/api/ai/visual-scene` and `/api/ai/practice-prompt`, together with their retired stage bodies and event handlers, have been physically removed. `LEGACY_STAGE_AI_BLOCKED` remains at the runtime compatibility boundary as defense-in-depth: any future direct reintroduction of those retired transport calls must fail closed instead of reaching real AI work.''',
'''Historical automatic Visualize AI calls in `app.js` are dormant technical debt and are blocked at the runtime compatibility boundary. They are not permitted to reach AI Assist V3.''':
'''Historical automatic Visualize AI calls and their `app.js` render/event paths have been physically removed. The runtime compatibility block remains a fail-closed regression guard; only explicit V3 Visualize actions may reach AI Assist V3.''',
'''Historical automatic Apply prompt calls in `app.js` are likewise blocked and cannot reach real AI. The V3 renderer must initiate prompt refresh explicitly.''':
'''Historical automatic Apply prompt calls and their `app.js` render/event paths have been physically removed. The V3 renderer must initiate prompt refresh explicitly, while the compatibility block remains a fail-closed regression guard.''',
}
for old_text,new_text in replacements.items():
    if doc.count(old_text)!=1:
        raise SystemExit(f"runtime authority wording anchor count was {doc.count(old_text)}")
    doc=doc.replace(old_text,new_text,1)
doc_path.write_text(doc,encoding="utf-8")
