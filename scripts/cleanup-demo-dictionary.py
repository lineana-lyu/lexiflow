from pathlib import Path

app_path=Path("public/app.js")
app=app_path.read_text(encoding="utf-8")
start='  const DICTIONARY = {'
end='  const state = {'
if app.count(start)!=1 or app.count(end)!=1:
    raise SystemExit("demo dictionary cleanup anchors are not unique")
start_i=app.index(start)
end_i=app.index(end,start_i)
app=app[:start_i]+app[end_i:]

if "const DICTIONARY" in app:
    raise SystemExit("front-end demo DICTIONARY declaration remains")
for required in [
    'api("/api/dictionary/lookup"',
    'api("/api/dictionary/pronunciation"',
    'window.LexiFlowStudyRenderer=Object.freeze',
    'const libraryImageFile=document.getElementById("library-image-file")',
]:
    if required not in app:
        raise SystemExit(f"required stable capability missing: {required}")
app_path.write_text(app,encoding="utf-8")

check_path=Path("scripts/check-runtime-authority-v3.js")
check=check_path.read_text(encoding="utf-8")
anchor='assert(!app.includes("buildDailyPlan"),"app.js must not construct Today membership; frozen DailyPlan is owned by V3");'
addition='''\nassert(!app.includes("const DICTIONARY ="),"app.js must not carry the retired in-memory demo dictionary");\nassert(app.includes('api("/api/dictionary/lookup"'),"front-end lookup must use the dictionary service boundary");'''
if check.count(anchor)!=1:
    raise SystemExit("runtime authority anchor not uniquely found")
if "retired in-memory demo dictionary" not in check:
    check=check.replace(anchor,anchor+addition,1)
check_path.write_text(check,encoding="utf-8")
