from pathlib import Path

app_path=Path("public/app.js")
app=app_path.read_text(encoding="utf-8")

title='<h3>AI 高级配置</h3>'
daily='''        <div class="setting-row">
          <div><h3>每日学习目标</h3><p></p></div>'''
if app.count(title)!=1 or app.count(daily)!=1:
    raise SystemExit("advanced settings source anchors are not unique")
title_i=app.index(title)
row_start=app.rfind('        <div class="setting-row"',0,title_i)
row_end=app.index(daily,title_i)
if row_start<0 or row_end<=row_start:
    raise SystemExit("advanced settings row bounds invalid")
row=app[row_start:row_end].rstrip()
old_style='<div class="setting-row" style="align-items:flex-start">'
new_style='<div class="setting-row" style="align-items:flex-start;border:0;border-top:1px solid var(--line-soft);border-radius:0">'
if row.count(old_style)!=1:
    raise SystemExit(f"advanced row style anchor count was {row.count(old_style)}")
row=row.replace(old_style,new_style,1)
advanced='''        <details data-settings-advanced="1" style="border:1px solid var(--line);border-radius:14px;background:#fff;overflow:hidden;">
          <summary style="cursor:pointer;padding:16px 17px;list-style:none;display:flex;justify-content:space-between;gap:16px;align-items:center"><span><strong style="font-size:14px">高级设置</strong><span style="display:block;margin-top:4px;color:var(--muted);font-size:11px">一般无需调整</span></span><span style="color:var(--muted);font-size:12px">展开</span></summary>
          <div data-settings-advanced-body>
'''+row+'''
          </div>
        </details>

'''
app=app[:row_start]+advanced+app[row_end:]
for required in [
    'data-settings-advanced="1"',
    'data-settings-advanced-body',
    '<strong style="font-size:14px">高级设置</strong>',
    '<h3>AI 高级配置</h3>',
    'data-action="save-codex-runtime"',
]:
    if required not in app:
        raise SystemExit(f"native advanced Settings markup missing: {required}")
app_path.write_text(app,encoding="utf-8")

index_path=Path("public/index.html")
index=index_path.read_text(encoding="utf-8")
script='  <script src="./settings-surface.js"></script>\n'
if index.count(script)!=1:
    raise SystemExit(f"settings-surface script tag count was {index.count(script)}")
index=index.replace(script,"",1)
index_path.write_text(index,encoding="utf-8")

surface_path=Path("public/settings-surface.js")
if not surface_path.exists():
    raise SystemExit("settings-surface.js already missing before guarded retirement")
surface_path.unlink()

package_path=Path("package.json")
package=package_path.read_text(encoding="utf-8")
check_token=' && node --check public/settings-surface.js'
if package.count(check_token)!=1:
    raise SystemExit(f"package settings-surface check count was {package.count(check_token)}")
package=package.replace(check_token,"",1)
package_path.write_text(package,encoding="utf-8")

check_path=Path("scripts/check-runtime-authority-v3.js")
check=check_path.read_text(encoding="utf-8")
old='''const settingsSurface=read("public/settings-surface.js");
for(const retiredSettingsCompat of ["simplifyVoice","本地自然发音","模型与思考强度","图片生成"]){
  assert(!settingsSurface.includes(retiredSettingsCompat),`settings-surface must not retain obsolete source-compatibility logic: ${retiredSettingsCompat}`);
}
assert(settingsSurface.includes("buildAdvancedSection")&&settingsSurface.includes('rowByTitle("AI 高级配置")'),"settings-surface must retain only the active Advanced Settings layout behavior");'''
new='''assert(!exists("public/settings-surface.js"),"retired Settings mutation decorator must stay deleted");
assert(!index.includes('<script src="./settings-surface.js"></script>'),"retired Settings mutation decorator must not load at runtime");
assert(app.includes('data-settings-advanced="1"')&&app.includes("data-settings-advanced-body"),"app.js must natively own the Advanced Settings disclosure layout");'''
if check.count(old)!=1:
    raise SystemExit(f"settings-surface runtime contract block count was {check.count(old)}")
check=check.replace(old,new,1)
check_path.write_text(check,encoding="utf-8")

# Final guard: the retired file/reference must be gone, while active settings
# controls remain in the base surface.
for path in [index_path,package_path,check_path]:
    txt=path.read_text(encoding="utf-8")
    if path != check_path and "settings-surface.js" in txt:
        raise SystemExit(f"retired settings-surface reference remains in {path}")
for required in ['id="codex-model-select"','id="codex-effort"','data-action="save-codex-runtime"','id="tts-voice"']:
    if required not in app:
        raise SystemExit(f"active Settings control missing after decorator retirement: {required}")
