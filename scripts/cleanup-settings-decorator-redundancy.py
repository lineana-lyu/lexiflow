from pathlib import Path

app_path=Path("public/app.js")
app=app_path.read_text(encoding="utf-8")

old_header='''      header(\n        "",\n        "设置",\n        "",\n        `<button class="btn" data-action="refresh-provider">刷新状态</button>`\n      )\n      + `<div class="settings-security-banner">🔒 API Key 仅保存在本机 settings.json；Windows 桌面版使用系统加密，仓库不会包含该文件。</div><div class="settings-list">'''
new_header='''      header("","设置","")\n      + `<div class="settings-security-banner" style="font-size:12px">服务凭据只保存在当前设备。</div><div class="settings-list">'''
if app.count(old_header)!=1:
    raise SystemExit(f"settings header anchor count was {app.count(old_header)}")
app=app.replace(old_header,new_header,1)

replacements={
    'placeholder="输入词典服务密钥（仅本机，可选）"':'placeholder="输入词典服务密钥"',
    '<button class="btn" data-action="test-dictionary">检查连接</button>':'<button class="btn" data-action="test-dictionary">验证</button>',
    '<div class="setting-row"><div><h3>导出学习数据</h3><p></p></div><button class="btn" data-action="export-data">导出 JSON</button></div>':'<div class="setting-row"><div><h3>导出学习数据</h3><p>备份单词卡、学习进度和复习记录。</p></div><button class="btn" data-action="export-data">导出 JSON</button></div>',
    '<div class="setting-row"><div><h3>导入学习数据</h3><p></p></div><label class="btn">选择 JSON<input id="import-file" type="file" accept="application/json" style="display:none"></label></div>':'<div class="setting-row"><div><h3>导入学习数据</h3><p>从此前导出的备份恢复学习数据。</p></div><label class="btn">选择 JSON<input id="import-file" type="file" accept="application/json" style="display:none"></label></div>',
}
for old,new in replacements.items():
    if app.count(old)!=1:
        raise SystemExit(f"app Settings copy anchor count was {app.count(old)}: {old[:50]}")
    app=app.replace(old,new,1)

refresh_branch='''    if(action==="refresh-provider"){refreshProviderStatus(false);return;}\n'''
if app.count(refresh_branch)!=1:
    raise SystemExit(f"refresh-provider action count was {app.count(refresh_branch)}")
app=app.replace(refresh_branch,"",1)

for retired in [
    'data-action="refresh-provider"',
    'API Key 仅保存在本机 settings.json',
    '>检查连接</button>',
]:
    if retired in app:
        raise SystemExit(f"retired Settings source residue remains: {retired}")
app_path.write_text(app,encoding="utf-8")

surface_path=Path("public/settings-surface.js")
surface=surface_path.read_text(encoding="utf-8")

def remove_function(source,name,next_name):
    start=f"  function {name}("
    end=f"  function {next_name}("
    if source.count(start)!=1 or source.count(end)!=1:
        raise SystemExit(f"settings-surface function anchors invalid: {name} -> {next_name}")
    a=source.index(start)
    b=source.index(end,a)
    return source[:a]+source[b:]

# Base app.js now owns these final product labels/copy. Keep only decorators that
# materially change layout or hide additional voice-detail rows.
surface=remove_function(surface,"simplifyHeader","simplifyDictionary")
surface=remove_function(surface,"simplifyDictionary","simplifyAi")
surface=remove_function(surface,"simplifyAi","simplifyVoice")
surface=remove_function(surface,"polishDataLabels","enhance")

for call in [
    "    simplifyHeader(root);\n",
    "    simplifyDictionary();\n",
    "    simplifyAi();\n",
    "    polishDataLabels();\n",
]:
    if surface.count(call)!=1:
        raise SystemExit(f"decorator call count was {surface.count(call)}: {call.strip()}")
    surface=surface.replace(call,"",1)

# No longer needed after dictionary/header decorators were removed.
set_attr='  function setAttr(node,name,value){ if(node && node.getAttribute(name) !== value) node.setAttribute(name,value); }\n'
if surface.count(set_attr)!=1:
    raise SystemExit("setAttr helper not uniquely found")
surface=surface.replace(set_attr,"",1)

for retired in ["simplifyHeader","simplifyDictionary","simplifyAi","polishDataLabels","setAttr("]:
    if retired in surface:
        raise SystemExit(f"redundant Settings decorator remains: {retired}")
for required in ["simplifyVoice","buildAdvancedSection","MutationObserver","AI 高级配置"]:
    if required not in surface:
        raise SystemExit(f"required Settings enhancement missing: {required}")
surface_path.write_text(surface,encoding="utf-8")

check_path=Path("scripts/check-runtime-authority-v3.js")
check=check_path.read_text(encoding="utf-8")
anchor='assert(app.includes("<h3>AI 辅助</h3>")&&app.includes("<h3>AI 高级配置</h3>"),"app.js base Settings surface must match the current product labels");'
addition='''\nassert(!app.includes('data-action="refresh-provider"'),"Settings base surface must not render the retired manual provider refresh control");\nassert(app.includes("服务凭据只保存在当前设备。"),"Settings base surface must own the final credential privacy copy");\nassert(app.includes("备份单词卡、学习进度和复习记录。")&&app.includes("从此前导出的备份恢复学习数据。"),"Settings base surface must own backup/restore descriptions");'''
if check.count(anchor)!=1:
    raise SystemExit("Settings base surface contract anchor not uniquely found")
if "retired manual provider refresh control" not in check:
    check=check.replace(anchor,anchor+addition,1)
check_path.write_text(check,encoding="utf-8")
