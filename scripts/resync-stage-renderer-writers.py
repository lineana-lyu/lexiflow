from pathlib import Path


def patch_renderer(path_str, authority, label):
    path=Path(path_str)
    text=path.read_text(encoding="utf-8")
    old=f'''  async function persist(next){{\n    const normalized=core.normalizeData(next);\n    const response=await fetch("/api/learning-data",{{\n      method:"POST",\n      headers:{{"Content-Type":"application/json"}},\n      body:JSON.stringify({{data:normalized,{authority}:"v3"}}),\n    }});\n    if(!response.ok)throw new Error("SAVE_FAILED");\n    data=normalized;\n    return normalized;\n  }}\n'''
    compact_old=f'''  async function persist(next){{\n    const normalized=core.normalizeData(next);\n    const response=await fetch("/api/learning-data",{{method:"POST",headers:{{"Content-Type":"application/json"}},body:JSON.stringify({{data:normalized,{authority}:"v3"}})}});\n    if(!response.ok)throw new Error("SAVE_FAILED");\n    data=normalized;return normalized;\n  }}\n'''
    new=f'''  async function persist(next){{\n    const normalized=core.normalizeData(next);\n    const response=await fetch("/api/learning-data",{{\n      method:"POST",\n      headers:{{"Content-Type":"application/json"}},\n      body:JSON.stringify({{data:normalized,{authority}:"v3"}}),\n    }});\n    if(!response.ok)throw new Error("SAVE_FAILED");\n    if(!syncFromGateway())data=normalized;\n    return data||normalized;\n  }}\n'''
    compact_new=f'''  async function persist(next){{\n    const normalized=core.normalizeData(next);\n    const response=await fetch("/api/learning-data",{{method:"POST",headers:{{"Content-Type":"application/json"}},body:JSON.stringify({{data:normalized,{authority}:"v3"}})}});\n    if(!response.ok)throw new Error("SAVE_FAILED");\n    if(!syncFromGateway())data=normalized;return data||normalized;\n  }}\n'''
    if text.count(old)==1:
        text=text.replace(old,new,1)
    elif text.count(compact_old)==1:
        text=text.replace(compact_old,compact_new,1)
    else:
        raise SystemExit(f"{label}: persist block not uniquely found")
    for required in ["if(!syncFromGateway())data=normalized",f'{authority}:"v3"',"loadData(true)"]:
        if required not in text:
            raise SystemExit(f"{label}: required contract missing: {required}")
    path.write_text(text,encoding="utf-8")

patch_renderer("public/visualize-stage-v3.js","visualizeStageAuthority","Visualize Stage")
patch_renderer("public/apply-stage-v3.js","applyStageAuthority","Apply Stage")

check_path=Path("scripts/check-stage-renderers-v3.js")
check=check_path.read_text(encoding="utf-8")
visual_anchor='assert(visual.includes("LexiFlowLearningDataGatewayV3?.current?.()"),"Visualize renderer must consume the learning-data gateway snapshot for redraws");'
visual_add='''\nassert(visual.includes("if(!syncFromGateway())data=normalized;"),"Visualize renderer writes must continue from the Gateway-confirmed persisted snapshot");\nassert(visual.includes("loadData(true)"),"Visualize async card patches must retain a fresh source read before mutation");'''
if check.count(visual_anchor)!=1:
    raise SystemExit("Visualize renderer writer-resync anchor not unique")
if "Visualize renderer writes must continue from the Gateway-confirmed persisted snapshot" not in check:
    check=check.replace(visual_anchor,visual_anchor+visual_add,1)
apply_anchor='assert(apply.includes("LexiFlowLearningDataGatewayV3?.current?.()"),"Apply renderer must consume the learning-data gateway snapshot for redraws");'
apply_add='''\nassert(apply.includes("if(!syncFromGateway())data=normalized;"),"Apply renderer writes must continue from the Gateway-confirmed persisted snapshot");\nassert(apply.includes("loadData(true)"),"Apply async card patches must retain a fresh source read before mutation");'''
if check.count(apply_anchor)!=1:
    raise SystemExit("Apply renderer writer-resync anchor not unique")
if "Apply renderer writes must continue from the Gateway-confirmed persisted snapshot" not in check:
    check=check.replace(apply_anchor,apply_anchor+apply_add,1)
check_path.write_text(check,encoding="utf-8")
