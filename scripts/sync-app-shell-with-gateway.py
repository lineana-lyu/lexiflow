from pathlib import Path

app_path=Path("public/app.js")
app=app_path.read_text(encoding="utf-8")
anchor='''  let persistenceReady=false;
  let persistenceQueue=Promise.resolve();

  function saveData(){'''
replacement='''  let persistenceReady=false;
  let persistenceQueue=Promise.resolve();

  function syncAppDataFromGateway(snapshot){
    if(!snapshot||!Array.isArray(snapshot.cards))return false;
    state.data=normalizeLearningData(snapshot);
    return true;
  }

  const learningDataGateway=window.LexiFlowLearningDataGatewayV3;
  if(learningDataGateway?.registerAfterPersist){
    learningDataGateway.registerAfterPersist(snapshot=>{syncAppDataFromGateway(snapshot);});
    const current=learningDataGateway.current?.();
    if(current?.cards)syncAppDataFromGateway(current);
  }

  function saveData(){'''
if app.count(anchor)!=1:
    raise SystemExit(f"app persistence anchor count was {app.count(anchor)}")
app=app.replace(anchor,replacement,1)

old_pron='''  async function ensureCardPronunciation(card){
    const existingAudios=Array.isArray(card?.audioUrls)?card.audioUrls.filter(Boolean):[];
    if(!card || card.audioUrl || existingAudios.length || state.pronunciationHydration[card.id]) return;
    state.pronunciationHydration[card.id]="loading";
    try{
      const payload=await api("/api/dictionary/pronunciation",{method:"POST",body:{word:card.word}});
      const phonetic=String(payload.result?.phonetic||"").trim();
      const audioUrl=String(payload.result?.audioUrl||"").trim();
      const audioUrls=Array.isArray(payload.result?.audioUrls)?payload.result.audioUrls.map(String).filter(Boolean):[];
      if(phonetic) card.phonetic=phonetic;
      if(audioUrl && !card.audioUrl) card.audioUrl=audioUrl;
      if(audioUrls.length) card.audioUrls=audioUrls;
      if(payload.result?.pronunciationSource) card.pronunciationSource=String(payload.result.pronunciationSource);
      if(phonetic || audioUrl || audioUrls.length){card.updatedAt=new Date().toISOString();saveData();}
      state.pronunciationHydration[card.id]="done";
      render();
    }catch{
      state.pronunciationHydration[card.id]="failed";
      render();
    }
  }
'''
new_pron='''  async function ensureCardPronunciation(card){
    const cardId=String(card?.id||"");
    const word=String(card?.word||"").trim();
    const existingAudios=Array.isArray(card?.audioUrls)?card.audioUrls.filter(Boolean):[];
    if(!cardId || !word || card.audioUrl || existingAudios.length || state.pronunciationHydration[cardId]) return;
    state.pronunciationHydration[cardId]="loading";
    try{
      const payload=await api("/api/dictionary/pronunciation",{method:"POST",body:{word}});
      const target=getCard(cardId);
      if(!target){state.pronunciationHydration[cardId]="done";return;}
      const phonetic=String(payload.result?.phonetic||"").trim();
      const audioUrl=String(payload.result?.audioUrl||"").trim();
      const audioUrls=Array.isArray(payload.result?.audioUrls)?payload.result.audioUrls.map(String).filter(Boolean):[];
      if(phonetic) target.phonetic=phonetic;
      if(audioUrl && !target.audioUrl) target.audioUrl=audioUrl;
      if(audioUrls.length) target.audioUrls=audioUrls;
      if(payload.result?.pronunciationSource) target.pronunciationSource=String(payload.result.pronunciationSource);
      if(phonetic || audioUrl || audioUrls.length){target.updatedAt=new Date().toISOString();saveData();}
      state.pronunciationHydration[cardId]="done";
      render();
    }catch{
      state.pronunciationHydration[cardId]="failed";
      render();
    }
  }
'''
if app.count(old_pron)!=1:
    raise SystemExit(f"pronunciation hydration block count was {app.count(old_pron)}")
app=app.replace(old_pron,new_pron,1)
for required in [
    "function syncAppDataFromGateway(snapshot)",
    "learningDataGateway.registerAfterPersist",
    "state.data=normalizeLearningData(snapshot)",
    "const target=getCard(cardId);",
    "target.updatedAt=new Date().toISOString();saveData();",
]:
    if required not in app:
        raise SystemExit(f"app/Gateway synchronization contract missing: {required}")
app_path.write_text(app,encoding="utf-8")

check_path=Path("scripts/check-learning-data-gateway-v3.js")
check=check_path.read_text(encoding="utf-8")
read_anchor='const sourceContext=read("public/source-context-v3.js");\n'
app_read='const app=read("public/app.js");\n'
if check.count(read_anchor)!=1:
    raise SystemExit("Gateway check Source Context read anchor not unique")
if app_read not in check:
    check=check.replace(read_anchor,read_anchor+app_read,1)
order_anchor='assert(index.indexOf("learning-data-gateway-v3.js")<index.indexOf("source-context-v3.js"),"Gateway hook API must exist before Source Context registers persistence hooks");'
order_add='''\nassert(index.indexOf("learning-data-gateway-v3.js")<index.indexOf("app.js"),"Gateway hook API must exist before the base app registers confirmed-snapshot synchronization");'''
if check.count(order_anchor)!=1:
    raise SystemExit("Gateway check load-order anchor not unique")
if "base app registers confirmed-snapshot synchronization" not in check:
    check=check.replace(order_anchor,order_anchor+order_add,1)
contract_anchor='assert(sourceContext.includes("pendingDraftCardIds"),"Source Context must track draft attachment until persistence succeeds");'
contract_add='''\nassert(app.includes("learningDataGateway.registerAfterPersist")&&app.includes("state.data=normalizeLearningData(snapshot)"),"base app state must follow Gateway-confirmed persistence so generic full-data saves cannot revive a stale snapshot");\nassert(app.includes("const target=getCard(cardId);")&&app.includes("target.updatedAt=new Date().toISOString();saveData();"),"async pronunciation hydration must re-resolve the current card after awaiting the dictionary service");'''
if check.count(contract_anchor)!=1:
    raise SystemExit("Gateway check app synchronization anchor not unique")
if "generic full-data saves cannot revive a stale snapshot" not in check:
    check=check.replace(contract_anchor,contract_anchor+contract_add,1)
check_path.write_text(check,encoding="utf-8")
