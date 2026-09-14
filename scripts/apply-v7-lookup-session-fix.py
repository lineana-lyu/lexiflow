from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def write(rel, text):
    (ROOT / rel).write_text(text, encoding="utf-8")


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing expected block: {label}")
    return text.replace(old, new, 1)


# 1) Lookup session: allow a new query while the previous request is still running,
# and make late responses unable to overwrite the newest query.
rel = "public/app.js"
text = read(rel)
text = replace_once(
    text,
    '    lookupStatus: "idle",\n    providerStatus: null,',
    '    lookupStatus: "idle",\n    lookupRequestSeq: 0,\n    providerStatus: null,',
    "lookup request sequence state",
)
text = replace_once(
    text,
    '''          <button class="btn primary" type="submit" ${state.lookupStatus==="loading"?"disabled":""}>${state.lookupStatus==="loading"?"正在查询…":"查询"}</button>''',
    '''          <button class="btn primary" type="submit">${state.lookupStatus==="loading"?"重新查询":"查询"}</button>''',
    "keep search submit enabled during lookup",
)
text = replace_once(
    text,
    '''  function normalizeSearchText(v){return String(v||"").trim().toLowerCase();}\n\n  function levenshtein(a,b){''',
    '''  function normalizeSearchText(v){return String(v||"").trim().toLowerCase();}\n\n  function prepareLookupResult(result){\n    if(!result||typeof result!=="object")return result;\n    const senses=Array.isArray(result.senses)?result.senses:[];\n    const seen=new Set();\n    const normalized=senses.map((sense,index)=>{\n      const sourceId=String(sense?.id||`sense-${index+1}`).trim()||`sense-${index+1}`;\n      let id=sourceId;\n      if(seen.has(id)){\n        let suffix=index+1;\n        do{id=`${sourceId}-${suffix++}`;}while(seen.has(id));\n      }\n      seen.add(id);\n      return {...sense,id};\n    });\n    return {...result,senses:normalized};\n  }\n\n  function announceLookupQuery(query,requestId){\n    try{window.dispatchEvent(new CustomEvent("lexiflow:lookup-query-start",{detail:{query,requestId}}));}catch{}\n  }\n\n  function announceLookupCleared(){\n    try{window.dispatchEvent(new CustomEvent("lexiflow:lookup-cleared"));}catch{}\n  }\n\n  function levenshtein(a,b){''',
    "lookup result normalization helpers",
)
text = replace_once(
    text,
    '''    if(lookupForm) lookupForm.addEventListener("submit",async e=>{\n      e.preventDefault();\n      if(state.lookupStatus==="loading")return;\n      const input=document.getElementById("word-input");\n      const q=input.value.trim();\n      if(!q){showNotice("请输入单词或中文词义","例如 keyboard、键盘、wrok 或少量中文错别字。","warn");return;}\n\n      state.notice=null;''',
    '''    if(lookupForm) lookupForm.addEventListener("submit",async e=>{\n      e.preventDefault();\n      const input=document.getElementById("word-input");\n      const q=input.value.trim();\n      if(!q){showNotice("请输入单词或中文词义","例如 keyboard、键盘、wrok 或少量中文错别字。","warn");return;}\n      const requestId=++state.lookupRequestSeq;\n      announceLookupQuery(q,requestId);\n\n      state.notice=null;''',
    "allow re-query while loading",
)
text = replace_once(
    text,
    '''        if(exactLocal){\n          if(saved){''',
    '''        if(exactLocal){\n          if(requestId!==state.lookupRequestSeq)return;\n          if(saved){''',
    "guard local response against stale request",
)
text = replace_once(
    text,
    '''        const payload=await api("/api/search/smart",{method:"POST",body:{query:q}});\n        state.lookup={query:q,result:payload.result};\n        state.selectedSenseId=payload.result?.senses?.[0]?.id||null;\n        state.lookupStatus="idle";\n        render();\n      }catch(err){\n        state.lookupStatus="idle";''',
    '''        const payload=await api("/api/search/smart",{method:"POST",body:{query:q}});\n        if(requestId!==state.lookupRequestSeq)return;\n        const result=prepareLookupResult(payload.result);\n        state.lookup={query:q,result};\n        state.selectedSenseId=result?.senses?.[0]?.id||null;\n        state.lookupStatus="idle";\n        render();\n      }catch(err){\n        if(requestId!==state.lookupRequestSeq)return;\n        state.lookupStatus="idle";''',
    "ignore stale smart-search responses",
)
text = replace_once(
    text,
    '''        const payload=await api("/api/dictionary/lookup",{method:"POST",body:{word:q,mode:"primary"}});\n        state.lookup={query:q,result:payload.result};state.selectedSenseId=payload.result?.senses?.[0]?.id||null;state.lookupStatus="idle";render();''',
    '''        const payload=await api("/api/dictionary/lookup",{method:"POST",body:{word:q,mode:"primary"}});\n        const result=prepareLookupResult(payload.result);\n        state.lookup={query:q,result};state.selectedSenseId=result?.senses?.[0]?.id||null;state.lookupStatus="idle";render();''',
    "normalize suggestion lookup senses",
)
text = replace_once(
    text,
    '''        const payload=await api("/api/search/smart",{method:"POST",body:{query:sourceQuery,preferredWord}});\n        state.lookup={query:sourceQuery,result:payload.result};state.selectedSenseId=payload.result?.senses?.[0]?.id||null;state.lookupStatus="idle";render();''',
    '''        const payload=await api("/api/search/smart",{method:"POST",body:{query:sourceQuery,preferredWord}});\n        const result=prepareLookupResult(payload.result);\n        state.lookup={query:sourceQuery,result};state.selectedSenseId=result?.senses?.[0]?.id||null;state.lookupStatus="idle";render();''',
    "normalize alternative lookup senses",
)
text = replace_once(
    text,
    '''        const payload=await api("/api/search/smart",{method:"POST",body:{query:q,forceRefresh:true}});\n        state.lookup={query:q,result:payload.result};state.selectedSenseId=payload.result?.senses?.[0]?.id||null;state.lookupStatus="idle";render();''',
    '''        const payload=await api("/api/search/smart",{method:"POST",body:{query:q,forceRefresh:true}});\n        const result=prepareLookupResult(payload.result);\n        state.lookup={query:q,result};state.selectedSenseId=result?.senses?.[0]?.id||null;state.lookupStatus="idle";render();''',
    "normalize refresh lookup senses",
)
text = replace_once(
    text,
    '''    if(action==="clear-lookup"){state.lookup=null;state.lookupStatus="idle";state.lookupAlternativesOpen=false;state.loadingMoreSenses=false;state.selectedSenseId=null;state.addDraft=null;render();return;}\n    if(action==="lookup-again"){state.lookup=null;state.lookupStatus="idle";state.loadingMoreSenses=false;state.selectedSenseId=null;state.addDraft=null;render();return;}''',
    '''    if(action==="clear-lookup"){state.lookupRequestSeq+=1;announceLookupCleared();state.lookup=null;state.lookupStatus="idle";state.lookupAlternativesOpen=false;state.loadingMoreSenses=false;state.selectedSenseId=null;state.addDraft=null;render();return;}\n    if(action==="lookup-again"){state.lookupRequestSeq+=1;announceLookupCleared();state.lookup=null;state.lookupStatus="idle";state.loadingMoreSenses=false;state.selectedSenseId=null;state.addDraft=null;render();return;}''',
    "invalidate in-flight query when clearing",
)
text = replace_once(
    text,
    '''        state.lookup={query:q,result:payload.result};\n        state.selectedSenseId=payload.result?.senses?.[0]?.id||null;\n        state.addDraft=null;''',
    '''        const result=prepareLookupResult(payload.result);\n        state.lookup={query:q,result};\n        state.selectedSenseId=result?.senses?.[0]?.id||null;\n        state.addDraft=null;''',
    "normalize expanded senses",
)
write(rel, text)


# 2) Source context: scope the draft to the active lookup. A sentence entered for
# one word must never appear automatically on the next word/phrase.
rel = "public/source-context-v3.js"
text = read(rel)
text = replace_once(
    text,
    '''  let scheduled=false;\n  let activeLibraryCardId="";''',
    '''  let scheduled=false;\n  let activeLibraryCardId="";\n  let activeLookupKey="";''',
    "active lookup key",
)
text = replace_once(
    text,
    '''  function saveDraft(next){try{localStorage.setItem(DRAFT_KEY,JSON.stringify(next));}catch{}}\n  function clearDraft(){try{localStorage.removeItem(DRAFT_KEY);}catch{}}\n\n  function sourceFields(card){''',
    '''  function saveDraft(next){try{localStorage.setItem(DRAFT_KEY,JSON.stringify(next));}catch{}}\n  function clearDraft(){try{localStorage.removeItem(DRAFT_KEY);}catch{}}\n  function queryKey(value){return String(value||"").trim().toLowerCase().replace(/\\s+/g," ");}\n  function emptyLookupDraft(key=""){return{lookupQuery:key,sourceType:"other",sourceTitle:"",sourceContext:""};}\n  function scopedDraft(){\n    const draft=loadDraft();\n    if(!activeLookupKey)return draft;\n    return queryKey(draft.lookupQuery)===activeLookupKey?draft:emptyLookupDraft(activeLookupKey);\n  }\n  function beginLookup(query){\n    const key=queryKey(query);\n    if(!key)return;\n    const draft=loadDraft();\n    if(queryKey(draft.lookupQuery)!==key)saveDraft(emptyLookupDraft(key));\n    activeLookupKey=key;\n    schedule();\n  }\n  function resetLookupDraft(){activeLookupKey="";clearDraft();schedule();}\n\n  function sourceFields(card){''',
    "query-scoped source drafts",
)
text = replace_once(
    text,
    '''    const draft=loadDraft();\n    const canAttachDraft=hasDraftSource(draft);''',
    '''    const draft=loadDraft();\n    const draftLookupKey=queryKey(draft.lookupQuery);\n    const canAttachDraft=hasDraftSource(draft)&&Boolean(draftLookupKey);''',
    "source draft attach key",
)
text = replace_once(
    text,
    '''      if(!known.has(String(card.id))&&core.canonicalStage(card)==="select"&&canAttachDraft){''',
    '''      if(!known.has(String(card.id))&&core.canonicalStage(card)==="select"&&canAttachDraft&&draftLookupKey===queryKey(card.sourceQuery||card.word)){''',
    "only attach source draft to matching lookup",
)
text = replace_once(
    text,
    '''    if(committedDraft)clearDraft();''',
    '''    if(committedDraft){activeLookupKey="";clearDraft();}''',
    "clear scoped draft after card persist",
)
text = replace_once(
    text,
    '''  function sourceEditorHtml(){\n    const draft=loadDraft();''',
    '''  function sourceEditorHtml(){\n    const draft=scopedDraft();''',
    "render only active query source draft",
)
text = replace_once(
    text,
    '''  function persistDraftFromUi(){\n    const type=document.getElementById("lexi-source-type"),title=document.getElementById("lexi-source-title"),context=document.getElementById("lexi-source-context");\n    if(!type&&!title&&!context)return;\n    saveDraft({sourceType:String(type?.value||"other"),sourceTitle:String(title?.value||""),sourceContext:String(context?.value||"")});\n  }''',
    '''  function persistDraftFromUi(){\n    const type=document.getElementById("lexi-source-type"),title=document.getElementById("lexi-source-title"),context=document.getElementById("lexi-source-context");\n    if(!type&&!title&&!context)return;\n    const lookupQuery=activeLookupKey||queryKey(document.getElementById("word-input")?.value||"");\n    saveDraft({lookupQuery,sourceType:String(type?.value||"other"),sourceTitle:String(title?.value||""),sourceContext:String(context?.value||"")});\n  }''',
    "persist query with source draft",
)
text = replace_once(
    text,
    '''  document.addEventListener("input",event=>{if(["lexi-source-title","lexi-source-context"].includes(event.target?.id))persistDraftFromUi();},true);\n  document.addEventListener("change",event=>{if(event.target?.id==="lexi-source-type")persistDraftFromUi();},true);\n\n  function decorate(){''',
    '''  document.addEventListener("input",event=>{if(["lexi-source-title","lexi-source-context"].includes(event.target?.id))persistDraftFromUi();},true);\n  document.addEventListener("change",event=>{if(event.target?.id==="lexi-source-type")persistDraftFromUi();},true);\n  window.addEventListener("lexiflow:lookup-query-start",event=>beginLookup(event.detail?.query));\n  window.addEventListener("lexiflow:lookup-cleared",resetLookupDraft);\n\n  function decorate(){''',
    "listen for lookup lifecycle",
)
write(rel, text)


# 3) Phrase dictionary: upstream sense_id is not guaranteed unique across POS groups.
# Generate a deterministic UI identity per returned sense; preserve upstream id only as metadata.
rel = "lib/phrase-dictionary.js"
text = read(rel)
text = replace_once(
    text,
    '''    senses:chosen.map((sense, index) => ({\n      id:clean(sense.id) || `phrase-${word.replace(/[^a-z0-9]+/g, "-")}-${index + 1}`,\n      pos:clean(sense.pos) || "phrase",''',
    '''    senses:chosen.map((sense, index) => ({\n      id:`phrase-${word.replace(/[^a-z0-9]+/g, "-")}-${index + 1}`,\n      sourceSenseId:clean(sense.id),\n      pos:clean(sense.pos) || "phrase",''',
    "guarantee unique phrase sense ids",
)
write(rel, text)


# 4) Regression: duplicate upstream IDs must still yield one selected sense at a time.
rel = "scripts/check-phrase-dictionary-v5.js"
text = read(rel)
marker = 'console.log("Phrase dictionary V5 checks passed");\n'
if marker not in text:
    raise SystemExit("missing expected block: phrase dictionary footer")
extra = r'''
const duplicateIds = rowToResult({
  normalized_headword:"ride or die",
  headword:"ride or die",
  phonetic_us:"raɪd ɔr daɪ",
  phonetic_any:"raɪd ɔr daɪ",
  senses_json:JSON.stringify([
    {id:"shared-upstream-id",pos:"adj",meaningZh:"不离不弃的；坚定支持的",exampleEn:"She's ride or die for her best friend.",exampleZh:"她对自己最好的朋友始终不离不弃。",priority:"core"},
    {id:"shared-upstream-id",pos:"noun",meaningZh:"忠实伙伴；不离不弃的人",exampleEn:"My sister is my ride or die.",exampleZh:"我姐姐是那个永远支持我的人。",priority:"common"},
    {id:"shared-upstream-id",pos:"verb",meaningZh:"坚定支持；不离不弃地站在某人一边",exampleEn:"I'll ride or die for my friends.",exampleZh:"我会始终坚定地支持我的朋友们。",priority:"common"},
  ]),
}, "expanded");
assert.strictEqual(duplicateIds.senses.length, 3, "expanded phrase should expose three learner senses");
assert.strictEqual(new Set(duplicateIds.senses.map(s=>s.id)).size, 3, "UI sense ids must be unique even when the upstream dictionary repeats sense_id");
assert.deepStrictEqual(duplicateIds.senses.map(s=>s.id), ["phrase-ride-or-die-1","phrase-ride-or-die-2","phrase-ride-or-die-3"], "phrase sense ids should remain deterministic between primary and expanded lookup");
'''
text = text.replace(marker, extra + "\n" + marker, 1)
write(rel, text)


# 5) User-surface contract for the three regressions in this round.
rel = "scripts/check-user-surface-v4.js"
text = read(rel)
marker = 'console.log("User surface V4 checks passed.");\n'
if marker not in text:
    raise SystemExit("missing expected block: user surface footer")
extra = r'''
assert(app.includes("lookupRequestSeq")&&app.includes("requestId!==state.lookupRequestSeq")&&app.includes("lexiflow:lookup-query-start"),"a new search must be allowed while an older request is running, and stale responses must not overwrite the newest query");
assert(app.includes('state.lookupStatus==="loading"?"重新查询":"查询"')&&!app.includes('type="submit" ${state.lookupStatus==="loading"?"disabled":""}'),"the main lookup button must remain available for re-query while loading");
assert(app.includes("prepareLookupResult")&&app.includes("seen.has(id)"),"lookup results must defensively de-duplicate sense ids before selection state is rendered");
assert(source.includes("lookupQuery")&&source.includes("lexiflow:lookup-query-start")&&source.includes("lexiflow:lookup-cleared")&&source.includes("draftLookupKey===queryKey(card.sourceQuery||card.word)"),"source context drafts must be scoped to the word or phrase that created them and cleared for a different lookup");
'''
text = text.replace(marker, extra + "\n" + marker, 1)
write(rel, text)

print("V7 lookup session consistency fix staged.")
