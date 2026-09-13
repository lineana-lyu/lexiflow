from pathlib import Path

app_path=Path("public/app.js")
app=app_path.read_text(encoding="utf-8")
old='<div class="settings-security-banner" style="font-size:12px">服务凭据只保存在当前设备。</div>'
new='<div class="settings-security-banner"><span class="settings-security-icon">⌁</span><div><strong>连接信息只保存在当前设备</strong><span>用于词典和 AI 服务，不会显示在学习内容中。</span></div></div>'
if app.count(old)!=1:
    raise SystemExit(f"base security banner count was {app.count(old)}")
app=app.replace(old,new,1)
for required in ["连接信息只保存在当前设备","用于词典和 AI 服务，不会显示在学习内容中。","settings-security-icon"]:
    if required not in app:
        raise SystemExit(f"final security banner contract missing: {required}")
app_path.write_text(app,encoding="utf-8")

ux_path=Path("public/product-ux.js")
ux=ux_path.read_text(encoding="utf-8")
start='  function decorateSecurityBanner() {'
end='  function decorateDailyGoal(list) {'
if ux.count(start)!=1 or ux.count(end)!=1:
    raise SystemExit("security banner decorator anchors are not unique")
a=ux.index(start); b=ux.index(end,a)
ux=ux[:a]+ux[b:]
call='    decorateSecurityBanner();\n'
if ux.count(call)!=1:
    raise SystemExit(f"decorateSecurityBanner call count was {ux.count(call)}")
ux=ux.replace(call,"",1)
if "decorateSecurityBanner" in ux:
    raise SystemExit("security banner decorator remains")
for required in ["decorateDailyGoal","applyAppIcon","decorateSpeakers","openImageWorkspaceFromJob"]:
    if required not in ux:
        raise SystemExit(f"required product-ux capability missing: {required}")
ux_path.write_text(ux,encoding="utf-8")

check_path=Path("scripts/check-runtime-authority-v3.js")
check=check_path.read_text(encoding="utf-8")
anchor='assert(productUx.includes("decorateDailyGoal")&&productUx.includes("decorateSecurityBanner"),"product-ux must retain active Settings enhancements");'
replacement='''assert(productUx.includes("decorateDailyGoal"),"product-ux must retain the active daily-goal enhancement");
assert(!productUx.includes("decorateSecurityBanner"),"product-ux must not re-decorate the Settings security banner once app.js owns final markup");
assert(app.includes("连接信息只保存在当前设备")&&app.includes("settings-security-icon"),"app.js must own the final Settings security banner markup");'''
if check.count(anchor)!=1:
    raise SystemExit("product-ux active Settings contract anchor not uniquely found")
check=check.replace(anchor,replacement,1)
check_path.write_text(check,encoding="utf-8")
