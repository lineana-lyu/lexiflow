from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def read(rel):
    return (ROOT/rel).read_text(encoding="utf-8")

def write(rel,text):
    (ROOT/rel).write_text(text,encoding="utf-8")

def replace_once(text,old,new,label):
    if old not in text:
        raise SystemExit(f"missing patch target: {label}")
    return text.replace(old,new,1)

# 1) ECDICT phonetics: keep only a clean first transcription and normalize legacy
# stress marks. This prevents rows such as `,selfə'ʃuəd; ?(@)-'?rd` from leaking
# mojibake-like alternatives into the UI.
rel="lib/ecdict.js"
s=read(rel)
s=replace_once(s,
'''function normalizePhonetic(value) {
  const raw = String(value || "").trim().replace(/^\\/+|\\/+$/g, "");
  return raw ? `/${raw}/` : "";
}''',
'''function normalizePhonetic(value) {
  const raw = String(value || "").trim().replace(/^\\/+|\\/+$/g, "");
  if (!raw) return "";
  const candidates = raw.split(/[;；]/).map(part => part.trim()).filter(Boolean);
  for (const candidate of candidates) {
    let cleaned = candidate
      .replace(/^[,，]+/, "ˌ")
      .replace(/'/g, "ˈ")
      .replace(/\\s+/g, " ")
      .trim();
    if (!cleaned || cleaned.length > 96) continue;
    // ECDICT contains a small number of legacy/garbled alternate encodings.
    // Do not surface those as IPA; a higher-quality pronunciation provider can
    // still hydrate the entry later.
    if (/[?@=<>]/.test(cleaned)) continue;
    if (!/[A-Za-z\\u0250-\\u02AF\\u1D00-\\u1DBF]/u.test(cleaned)) continue;
    return `/${cleaned}/`;
  }
  return "";
}''',"ecdict phonetic normalizer")
s=s.replace('  bestChineseLookup,\n};','  bestChineseLookup,\n  normalizePhonetic,\n};')
write(rel,s)

# 2) Make complete phrase IPA part of the server response, not an async UI race.
rel="server-runtime.js"
s=read(rel)
insert='''
async function ensureWholePhrasePhonetic(result, phrase) {
  if (!result || !/\\s/.test(clean(phrase))) return result;
  if (clean(result.phonetic) && result.wholeExpressionPhonetic === true) return result;
  const phonetic = await composePhrasePhonetic(phrase);
  if (!phonetic) return { ...result, phonetic:"", wholeExpressionPhonetic:false };
  return {
    ...result,
    phonetic,
    wholeExpressionPhonetic:true,
    pronunciationSource:"composed-exact-word-ipa",
  };
}

'''
s=replace_once(s,'function localChineseResult(query) {',insert+'function localChineseResult(query) {','phrase phonetic helper')
s=replace_once(s,
'''    } else if (queryKind === "phrase" && /^[A-Za-z][A-Za-z\\s'-]*$/.test(query)) {
      result = localPhraseResult(query.toLowerCase(), "primary");
    }''',
'''    } else if (queryKind === "phrase" && /^[A-Za-z][A-Za-z\\s'-]*$/.test(query)) {
      result = await ensureWholePhrasePhonetic(localPhraseResult(query.toLowerCase(), "primary"), query.toLowerCase());
    }''','smart phrase response')
s=replace_once(s,
'    const localPhrase = localPhraseResult(word, mode);',
'    const localPhrase = await ensureWholePhrasePhonetic(localPhraseResult(word, mode), word);','dictionary phrase response')
s=replace_once(s,
'    const localPhrase = localPhraseResult(query, "primary");',
'    const localPhrase = await ensureWholePhrasePhonetic(localPhraseResult(query, "primary"), query);','expression phrase response')
write(rel,s)

# 3) Never let a low-quality ECDICT pronunciation hydration overwrite an already
# valid pronunciation returned by Core/Wiktionary/MW.
rel="public/example-hydration.js"
s=read(rel)
helpers='''
  function phoneticSourceRank(source) {
    const value=clean(source).toLowerCase();
    if(/merriam|wiktionary|wikimedia|open-dictionary/.test(value))return 40;
    if(/composed-exact-word-ipa/.test(value))return 35;
    if(/core/.test(value))return 30;
    if(/ecdict/.test(value))return 10;
    return 20;
  }

  function shouldAdoptPhonetic(result, pronunciation, phonetic, isPhrase, wholePhrasePhonetic) {
    if(!phonetic)return false;
    if(isPhrase)return wholePhrasePhonetic;
    const existing=clean(result?.phonetic);
    if(!existing)return true;
    const incomingSource=clean(pronunciation?.pronunciationSource);
    const existingSource=clean(result?.pronunciationSource);
    if(/ecdict/i.test(incomingSource))return false;
    return phoneticSourceRank(incomingSource)>=phoneticSourceRank(existingSource);
  }

'''
s=replace_once(s,'  function patchPronunciation(result, pronunciation) {',helpers+'  function patchPronunciation(result, pronunciation) {','hydration phonetic ranking')
s=replace_once(s,
'    if (phonetic && wholePhrasePhonetic) result.phonetic = phonetic;',
'    if (shouldAdoptPhonetic(result, pronunciation, phonetic, isPhrase, wholePhrasePhonetic)) result.phonetic = phonetic;','hydration phonetic adoption')
write(rel,s)

# 4) Active lookup state must receive hydrated examples, and save must await the
# authoritative example/pronunciation data before persisting a card.
rel="public/app.js"
s=read(rel)
helper='''
  function mergeHydratedSense(target, incoming){
    if(!target||!incoming)return false;
    let changed=false;
    for(const key of ["exampleEn","exampleZh"]){
      const value=String(incoming[key]||"").trim();
      if(value&&String(target[key]||"").trim()!==value){target[key]=value;changed=true;}
    }
    return changed;
  }

  function mergeActiveLookupHydration(detail){
    const result=state.lookup?.result;
    const word=String(detail?.word||"").trim().toLowerCase();
    if(!result||!word||String(result.word||"").trim().toLowerCase()!==word)return false;
    let changed=false;
    for(const incoming of Array.isArray(detail.senses)?detail.senses:[]){
      const target=(result.senses||[]).find(item=>String(item.id||"")===String(incoming.id||""))
        ||(result.senses||[]).find(item=>String(item.pos||"")===String(incoming.pos||"")&&String(item.meaningZh||"")===String(incoming.meaningZh||""));
      if(!target)continue;
      if(mergeHydratedSense(target,incoming))changed=true;
      if(state.addDraft&&String(state.addDraft.id||"")===String(target.id||"")){
        if(mergeHydratedSense(state.addDraft,incoming))changed=true;
      }
    }
    return changed;
  }

  async function prepareLookupForSave(result, sense){
    if(!result||!sense)return sense;
    if(!String(sense.exampleEn||"").trim()||!String(sense.exampleZh||"").trim()){
      try{
        const payload=await api("/api/dictionary/examples",{method:"POST",body:{
          word:result.word,
          senses:[{id:sense.id,pos:sense.pos,meaningZh:sense.meaningZh,senseIntentEn:sense.senseIntentEn||"",exampleEn:sense.exampleEn||"",exampleZh:sense.exampleZh||""}]
        }});
        const incoming=Array.isArray(payload?.senses)?payload.senses.find(item=>String(item.id||"")===String(sense.id||""))||payload.senses[0]:null;
        if(incoming)mergeHydratedSense(sense,incoming);
      }catch{}
    }

    const isPhrase=isMultiWordExpression(result.word);
    if(isPhrase||!String(result.phonetic||"").trim()){
      try{
        const payload=await api("/api/dictionary/pronunciation",{method:"POST",body:{word:result.word}});
        const pronunciation=payload?.result||{};
        const phonetic=String(pronunciation.phonetic||"").trim();
        if(phonetic&&(!String(result.phonetic||"").trim()||isPhrase||!/ecdict/i.test(String(pronunciation.pronunciationSource||"")))){
          result.phonetic=phonetic;
          result.pronunciationSource=String(pronunciation.pronunciationSource||result.pronunciationSource||"");
        }
        if(isPhrase){result.audioUrl="";result.audioUrls=[];}
      }catch{}
    }
    return sense;
  }

'''
s=replace_once(s,'  function startStudy(cardId){',helper+'  function startStudy(cardId){','lookup save hydration helpers')
s=replace_once(s,
'''    if(action==="save-card"){
      const r=state.lookup?.result,s=r?.senses.find(x=>x.id===state.selectedSenseId);if(!r||!s)return;
      if(!s.meaningZh?.trim()||!s.exampleEn?.trim()){state.addDraft=JSON.parse(JSON.stringify(s));toast("保存前请补全中文释义和英文例句");render();return;}''',
'''    if(action==="save-card"){
      const r=state.lookup?.result;let s=r?.senses.find(x=>x.id===state.selectedSenseId);if(!r||!s)return;
      s=await prepareLookupForSave(r,s);
      if(!s.meaningZh?.trim()||!s.exampleEn?.trim()){state.addDraft=JSON.parse(JSON.stringify(s));toast("保存前请补全中文释义和英文例句");render();return;}''','save-card preflight')
s=replace_once(s,
'''  window.addEventListener("lexiflow:examples-hydrated", event => {
    const detail=event.detail||{};
    const word=String(detail.word||"").trim().toLowerCase();
    const senses=Array.isArray(detail.senses)?detail.senses:[];
    if(!word||!senses.length)return;
    let changed=false;''',
'''  window.addEventListener("lexiflow:examples-hydrated", event => {
    const detail=event.detail||{};
    const word=String(detail.word||"").trim().toLowerCase();
    const senses=Array.isArray(detail.senses)?detail.senses:[];
    if(!word||!senses.length)return;
    const lookupChanged=mergeActiveLookupHydration(detail);
    let changed=false;''','active lookup hydration listener')
s=replace_once(s,
'    if(changed){saveData();render();}\n  });',
'    if(changed)saveData();\n    if(changed||lookupChanged)render();\n  });','hydration rerender')
write(rel,s)

# 5) Regression contracts.
rel="scripts/check-dictionary-payload-bridge-v3.js"
s=read(rel)
s=replace_once(s,
'const read=name=>fs.readFileSync(path.join(root,name),"utf8");',
'const read=name=>fs.readFileSync(path.join(root,name),"utf8");\nconst {normalizePhonetic}=require("../lib/ecdict");','ecdict test import')
s=replace_once(s,
'(async()=>{',
'''assert.strictEqual(normalizePhonetic(",selfə'ʃuəd; ?(@)-'?rd"),"/ˌselfəˈʃuəd/","ECDICT must keep the clean IPA candidate and discard garbled alternates");

(async()=>{''','ecdict phonetic regression')
write(rel,s)

rel="scripts/check-user-surface-v4.js"
s=read(rel)
s=replace_once(s,
'assert(app.includes("normalizedDiff")&&app.includes("targetWordForms(head)"),"phrase result UX must hide identical auto-resolution and accept inflected phrase examples");',
'''assert(app.includes("normalizedDiff")&&app.includes("targetWordForms(head)"),"phrase result UX must hide identical auto-resolution and accept inflected phrase examples");
assert(app.includes("prepareLookupForSave")&&app.includes("mergeActiveLookupHydration"),"lookup save must await hydrated examples/pronunciation and merge them into active state");
assert(runtime.includes("ensureWholePhrasePhonetic")&&runtime.includes("await ensureWholePhrasePhonetic(localPhraseResult"),"phrase responses must carry a complete phonetic before they reach the UI");
assert(hydration.includes("shouldAdoptPhonetic")&&hydration.includes("phoneticSourceRank"),"low-quality phonetic hydration must not overwrite an existing authoritative transcription");''','user surface integrity assertions')
write(rel,s)

print("V7 card integrity repair staged.")
