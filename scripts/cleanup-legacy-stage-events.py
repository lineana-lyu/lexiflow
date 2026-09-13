from pathlib import Path
import re

app_path = Path("public/app.js")
text = app_path.read_text(encoding="utf-8")


def block_end(source: str, brace: int) -> int:
    depth = 0
    state = "normal"
    escape = False
    i = brace
    while i < len(source):
        ch = source[i]
        nxt = source[i + 1] if i + 1 < len(source) else ""
        if state == "line_comment":
            if ch == "\n":
                state = "normal"
        elif state == "block_comment":
            if ch == "*" and nxt == "/":
                state = "normal"
                i += 1
        elif state in ("single", "double", "template"):
            quote = {"single": "'", "double": '"', "template": "`"}[state]
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == quote:
                state = "normal"
        else:
            if ch == "/" and nxt == "/":
                state = "line_comment"
                i += 1
            elif ch == "/" and nxt == "*":
                state = "block_comment"
                i += 1
            elif ch == "'":
                state = "single"
            elif ch == '"':
                state = "double"
            elif ch == "`":
                state = "template"
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return i + 1
        i += 1
    raise SystemExit("unterminated JavaScript block")


def remove_action(source: str, name: str) -> str:
    pattern = re.compile(rf'^\s*if\(action={{2,3}}"{re.escape(name)}"\)\{{', re.M)
    hits = list(pattern.finditer(source))
    if len(hits) != 1:
        raise SystemExit(f"action {name}: expected exactly one branch, got {len(hits)}")
    hit = hits[0]
    line_start = source.rfind("\n", 0, hit.start()) + 1
    brace = source.find("{", hit.start(), hit.end() + 1)
    end = block_end(source, brace)
    while end < len(source) and source[end] in " \t":
        end += 1
    if end < len(source) and source[end] == "\n":
        end += 1
    return source[:line_start] + source[end:]


def remove_range(source: str, start_marker: str, end_marker: str, label: str) -> str:
    if source.count(start_marker) != 1 or source.count(end_marker) != 1:
        raise SystemExit(f"{label}: anchors not unique")
    start = source.index(start_marker)
    start = source.rfind("\n", 0, start) + 1
    end = source.index(end_marker, start)
    if end <= start:
        raise SystemExit(f"{label}: invalid anchor order")
    return source[:start] + source[end:]


def remove_function(source: str, name: str) -> str:
    pattern = re.compile(rf'(?<![A-Za-z0-9_$])(?:(async)\s+)?function\s+{re.escape(name)}\(')
    hits = list(pattern.finditer(source))
    if len(hits) != 1:
        raise SystemExit(f"{name}: expected exactly one declaration, got {len(hits)}")
    hit = hits[0]
    start = source.rfind("\n", 0, hit.start()) + 1
    brace = source.find("{", hit.end())
    end = block_end(source, brace)
    while end < len(source) and source[end] in " \t":
        end += 1
    if end < len(source) and source[end] == "\n":
        end += 1
    if end < len(source) and source[end] == "\n":
        end += 1
    return source[:start] + source[end:]


# These listeners belonged to app.js's retired stage renderer. V3 renderers bind
# their own controls after the generic app shell mounts.
text = remove_range(
    text,
    '    document.querySelectorAll(".visual-memory-image")',
    '    const applyText=document.getElementById("apply-text");',
    "legacy visual image listener",
)
text = remove_range(
    text,
    '    const applyText=document.getElementById("apply-text");',
    '    const visualNote=document.getElementById("visual-note");',
    "legacy Apply DOM listener",
)
text = remove_range(
    text,
    '    const visualNote=document.getElementById("visual-note");',
    '    const visualFile=document.getElementById("visual-file");',
    "legacy Visualize note listener",
)
text = remove_range(
    text,
    '    const visualFile=document.getElementById("visual-file");',
    '    document.querySelectorAll("[data-delete-card]")',
    "legacy Visualize upload listener",
)

retired_actions = [
    "complete-stage",
    "toggle-visual-scene",
    "generate-visual",
    "finish-visual",
    "submit-apply",
    "adopt-ai-sentence",
    "edit-apply",
    "refresh-visual-scene",
    "refresh-practice-prompt",
    "restore-original-apply",
    "pass-apply",
]
for action in retired_actions:
    text = remove_action(text, action)

for helper in [
    "stopVisualProgress",
    "visualProgressMeta",
    "startVisualProgress",
    "visualSceneNeedsRefresh",
]:
    text = remove_function(text, helper)

timer_decl = "const visualProgressTimers=new Map();\n\n"
if text.count(timer_decl) != 1:
    raise SystemExit(f"visualProgressTimers declaration count was {text.count(timer_decl)}")
text = text.replace(timer_decl, "", 1)

if text.count("    visualSceneExpanded: false\n") == 1:
    text = text.replace("    visualSceneExpanded: false\n", "", 1)
elif text.count("    visualSceneExpanded: false,\n") == 1:
    text = text.replace("    visualSceneExpanded: false,\n", "", 1)
else:
    raise SystemExit("visualSceneExpanded state field not uniquely found")

for forbidden in [
    "ensureVisualSceneSuggestion(",
    "ensurePracticePrompt(",
    'document.getElementById("visual-file")',
    "state.visualSceneExpanded",
    "visualProgressTimers",
]:
    if forbidden in text:
        raise SystemExit(f"retired stage event residue remains: {forbidden}")

# Stable Word Library image editing shares image transport with Visualize and
# must survive this cleanup.
for required in [
    "data-study-stepper-v3-host",
    "data-study-stage-host-v3",
    "window.LexiFlowStudyRenderer=Object.freeze",
    'const libraryImageFile=document.getElementById("library-image-file")',
    'if(action==="regenerate-library-image")',
    'api("/api/ai/image"',
]:
    if required not in text:
        raise SystemExit(f"required stable/V3 capability missing: {required}")

app_path.write_text(text, encoding="utf-8")

check_path = Path("scripts/check-runtime-authority-v3.js")
check = check_path.read_text(encoding="utf-8")
anchor = '''for(const retiredBody of ["stageKicker","stageTop","stageSelect","ensureVisualSceneSuggestion","ensurePracticePrompt","stageVisual","stageApply"]){
  assert(!app.includes(`function ${retiredBody}(`)&&!app.includes(`async function ${retiredBody}(`),`retired stage body must be physically removed from app.js: ${retiredBody}`);
}'''
addition = '''
for(const retiredAction of ["complete-stage","toggle-visual-scene","generate-visual","finish-visual","submit-apply","adopt-ai-sentence","edit-apply","refresh-visual-scene","refresh-practice-prompt","restore-original-apply","pass-apply"]){
  assert(!app.includes(`if(action===\\"${retiredAction}\\")`)&&!app.includes(`if(action==\\"${retiredAction}\\")`),`retired stage action must be removed from app.js: ${retiredAction}`);
}
for(const retiredHook of ["visualProgressTimers","document.getElementById(\\"visual-file\\")","state.visualSceneExpanded"]){
  assert(!app.includes(retiredHook),`retired stage event hook must be removed from app.js: ${retiredHook}`);
}
assert(app.includes('const libraryImageFile=document.getElementById("library-image-file")'),"Word Library image upload must survive stage cleanup");
assert(app.includes('if(action==="regenerate-library-image")'),"Word Library image regeneration must survive stage cleanup");
assert(app.includes('api("/api/ai/image"'),"Word Library image generation transport must survive stage cleanup");'''
if check.count(anchor) != 1:
    raise SystemExit("retired body contract block not uniquely found")
check = check.replace(anchor, anchor + addition, 1)
check_path.write_text(check, encoding="utf-8")
