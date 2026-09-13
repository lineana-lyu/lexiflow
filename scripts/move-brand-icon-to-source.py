from pathlib import Path

ICON='./icon.png'

app_path=Path("public/app.js")
app=app_path.read_text(encoding="utf-8")
old='<div class="brand"><div class="logo">L</div><div><strong>LexiFlow</strong><span>词义 · 语境 · 主动回忆</span></div></div>'
new=f'<div class="brand"><div class="logo lexi-brand-icon"><img class="lexi-brand-icon-image" src="{ICON}" alt="LexiFlow" draggable="false"></div><div><strong>LexiFlow</strong><span>词义 · 语境 · 主动回忆</span></div></div>'
if app.count(old)!=1:
    raise SystemExit(f"legacy brand logo source count was {app.count(old)}")
app=app.replace(old,new,1)
if '<div class="logo">L</div>' in app:
    raise SystemExit("legacy letter brand logo remains")
for required in ["lexi-brand-icon","lexi-brand-icon-image",ICON]:
    if required not in app:
        raise SystemExit(f"native brand icon markup missing: {required}")
app_path.write_text(app,encoding="utf-8")

index_path=Path("public/index.html")
index=index_path.read_text(encoding="utf-8")
approved_favicon='<link rel="icon" type="image/png" href="./icon.png" />'
if index.count(approved_favicon)!=1:
    raise SystemExit(f"approved favicon source count was {index.count(approved_favicon)}")

ux_path=Path("public/product-ux.js")
ux=ux_path.read_text(encoding="utf-8")
const_line='  const APP_ICON_URL = "./icon.png?v=20260911-icon3";\n'
if ux.count(const_line)!=1:
    raise SystemExit(f"APP_ICON_URL declaration count was {ux.count(const_line)}")
ux=ux.replace(const_line,"",1)
start='  function applyAppIcon() {'
end='  function speakerSvg() {'
if ux.count(start)!=1 or ux.count(end)!=1:
    raise SystemExit("applyAppIcon/speakerSvg anchors are not unique")
a=ux.index(start); b=ux.index(end,a)
ux=ux[:a]+ux[b:]
call='    applyAppIcon();\n'
if ux.count(call)!=1:
    raise SystemExit(f"applyAppIcon call count was {ux.count(call)}")
ux=ux.replace(call,"",1)
for retired in ["APP_ICON_URL","applyAppIcon",".brand .logo"]:
    if retired in ux:
        raise SystemExit(f"retired runtime brand decoration remains: {retired}")
for required in ["decorateSpeakers","decorateDailyGoal","openImageWorkspaceFromJob","MutationObserver"]:
    if required not in ux:
        raise SystemExit(f"active Product UX capability missing: {required}")
ux_path.write_text(ux,encoding="utf-8")

# Move the existing runtime-cleanup contract from decorator ownership to source ownership.
cleanup_path=Path("scripts/check-runtime-cleanup-v3.js")
cleanup=cleanup_path.read_text(encoding="utf-8")
product_read='const product=fs.readFileSync(path.join(root,"public","product-ux.js"),"utf8");\n'
app_read='const app=fs.readFileSync(path.join(root,"public","app.js"),"utf8");\n'
if cleanup.count(product_read)!=1:
    raise SystemExit("runtime cleanup product read anchor not unique")
if app_read not in cleanup:
    cleanup=cleanup.replace(product_read,product_read+app_read,1)
old_assert='assert(product.includes("applyAppIcon"),"canonical product UX runtime must own app icon decoration");'
new_assert='''assert(!product.includes("applyAppIcon")&&!product.includes("APP_ICON_URL"),"product UX must not patch the static brand icon after render");
assert(app.includes("lexi-brand-icon-image")&&app.includes('src="./icon.png"'),"app.js must directly render the approved icon.png brand asset");'''
if cleanup.count(old_assert)!=1:
    raise SystemExit(f"legacy app icon cleanup assertion count was {cleanup.count(old_assert)}")
cleanup=cleanup.replace(old_assert,new_assert,1)
cleanup_path.write_text(cleanup,encoding="utf-8")

check_path=Path("scripts/check-runtime-authority-v3.js")
check=check_path.read_text(encoding="utf-8")
anchor='assert(productUx.includes("decorateDailyGoal"),"product-ux must retain the active daily-goal enhancement");'
addition='''\nassert(!productUx.includes("applyAppIcon")&&!productUx.includes("APP_ICON_URL"),"product-ux must not patch the static brand icon after render");\nassert(app.includes("lexi-brand-icon-image")&&app.includes('src="./icon.png"'),"app.js must natively render the approved LexiFlow brand icon");\nassert(index.includes('<link rel="icon" type="image/png" href="./icon.png" />'),"index favicon must keep the approved LexiFlow icon asset");'''
if check.count(anchor)!=1:
    raise SystemExit("product UX active behavior contract anchor not uniquely found")
if "must not patch the static brand icon after render" not in check:
    check=check.replace(anchor,anchor+addition,1)
check_path.write_text(check,encoding="utf-8")
