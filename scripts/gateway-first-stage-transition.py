from pathlib import Path

transition_path=Path("public/stage-transition-v3.js")
transition=transition_path.read_text(encoding="utf-8")
old='''  async function loadData(){
    const response=await fetch("/api/learning-data",{cache:"no-store"});
    if(!response.ok)throw new Error("LOAD_FAILED");
    const payload=await response.json();
    return payload?.data?core.normalizeData(payload.data):null;
  }
'''
new='''  function gatewaySnapshot(){
    try{
      const current=window.LexiFlowLearningDataGatewayV3?.current?.();
      return current?.cards?core.normalizeData(current):null;
    }catch{return null;}
  }

  async function loadData(force=false){
    const snapshot=force?null:gatewaySnapshot();
    if(snapshot)return snapshot;
    const response=await fetch("/api/learning-data",{cache:"no-store"});
    if(!response.ok)throw new Error("LOAD_FAILED");
    const payload=await response.json();
    return payload?.data?core.normalizeData(payload.data):null;
  }
'''
if transition.count(old)!=1:
    raise SystemExit(f"Stage Transition loadData block count was {transition.count(old)}")
transition=transition.replace(old,new,1)
for required in [
    "function gatewaySnapshot()",
    "window.LexiFlowLearningDataGatewayV3?.current?.()",
    "const snapshot=force?null:gatewaySnapshot();",
    "if(snapshot)return snapshot;",
    'fetch("/api/learning-data",{cache:"no-store"})',
    "commandCommitted(data,commandId)",
    "core.canonicalStage(card)",
    "stageTransitionAuthority:\"v3\"",
]:
    if required not in transition:
        raise SystemExit(f"Stage Transition Gateway-first contract missing: {required}")
transition_path.write_text(transition,encoding="utf-8")

check_path=Path("scripts/check-stage-commands-v3.js")
check=check_path.read_text(encoding="utf-8")
anchor='assert(transition.includes("stageCommandId"),"Select, Visualize and Apply completion must have deterministic command IDs");'
addition='''\nassert(transition.includes("function gatewaySnapshot()")&&transition.includes("LexiFlowLearningDataGatewayV3?.current?.()"),"Stage Transition V3 must prefer the persistence-confirmed Gateway snapshot before network fallback");\nassert(transition.includes("const snapshot=force?null:gatewaySnapshot();")&&transition.includes("if(snapshot)return snapshot;"),"Stage Transition V3 must avoid a redundant learning-data GET when the Gateway snapshot is available");\nassert(transition.includes('fetch("/api/learning-data",{cache:"no-store"})'),"Stage Transition V3 must retain a cold-start GET fallback when no Gateway snapshot exists");'''
if check.count(anchor)!=1:
    raise SystemExit("Stage Commands Gateway-first anchor not unique")
if "must prefer the persistence-confirmed Gateway snapshot" not in check:
    check=check.replace(anchor,anchor+addition,1)
check_path.write_text(check,encoding="utf-8")

authority_path=Path("scripts/check-runtime-authority-v3.js")
authority=authority_path.read_text(encoding="utf-8")
anchor='assert(stageTransition.includes("core.crossDayPatch"),"learning stage transitions must use Learning Core");'
addition='''\nassert(stageTransition.includes("LexiFlowLearningDataGatewayV3?.current?.()")&&stageTransition.includes("if(snapshot)return snapshot;"),"Stage Transition V3 reads must prefer the canonical Gateway snapshot while retaining network fallback");'''
if authority.count(anchor)!=1:
    raise SystemExit("Runtime authority Stage Transition anchor not unique")
if "Stage Transition V3 reads must prefer the canonical Gateway snapshot" not in authority:
    authority=authority.replace(anchor,anchor+addition,1)
authority_path.write_text(authority,encoding="utf-8")
