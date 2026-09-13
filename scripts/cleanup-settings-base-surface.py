from pathlib import Path

app_path=Path("public/app.js")
app=app_path.read_text(encoding="utf-8")

runtime_line='    const runtime=codex?.runtimeTest||{};\n'
if app.count(runtime_line)!=1:
    raise SystemExit(f"runtime state line count was {app.count(runtime_line)}")
app=app.replace(runtime_line,"",1)

pill_start='''    const runtimePill =\n      runtime.status==="passed"'''
pill_end='''\n\n    return shell('''
if app.count(pill_start)!=1 or app.count(pill_end)<1:
    raise SystemExit("runtime pill anchors are not unique")
start=app.index(pill_start)
end=app.index(pill_end,start)
app=app[:start]+app[end+2:]

ai_start='''        <div class=\"setting-row\" style=\"align-items:flex-start\">\n          <div style=\"min-width:310px;flex:1\">\n            <h3>AI 服务</h3>'''
model_start='''        <div class=\"setting-row\" style=\"align-items:flex-start\">\n          <div style=\"min-width:260px\">\n            <h3>模型与思考强度</h3>'''
if app.count(ai_start)!=1 or app.count(model_start)!=1:
    raise SystemExit("AI/model settings anchors are not unique")
ai_i=app.index(ai_start)
model_i=app.index(model_start,ai_i)
new_ai='''        <div class=\"setting-row\" style=\"align-items:flex-start\">\n          <div style=\"min-width:310px;flex:1\">\n            <h3>AI 辅助</h3>\n            <p>用于造句反馈、联想场景和图片生成。</p>\n          </div>\n          <div class=\"setting-actions-inline\">\n            <span class=\"pill ${codex?.cliAvailable?\"green\":\"red\"}\">${codex?.cliAvailable?\"已连接\":\"未连接\"}</span>\n            ${codex?.cliAvailable?\"\":`<button class=\"btn\" data-action=\"test-codex-text\">重新连接</button>`}\n          </div>\n        </div>\n\n'''
app=app[:ai_i]+new_ai+app[model_i:]
app=app.replace('<h3>模型与思考强度</h3>','<h3>AI 高级配置</h3>',1)

image_title='<h3>图片生成</h3>'
if app.count(image_title)!=1:
    raise SystemExit(f"image settings row title count was {app.count(image_title)}")
title_i=app.index(image_title)
row_i=app.rfind('        <div class="setting-row',0,title_i)
if row_i<0:
    raise SystemExit("image settings row start not found")
next_row=app.find('        <div class="setting-row',title_i+len(image_title))
if next_row<0:
    raise SystemExit("image settings row end not found")
app=app[:row_i]+app[next_row:]

for retired in [
    '<h3>AI 服务</h3>',
    '<h3>模型与思考强度</h3>',
    '<h3>图片生成</h3>',
    'advanced-diagnostics',
    'runtimePill',
    'const runtime=codex?.runtimeTest',
]:
    if retired in app:
        raise SystemExit(f"retired Settings base surface remains: {retired}")
for required in [
    '<h3>AI 辅助</h3>',
    '用于造句反馈、联想场景和图片生成。',
    '<h3>AI 高级配置</h3>',
    'data-action="save-codex-runtime"',
    'data-action="test-codex-text"',
    '<h3>词典增强</h3>',
]:
    if required not in app:
        raise SystemExit(f"current Settings base surface missing: {required}")
app_path.write_text(app,encoding="utf-8")

check_path=Path("scripts/check-runtime-authority-v3.js")
check=check_path.read_text(encoding="utf-8")
anchor='assert(app.includes("基础查词可离线使用。连接在线词典后，可补充真人发音和更多例句。"),"app.js base Settings copy must describe local-first dictionary behavior");'
addition='''\nfor(const retiredSettingsSurface of ["<h3>AI 服务</h3>","<h3>模型与思考强度</h3>","<h3>图片生成</h3>","advanced-diagnostics"]){\n  assert(!app.includes(retiredSettingsSurface),`app.js base Settings surface must not retain a runtime-removed legacy block: ${retiredSettingsSurface}`);\n}\nassert(app.includes("<h3>AI 辅助</h3>")&&app.includes("<h3>AI 高级配置</h3>"),"app.js base Settings surface must match the current product labels");'''
if check.count(anchor)!=1:
    raise SystemExit("dictionary base copy contract anchor not uniquely found")
if "runtime-removed legacy block" not in check:
    check=check.replace(anchor,anchor+addition,1)
check_path.write_text(check,encoding="utf-8")
