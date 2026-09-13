from pathlib import Path

app_path=Path("public/app.js")
app=app_path.read_text(encoding="utf-8")

replacements={
'''            <h3>英语词典</h3>\n            <p>Merriam-Webster Learner's Dictionary · ${dict?.configured?`已连接 ${escapeHtml(dict.maskedKey||"")}`:"未连接"}</p>''':
'''            <h3>词典增强</h3>\n            <p>基础查词可离线使用。连接在线词典后，可补充真人发音和更多例句。</p>''',
'''placeholder="粘贴 Dictionary API Key（仅本机）"''':'''placeholder="输入词典服务密钥（仅本机，可选）"''',
'''toast("请输入 Learner's Dictionary API Key")''':'''toast("请输入词典服务密钥")''',
'''toast("词典 Key 已保存")''':'''toast("词典增强配置已保存")''',
'''toast(payload.message||"词典 Key 可用")''':'''toast(payload.message||"在线词典增强可用")''',
'''showErrorNotice(err,"词典连接没有成功")''':'''showErrorNotice(err,"在线词典增强连接没有成功")''',
}
for old,new in replacements.items():
    if app.count(old)!=1:
        raise SystemExit(f"dictionary surface copy anchor count was {app.count(old)}: {old[:60]}")
    app=app.replace(old,new,1)

for retired in ["Merriam-Webster Learner's Dictionary","Learner's Dictionary API Key","词典 Key 已保存","词典 Key 可用"]:
    if retired in app:
        raise SystemExit(f"retired dictionary surface copy remains: {retired}")
for required in [
    "基础查词可离线使用。连接在线词典后，可补充真人发音和更多例句。",
    "输入词典服务密钥（仅本机，可选）",
    'api("/api/dictionary/lookup"',
    'api("/api/settings/dictionary"',
]:
    if required not in app:
        raise SystemExit(f"current dictionary surface contract missing: {required}")
app_path.write_text(app,encoding="utf-8")

check_path=Path("scripts/check-runtime-authority-v3.js")
check=check_path.read_text(encoding="utf-8")
anchor='assert(!app.includes("const DICTIONARY ="),"app.js must not carry the retired in-memory demo dictionary");'
addition='''\nassert(!app.includes("Merriam-Webster Learner's Dictionary"),"app.js base Settings surface must not present the optional online fallback as the primary dictionary");\nassert(app.includes("基础查词可离线使用。连接在线词典后，可补充真人发音和更多例句。"),"app.js base Settings copy must describe local-first dictionary behavior");'''
if check.count(anchor)!=1:
    raise SystemExit("demo dictionary contract anchor not uniquely found")
if "optional online fallback as the primary dictionary" not in check:
    check=check.replace(anchor,anchor+addition,1)
check_path.write_text(check,encoding="utf-8")
