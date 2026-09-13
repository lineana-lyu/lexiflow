from pathlib import Path

path=Path("public/product-ux.js")
text=path.read_text(encoding="utf-8")

const_line='  const DICTIONARY_KEY_URL = "https://www.dictionaryapi.com/register/index";\n'
if text.count(const_line)!=1:
    raise SystemExit("DICTIONARY_KEY_URL declaration not uniquely found")
text=text.replace(const_line,"",1)

def remove_function(source,name,next_name):
    start=f"  function {name}("
    end=f"  function {next_name}("
    if source.count(start)!=1 or source.count(end)!=1:
        raise SystemExit(f"product-ux function anchors invalid: {name} -> {next_name}")
    a=source.index(start)
    b=source.index(end,a)
    return source[:a]+source[b:]

text=remove_function(text,"decorateDictionarySettings","decorateSecurityBanner")
text=remove_function(text,"mergeAiSettings","decorateDailyGoal")

for call in [
    "    decorateDictionarySettings(list);\n",
    "    mergeAiSettings(list);\n",
]:
    if text.count(call)!=1:
        raise SystemExit(f"dead product-ux call count was {text.count(call)}: {call.strip()}")
    text=text.replace(call,"",1)

for retired in [
    "DICTIONARY_KEY_URL",
    "decorateDictionarySettings",
    "mergeAiSettings",
    "英语词典",
    "AI 服务",
    "模型与思考强度",
    "图片生成",
    "ai-unified-setting",
]:
    if retired in text:
        raise SystemExit(f"retired product-ux Settings code remains: {retired}")

for required in [
    "applyAppIcon",
    "decorateSpeakers",
    "decorateSecurityBanner",
    "decorateDailyGoal",
    "openImageWorkspaceFromJob",
    "MutationObserver",
]:
    if required not in text:
        raise SystemExit(f"required product-ux capability missing: {required}")

path.write_text(text,encoding="utf-8")

check_path=Path("scripts/check-runtime-authority-v3.js")
check=check_path.read_text(encoding="utf-8")
anchor='assert(app.includes("备份单词卡、学习进度和复习记录。")&&app.includes("从此前导出的备份恢复学习数据。"),"Settings base surface must own backup/restore descriptions");'
addition='''\nconst productUx=read("public/product-ux.js");\nfor(const retiredDecorator of ["decorateDictionarySettings","mergeAiSettings","ai-unified-setting"]){\n  assert(!productUx.includes(retiredDecorator),`product-ux must not retain a Settings decorator whose source structure no longer exists: ${retiredDecorator}`);\n}\nassert(productUx.includes("decorateDailyGoal")&&productUx.includes("decorateSecurityBanner"),"product-ux must retain active Settings enhancements");'''
if check.count(anchor)!=1:
    raise SystemExit("Settings backup contract anchor not uniquely found")
if "source structure no longer exists" not in check:
    check=check.replace(anchor,anchor+addition,1)
check_path.write_text(check,encoding="utf-8")
