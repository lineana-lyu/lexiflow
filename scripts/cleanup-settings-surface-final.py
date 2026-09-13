from pathlib import Path

app_path=Path("public/app.js")
app=app_path.read_text(encoding="utf-8")
old='''            <h3>本地自然发音</h3>
            <p>Kokoro-82M 本地语音 · 真人词典/Wikimedia 发音仍优先。首次使用会自动下载模型，完成后可离线使用，不需要 Python 或 Windows 系统音色。</p>
            ${tts.status==="downloading"?`<p>模型下载中${Number.isFinite(Number(tts.progress))?` · ${Math.round(Number(tts.progress))}%`:""}</p>`:tts.status==="error"?`<p>最近错误：${escapeHtml(tts.error||"模型没有准备完成")}</p>`:""}'''
new='''            <h3>自然发音</h3>
            <p>优先播放真人词典发音；没有真人音频时，使用你选择的自然合成音。首次准备完成后可离线使用。</p>'''
if app.count(old)!=1:
    raise SystemExit(f"voice source block count was {app.count(old)}")
app=app.replace(old,new,1)
for retired in ["<h3>本地自然发音</h3>","Kokoro-82M 本地语音","模型下载中","最近错误："]:
    if retired in app:
        raise SystemExit(f"retired voice source copy remains: {retired}")
for required in [
    "<h3>自然发音</h3>",
    "优先播放真人词典发音；没有真人音频时，使用你选择的自然合成音。首次准备完成后可离线使用。",
    'data-action="prepare-kokoro-tts"',
    'id="tts-voice"',
]:
    if required not in app:
        raise SystemExit(f"voice capability missing after source alignment: {required}")
app_path.write_text(app,encoding="utf-8")

surface_path=Path("public/settings-surface.js")
surface=surface_path.read_text(encoding="utf-8")

# Remove helpers/functions used only by the old Voice text decorator.
set_text='  function setText(node,value){ if(node && node.textContent !== value) node.textContent = value; }\n'
first_desc='  function firstDescription(row){ return row?.querySelector("div > p") || row?.querySelector("p") || null; }\n\n'
for snippet,label in [(set_text,"setText"),(first_desc,"firstDescription")]:
    if surface.count(snippet)!=1:
        raise SystemExit(f"{label} helper count was {surface.count(snippet)}")
    surface=surface.replace(snippet,"",1)

start='  function simplifyVoice(){'
end='  function buildAdvancedSection(){'
if surface.count(start)!=1 or surface.count(end)!=1:
    raise SystemExit("simplifyVoice/buildAdvancedSection anchors are not unique")
a=surface.index(start); b=surface.index(end,a)
surface=surface[:a]+surface[b:]

old_advanced='''    const modelRow = rowByTitle("模型与思考强度") || rowByTitle("AI 高级配置");
    const imageRow = rowByTitle("图片生成");
    imageRow?.remove();
    if(!modelRow) return;

    setText(modelRow.querySelector("h3"),"AI 高级配置");'''
new_advanced='''    const modelRow = rowByTitle("AI 高级配置");
    if(!modelRow) return;'''
if surface.count(old_advanced)!=1:
    raise SystemExit(f"legacy advanced compatibility block count was {surface.count(old_advanced)}")
surface=surface.replace(old_advanced,new_advanced,1)

call='    simplifyVoice();\n'
if surface.count(call)!=1:
    raise SystemExit(f"simplifyVoice call count was {surface.count(call)}")
surface=surface.replace(call,"",1)

for retired in ["simplifyVoice","firstDescription","setText(","本地自然发音","模型与思考强度","图片生成"]:
    if retired in surface:
        raise SystemExit(f"retired Settings compatibility remains: {retired}")
for required in ["buildAdvancedSection","rowByTitle(\"AI 高级配置\")","MutationObserver","data-settings-advanced"]:
    if required not in surface:
        raise SystemExit(f"active advanced Settings behavior missing: {required}")
surface_path.write_text(surface,encoding="utf-8")

check_path=Path("scripts/check-runtime-authority-v3.js")
check=check_path.read_text(encoding="utf-8")
anchor='assert(app.includes("连接信息只保存在当前设备")&&app.includes("settings-security-icon"),"Settings base surface must own the final credential privacy banner markup");'
addition='''\nassert(app.includes("<h3>自然发音</h3>")&&app.includes("优先播放真人词典发音；没有真人音频时，使用你选择的自然合成音。首次准备完成后可离线使用。"),"app.js must own final Voice Settings copy");\nconst settingsSurface=read("public/settings-surface.js");\nfor(const retiredSettingsCompat of ["simplifyVoice","本地自然发音","模型与思考强度","图片生成"]){\n  assert(!settingsSurface.includes(retiredSettingsCompat),`settings-surface must not retain obsolete source-compatibility logic: ${retiredSettingsCompat}`);\n}\nassert(settingsSurface.includes("buildAdvancedSection")&&settingsSurface.includes('rowByTitle("AI 高级配置")'),"settings-surface must retain only the active Advanced Settings layout behavior");'''
if check.count(anchor)!=1:
    raise SystemExit("security banner contract anchor not uniquely found")
if "app.js must own final Voice Settings copy" not in check:
    check=check.replace(anchor,anchor+addition,1)
check_path.write_text(check,encoding="utf-8")
