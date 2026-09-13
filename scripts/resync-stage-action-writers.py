from pathlib import Path


def replace_once(path_str, old, new, label):
    path=Path(path_str)
    text=path.read_text(encoding="utf-8")
    if text.count(old)!=1:
        raise SystemExit(f"{label}: target count was {text.count(old)}")
    text=text.replace(old,new,1)
    path.write_text(text,encoding="utf-8")

replace_once(
    "public/memorize-stage-v3.js",
    '''    if(!r.ok) throw new Error("SAVE_FAILED");\n    data=normalized;\n''',
    '''    if(!r.ok) throw new Error("SAVE_FAILED");\n    if(!syncFromGateway())data=normalized;\n''',
    "Memorize save",
)
replace_once(
    "public/visualize-actions-v3.js",
    '''    if(!response.ok)throw new Error("SAVE_FAILED");\n    data=normalized;\n''',
    '''    if(!response.ok)throw new Error("SAVE_FAILED");\n    if(!syncFromGateway())data=normalized;\n''',
    "Visualize Actions save",
)
replace_once(
    "public/apply-actions-v3.js",
    '''    if(!response.ok)throw new Error("SAVE_FAILED");\n    data=normalized;\n''',
    '''    if(!response.ok)throw new Error("SAVE_FAILED");\n    if(!syncFromGateway())data=normalized;\n''',
    "Apply Actions persist",
)

for path_str in ["public/memorize-stage-v3.js","public/visualize-actions-v3.js","public/apply-actions-v3.js"]:
    text=Path(path_str).read_text(encoding="utf-8")
    if "if(!syncFromGateway())data=normalized;" not in text:
        raise SystemExit(f"confirmed-snapshot resync missing in {path_str}")

check_path=Path("scripts/check-stage-commands-v3.js")
check=check_path.read_text(encoding="utf-8")
anchor='assert(memorize.includes("if(saving)return"),"Memorize UI must reject double completion clicks while persistence is in flight");'
addition='''\nassert(memorize.includes("if(!syncFromGateway())data=normalized;"),"Memorize must continue from the Gateway-confirmed persisted snapshot after a successful stage write");\nassert(visualize.includes("if(!syncFromGateway())data=normalized;"),"Visualize actions must continue from the Gateway-confirmed persisted snapshot after a successful write");\nassert(apply.includes("if(!syncFromGateway())data=normalized;"),"Apply actions must continue from the Gateway-confirmed persisted snapshot after a successful write");'''
if check.count(anchor)!=1:
    raise SystemExit("Stage Commands writer-resync anchor not unique")
if "Memorize must continue from the Gateway-confirmed persisted snapshot" not in check:
    check=check.replace(anchor,anchor+addition,1)
check_path.write_text(check,encoding="utf-8")

authority_path=Path("scripts/check-runtime-authority-v3.js")
authority=authority_path.read_text(encoding="utf-8")
anchor='assert(memorize.includes("window.LexiFlowStudyRenderer?.currentCardId?.()"),"Memorize Stage V3 must resolve the exact Study Session renderer card ID");'
addition='''\nassert(memorize.includes("if(!syncFromGateway())data=normalized;"),"Memorize Stage V3 local state must follow the Gateway-confirmed write result");\nassert(visualActions.includes("if(!syncFromGateway())data=normalized;"),"Visualize Actions V3 local state must follow the Gateway-confirmed write result");\nassert(applyActions.includes("if(!syncFromGateway())data=normalized;"),"Apply Actions V3 local state must follow the Gateway-confirmed write result");'''
if authority.count(anchor)!=1:
    raise SystemExit("Runtime authority stage-action writer anchor not unique")
if "Memorize Stage V3 local state must follow the Gateway-confirmed write result" not in authority:
    authority=authority.replace(anchor,anchor+addition,1)
authority_path.write_text(authority,encoding="utf-8")
