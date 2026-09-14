from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old,new,1)

# --- app.js ---
app_path=ROOT/'public/app.js'
app=app_path.read_text(encoding='utf-8')
app=replace_once(app,'    addDraft: null,\n    study: null,','    addDraft: null,\n    addToTodayIntent: null,\n    study: null,','app state addToTodayIntent')

old='''  async function speakSentence(sentence){\n    const text=String(sentence||"\\").trim();\n    if(!text)return;\n    if(await playNaturalTts(text))return;\n    toast("当前没有可用的自然例句发音，请稍后重试");\n  }\n'''.replace('"\\"','""')
new=old+'''\n  window.LexiFlowPronunciationV3=Object.freeze({\n    playWord(word,{audioUrl="",audioUrls=[]}={}){return speak(word,audioUrl,audioUrls);},\n    playSentence(sentence){return speakSentence(sentence);}\n  });\n'''
app=replace_once(app,old,new,'pronunciation bridge')

old='''  window.LexiFlowStudyRenderer=Object.freeze({\n    openCard(cardId){return startStudy(String(cardId||""));},\n    currentCardId(){return state.route==="study"?String(state.study?.cardId||""):"";},\n    hasCard(cardId){return Boolean(getCard(String(cardId||"")));}\n  });\n'''
new=old+'''\n\n  function openAddFromToday(){\n    const core=window.LexiFlowLearningCore;\n    const plan=state.data.dailyPlan||core?.buildDailyPlan?.(state.data,new Date());\n    if(Number(plan?.remainingSelectSlots||0)<=0){toast("今天的新词已经选满");return false;}\n    state.addToTodayIntent=todayKey();\n    state.route="add";\n    state.study=null;\n    render();\n    return true;\n  }\n\n  window.LexiFlowAddFlowV3=Object.freeze({\n    openForToday:openAddFromToday,\n    isAddingForToday(){return state.route==="add"&&state.addToTodayIntent===todayKey();}\n  });\n'''
app=replace_once(app,old,new,'today add flow bridge')

old='''    document.querySelectorAll("[data-route]").forEach(el=>el.addEventListener("click",()=>{\n      state.route=el.dataset.route;\n      if(state.route!=="library-edit") state.libraryEditor=null;\n      if(state.route!=="study") state.study=null;\n      render();\n    }));\n'''
new='''    document.querySelectorAll("[data-route]").forEach(el=>el.addEventListener("click",()=>{\n      state.addToTodayIntent=null;\n      state.route=el.dataset.route;\n      if(state.route!=="library-edit") state.libraryEditor=null;\n      if(state.route!=="study") state.study=null;\n      render();\n    }));\n'''
app=replace_once(app,old,new,'explicit navigation clears today add intent')

old='''      const now=new Date().toISOString();\n      const card={id:uid(),word:r.word,phonetic:r.phonetic,audioUrl:r.audioUrl||"",audioUrls:Array.isArray(r.audioUrls)?r.audioUrls:[],pronunciationSource:r.pronunciationSource||"",pos:s.pos,meaningZh:s.meaningZh,exampleEn:s.exampleEn,exampleZh:s.exampleZh||"",exampleTranslationPending:!s.exampleZh?.trim(),senseIntentEn:s.senseIntentEn||"",avoidVisualEn:Array.isArray(s.avoidVisualEn)?s.avoidVisualEn:[],sourceQuery:r.sourceQuery||state.lookup?.query||r.word,stage:"select",createdAt:now,updatedAt:now,reviewCount:0,nextReviewAt:null,memoryHistory:[],visualNote:"",imageData:null,userSentence:""};\n      state.data.cards.unshift(card);recordActivity("card-created",card.id);toast("卡片已保存，已进入学习流程");state.lookup=null;state.selectedSenseId=null;state.route="home";render();return;\n'''
new='''      const nowDate=new Date(),now=nowDate.toISOString();\n      const core=window.LexiFlowLearningCore;\n      const requestedToday=state.addToTodayIntent===todayKey(nowDate);\n      const currentPlan=state.data.dailyPlan||core?.buildDailyPlan?.(state.data,nowDate);\n      const addToToday=requestedToday&&Number(currentPlan?.remainingSelectSlots||0)>0;\n      const card={id:uid(),word:r.word,phonetic:r.phonetic,audioUrl:r.audioUrl||"",audioUrls:Array.isArray(r.audioUrls)?r.audioUrls:[],pronunciationSource:r.pronunciationSource||"",pos:s.pos,meaningZh:s.meaningZh,exampleEn:s.exampleEn,exampleZh:s.exampleZh||"",exampleTranslationPending:!s.exampleZh?.trim(),senseIntentEn:s.senseIntentEn||"",avoidVisualEn:Array.isArray(s.avoidVisualEn)?s.avoidVisualEn:[],sourceQuery:r.sourceQuery||state.lookup?.query||r.word,stage:"select",learningStage:"select",inboxPending:!addToToday,createdAt:now,updatedAt:now,reviewCount:0,nextReviewAt:null,memoryHistory:[],visualNote:"",imageData:null,userSentence:""};\n      if(addToToday){\n        card.inboxPending=false;\n        card.todaySelectedOn=todayKey(nowDate);\n        card.selectedOn=todayKey(nowDate);\n        card.inboxSelectedAt=now;\n        const prev={...card,learningStage:"select"};\n        card.stage="memorize";\n        card.learningStage="memorize";\n        Object.assign(card,core?.crossDayPatch?.(prev,{stage:"memorize",learningStage:"memorize"},nowDate)||{});\n      }\n      state.data.cards.unshift(card);\n      state.data.activities.push({id:uid(),type:"card-created",cardId:card.id,at:now,authority:"app-shell-v1"});\n      if(addToToday)state.data.activities.push({id:uid(),type:"stage-complete",cardId:card.id,stage:"select",nextStage:"memorize",at:now,authority:"add-to-today-v1"});\n      saveData();\n      toast(addToToday?"已加入今天的新词 · 明天开始记忆":"已保存到单词库 · 待学习");\n      state.addToTodayIntent=null;state.lookup=null;state.selectedSenseId=null;state.route="home";render();return;\n'''
app=replace_once(app,old,new,'save-card direct today flow')

app_path.write_text(app,encoding='utf-8')

# --- today-plan-v3.js ---
tp_path=ROOT/'public/today-plan-v3.js'
tp=tp_path.read_text(encoding='utf-8')
tp=replace_once(tp,'if(Number(plan.remainingSelectSlots||0)>0&&!(latestData?.cards||[]).length)return `<button class="btn primary" data-route="add">添加第一个单词</button>`;','if(Number(plan.remainingSelectSlots||0)>0&&!(latestData?.cards||[]).length)return `<button class="btn primary" data-tp-add-today="1">添加第一个单词</button>`;','first today add button')
tp=replace_once(tp,'if(Number(plan.remainingSelectSlots||0)>0)return `<button class="btn primary" data-route="add">继续添加新词</button>`;','if(Number(plan.remainingSelectSlots||0)>0)return `<button class="btn primary" data-tp-add-today="1">继续添加新词</button>`;','subsequent today add button')

old='''  function decorateAdd(){\n    const save=document.querySelector('[data-action="save-card"].save-learning-card,[data-action="save-card"]');\n    if(save&&!document.querySelector(".study-card-focus")){setText(save,"保存到单词库");save.title="保存后会出现在单词库的“待学习”中，由你决定哪天加入 Today";}\n    Array.from(document.querySelectorAll("h1,h2")).forEach(node=>{if(["选词制卡","查词并收集"].includes(node.textContent.trim()))setText(node,"查词并添加");});\n    document.querySelectorAll(".toast").forEach(node=>{if(node.textContent.includes("卡片已保存")||node.textContent.includes("已加入收集箱"))setText(node,"已保存到单词库 · 待学习");});\n  }\n'''
new='''  function decorateAdd(){\n    const save=document.querySelector('[data-action="save-card"].save-learning-card,[data-action="save-card"]');\n    const fromToday=Boolean(window.LexiFlowAddFlowV3?.isAddingForToday?.());\n    if(save&&!document.querySelector(".study-card-focus")){\n      setText(save,fromToday?"确认这个词义并加入今天":"保存到单词库");\n      save.title=fromToday?"保存这个词义并计入今天的新词；明天开始主动记忆":"保存后会出现在单词库的“待学习”中，由你决定哪天加入 Today";\n    }\n    Array.from(document.querySelectorAll("h1,h2")).forEach(node=>{if(["选词制卡","查词并收集"].includes(node.textContent.trim()))setText(node,fromToday?"选择今天的新词":"查词并添加");});\n    if(!fromToday)document.querySelectorAll(".toast").forEach(node=>{if(node.textContent.includes("卡片已保存")||node.textContent.includes("已加入收集箱"))setText(node,"已保存到单词库 · 待学习");});\n  }\n'''
tp=replace_once(tp,old,new,'decorate add context')

marker='''  function start(){\n'''
listener='''  document.addEventListener("click",event=>{\n    const button=event.target?.closest?.("[data-tp-add-today]");\n    if(!button)return;\n    event.preventDefault();\n    event.stopImmediatePropagation();\n    window.LexiFlowAddFlowV3?.openForToday?.();\n  },true);\n\n'''
if listener not in tp:
    tp=replace_once(tp,marker,listener+marker,'today add delegated action')
tp_path.write_text(tp,encoding='utf-8')

# --- select-stage-v3.js ---
sel_path=ROOT/'public/select-stage-v3.js'
sel=sel_path.read_text(encoding='utf-8')
old_css='.lexi-select-v3-example{padding-top:11px;border-top:1px solid var(--line);line-height:1.65}.lexi-select-v3-example p{margin:4px 0 0;color:var(--muted)}'
new_css='.lexi-select-v3-example{padding-top:11px;border-top:1px solid var(--line);line-height:1.65}.lexi-select-v3-example-line{display:flex;align-items:center;gap:8px}.lexi-select-v3-example-line .sentence-speaker{flex:0 0 auto}.lexi-select-v3-example p{margin:4px 0 0;color:var(--muted)}'
sel=replace_once(sel,old_css,new_css,'select example audio style')
old='''<div class="lexi-select-v3-word"><strong>${esc(card.word)}</strong><button type="button" data-select-v3="speak" aria-label="播放发音">🔊</button></div><div class="lexi-select-v3-meta">${esc(phonetic(card.phonetic))}${card.pos?` · ${esc(card.pos)}`:""}</div></div><div class="lexi-select-v3-answer"><strong>${esc(card.meaningZh||"")}</strong>${card.exampleEn?`<div class="lexi-select-v3-example"><div>${esc(card.exampleEn)}</div>${card.exampleZh?`<p>${esc(card.exampleZh)}</p>`:""}</div>`:""}</div>'''
new='''<div class="lexi-select-v3-word"><strong>${esc(card.word)}</strong><button type="button" class="speaker" data-select-v3="speak-word" aria-label="播放发音">🔊</button></div><div class="lexi-select-v3-meta">${esc(phonetic(card.phonetic))}${card.pos?` · ${esc(card.pos)}`:""}</div></div><div class="lexi-select-v3-answer"><strong>${esc(card.meaningZh||"")}</strong>${card.exampleEn?`<div class="lexi-select-v3-example"><div class="lexi-select-v3-example-line"><span>${esc(card.exampleEn)}</span><button type="button" class="sentence-speaker" data-select-v3="speak-example" aria-label="播放例句">🔊</button></div>${card.exampleZh?`<p>${esc(card.exampleZh)}</p>`:""}</div>`:""}</div>'''
sel=replace_once(sel,old,new,'select word/example audio controls')

old='''  async function speak(){\n    const card=currentCard();if(!card)return;\n    try{if(typeof window.LexiFlowNaturalTts?.play==="function"&&await window.LexiFlowNaturalTts.play(card.word))return;}catch{}\n    try{const utterance=new SpeechSynthesisUtterance(card.word);utterance.lang="en-US";speechSynthesis.cancel();speechSynthesis.speak(utterance);}catch{}\n  }\n\n  document.addEventListener("click",event=>{\n    const button=event.target?.closest?.('[data-select-v3="speak"]');\n    if(!button)return;\n    event.preventDefault();event.stopImmediatePropagation();void speak();\n  },true);\n'''
new='''  async function speakWord(){\n    const card=currentCard();if(!card)return;\n    const bridge=window.LexiFlowPronunciationV3;\n    if(typeof bridge?.playWord==="function"){await bridge.playWord(card.word,{audioUrl:card.audioUrl||"",audioUrls:Array.isArray(card.audioUrls)?card.audioUrls:[]});return;}\n    try{if(typeof window.LexiFlowNaturalTts?.play==="function")await window.LexiFlowNaturalTts.play(card.word);}catch{}\n  }\n\n  async function speakExample(){\n    const card=currentCard();const sentence=String(card?.exampleEn||"").trim();if(!sentence)return;\n    const bridge=window.LexiFlowPronunciationV3;\n    if(typeof bridge?.playSentence==="function"){await bridge.playSentence(sentence);return;}\n    try{if(typeof window.LexiFlowNaturalTts?.play==="function")await window.LexiFlowNaturalTts.play(sentence);}catch{}\n  }\n\n  document.addEventListener("click",event=>{\n    const button=event.target?.closest?.('[data-select-v3]');\n    if(!button)return;\n    const kind=button.dataset.selectV3;\n    if(kind!=="speak-word"&&kind!=="speak-example")return;\n    event.preventDefault();event.stopImmediatePropagation();\n    if(kind==="speak-word")void speakWord();\n    else void speakExample();\n  },true);\n'''
sel=replace_once(sel,old,new,'select unified pronunciation')
sel_path.write_text(sel,encoding='utf-8')

# --- contracts ---
test_path=ROOT/'scripts/check-today-plan-v3.js'
test=test_path.read_text(encoding='utf-8')
anchor='assert(source.includes(\'window.addEventListener("lexiflow:today-plan-data",schedule)\'),"Today writes must trigger an in-memory redraw rather than another GET");\n'
extra='''assert(source.includes('data-tp-add-today="1"'),"Today new-word CTA must use the direct Today add flow instead of routing through Pending");\nassert(source.includes("LexiFlowAddFlowV3?.openForToday?.()"),"Today add CTA must hand off to the explicit app add-flow bridge");\nassert(source.includes('fromToday?"确认这个词义并加入今天":"保存到单词库"'),"Add surface must distinguish Today intent from generic library collection");\n'''
if extra not in test:
    test=replace_once(test,anchor,anchor+extra,'today direct add contract')
test_path.write_text(test,encoding='utf-8')

seltest_path=ROOT/'scripts/check-select-stage-v3.js'
seltest=seltest_path.read_text(encoding='utf-8')
seltest=seltest.replace('assert(select.includes("LexiFlowNaturalTts?.play"),"Select renderer must preserve pronunciation support");','assert(select.includes("LexiFlowPronunciationV3"),"Select renderer must reuse the same pronunciation bridge as lookup/card creation");\nassert(select.includes(\'data-select-v3="speak-example"\'),"Select renderer must provide example-sentence audio");\nassert(select.includes("playSentence(sentence)"),"Select example audio must use the shared sentence pronunciation path");')
seltest_path.write_text(seltest,encoding='utf-8')

# final guards
app=app_path.read_text(encoding='utf-8')
tp=tp_path.read_text(encoding='utf-8')
sel=sel_path.read_text(encoding='utf-8')
assert 'addToTodayIntent' in app and 'authority:"add-to-today-v1"' in app
assert 'LexiFlowPronunciationV3=Object.freeze' in app
assert 'data-tp-add-today="1"' in tp
assert 'data-select-v3="speak-example"' in sel
assert 'SpeechSynthesisUtterance' not in sel
print('V7 add-flow + pronunciation migration applied')
