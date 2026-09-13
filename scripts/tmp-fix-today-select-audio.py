from pathlib import Path
import re

root=Path(__file__).resolve().parents[1]
app=root/'public/app.js'
today=root/'public/today-plan-v3.js'
select=root/'public/select-stage-v3.js'
check_today=root/'scripts/check-today-plan-v3.js'
check_stage=root/'scripts/check-stage-renderers-v3.js'

app_text=app.read_text(encoding='utf-8')
today_text=today.read_text(encoding='utf-8')
select_text=select.read_text(encoding='utf-8')
ct=check_today.read_text(encoding='utf-8')
cs=check_stage.read_text(encoding='utf-8')

# 1) Today-origin add intent: direct creation should occupy today's Select slot.
old='''  function bind(){\n    document.querySelectorAll("[data-route]").forEach(el=>el.addEventListener("click",()=>{\n      state.route=el.dataset.route;\n      if(state.route!=="library-edit") state.libraryEditor=null;\n      if(state.route!=="study") state.study=null;\n      render();\n    }));'''
new='''  function bind(){\n    document.querySelectorAll("[data-route]").forEach(el=>el.addEventListener("click",()=>{\n      state.route=el.dataset.route;\n      if(state.route!=="add"){try{sessionStorage.removeItem("lexiflow:add-intent-v3");}catch{}}\n      if(state.route!=="library-edit") state.libraryEditor=null;\n      if(state.route!=="study") state.study=null;\n      render();\n    }));'''
if old not in app_text: raise SystemExit('bind anchor missing')
app_text=app_text.replace(old,new,1)

pattern=re.compile(r'''      const card=\{id:uid\(\),word:r\.word,phonetic:r\.phonetic,audioUrl:r\.audioUrl\|\|"",audioUrls:Array\.isArray\(r\.audioUrls\)\?r\.audioUrls:\[\],pronunciationSource:r\.pronunciationSource\|\|"",pos:s\.pos,meaningZh:s\.meaningZh,exampleEn:s\.exampleEn,exampleZh:s\.exampleZh\|\|"",exampleTranslationPending:!s\.exampleZh\?\.trim\(\),senseIntentEn:s\.senseIntentEn\|\|"",avoidVisualEn:Array\.isArray\(s\.avoidVisualEn\)\?s\.avoidVisualEn:\[\],sourceQuery:r\.sourceQuery\|\|state\.lookup\?\.query\|\|r\.word,stage:"select",createdAt:now,updatedAt:now,reviewCount:0,nextReviewAt:null,memoryHistory:\[\],visualNote:"",imageData:null,userSentence:""\};\n      state\.data\.cards\.unshift\(card\);recordActivity\("card-created",card\.id\);toast\("卡片已保存，已进入学习流程"\);state\.lookup=null;state\.selectedSenseId=null;state\.route="home";render\(\);return;''')
replacement='''      const card={id:uid(),word:r.word,phonetic:r.phonetic,audioUrl:r.audioUrl||"",audioUrls:Array.isArray(r.audioUrls)?r.audioUrls:[],pronunciationSource:r.pronunciationSource||"",pos:s.pos,meaningZh:s.meaningZh,exampleEn:s.exampleEn,exampleZh:s.exampleZh||"",exampleTranslationPending:!s.exampleZh?.trim(),senseIntentEn:s.senseIntentEn||"",avoidVisualEn:Array.isArray(s.avoidVisualEn)?s.avoidVisualEn:[],sourceQuery:r.sourceQuery||state.lookup?.query||r.word,stage:"select",createdAt:now,updatedAt:now,reviewCount:0,nextReviewAt:null,memoryHistory:[],visualNote:"",imageData:null,userSentence:""};\n      let addIntent=null;\n      try{addIntent=JSON.parse(sessionStorage.getItem("lexiflow:add-intent-v3")||"null");}catch{}\n      const activePlan=state.data.dailyPlan?.date===todayKey()?state.data.dailyPlan:window.LexiFlowLearningCore?.buildDailyPlan?.(state.data);\n      const fromToday=addIntent?.source==="today"&&addIntent?.date===todayKey()&&Number(activePlan?.remainingSelectSlots||0)>0;\n      if(fromToday){\n        card.inboxPending=false;\n        card.todaySelectedOn=todayKey();\n        card.selectedOn=todayKey();\n        card.stageEligibleOn=now;\n        card.inboxSelectedAt=now;\n      }else{\n        card.inboxPending=true;\n        card.inboxAddedOn=todayKey();\n      }\n      try{sessionStorage.removeItem("lexiflow:add-intent-v3");}catch{}\n      state.data.cards.unshift(card);recordActivity("card-created",card.id);\n      state.lookup=null;state.selectedSenseId=null;\n      if(fromToday){toast("已加入今日学习");startStudy(card.id);return;}\n      toast("已保存到单词库 · 待学习");state.route="home";render();return;'''
app_text,n=pattern.subn(replacement,app_text,count=1)
if n!=1: raise SystemExit(f'save-card anchor matches={n}')

# 2) Expose the exact same pronunciation resolver used by lookup/library cards.
anchor='''  async function speak(word,audioUrl="",audioUrls=[]){'''
pos=app_text.find(anchor)
if pos<0: raise SystemExit('speak function missing')
# inject bridge after function by locating next known function boundary
next_anchor='''\n  function formatPhonetic'''
end=app_text.find(next_anchor,pos)
if end<0: raise SystemExit('formatPhonetic boundary missing')
block=app_text[pos:end]
if 'LexiFlowPronunciationV3' not in block:
    block=block.rstrip()+'''\n\n  window.LexiFlowPronunciationV3=Object.freeze({\n    play:(text,audioUrl="",audioUrls=[])=>speak(text,audioUrl,audioUrls)\n  });\n'''
    app_text=app_text[:pos]+block+app_text[end:]

# Today plan marks navigation origin and presents the right save action.
old='''    if(save&&!document.querySelector(".study-card-focus")){setText(save,"保存到单词库");save.title="保存后会出现在单词库的“待学习”中，由你决定哪天加入 Today";}'''
new='''    if(save&&!document.querySelector(".study-card-focus")){\n      let intent=null;try{intent=JSON.parse(sessionStorage.getItem("lexiflow:add-intent-v3")||"null");}catch{}\n      const fromToday=intent?.source==="today"&&intent?.date===core.dayKey(new Date());\n      setText(save,fromToday?"保存并确认词义":"保存到单词库");\n      save.title=fromToday?"保存后直接进入今天的词义确认":"保存后会出现在单词库的“待学习”中，由你决定哪天加入 Today";\n    }'''
if old not in today_text: raise SystemExit('decorateAdd anchor missing')
today_text=today_text.replace(old,new,1)

old='''    const appRoute=document.querySelector(`.nav [data-route="${CSS.escape(route)}"]`);\n    if(!appRoute||appRoute===routeButton)return false;\n    appRoute.click();'''
new='''    const appRoute=document.querySelector(`.nav [data-route="${CSS.escape(route)}"]`);\n    if(!appRoute||appRoute===routeButton)return false;\n    if(route==="add"){\n      try{sessionStorage.setItem("lexiflow:add-intent-v3",JSON.stringify({source:"today",date:core.dayKey(new Date()),at:Date.now()}));}catch{}\n    }\n    appRoute.click();'''
if old not in today_text: raise SystemExit('routeDynamic anchor missing')
today_text=today_text.replace(old,new,1)

# 3) Select renderer uses the shared resolver and adds example audio.
select_text=select_text.replace('.lexi-select-v3-example{padding-top:11px;border-top:1px solid var(--line);line-height:1.65}', '.lexi-select-v3-example{padding-top:11px;border-top:1px solid var(--line);line-height:1.65}.lexi-select-v3-example-line{display:flex;align-items:flex-start;gap:8px}.lexi-select-v3-example-line>div{flex:1}.lexi-select-v3-example button{border:0;background:transparent;cursor:pointer;font-size:15px;padding:1px 3px}')
old='''${card.exampleEn?`<div class="lexi-select-v3-example"><div>${esc(card.exampleEn)}</div>${card.exampleZh?`<p>${esc(card.exampleZh)}</p>`:""}</div>`:""}'''
new='''${card.exampleEn?`<div class="lexi-select-v3-example"><div class="lexi-select-v3-example-line"><div>${esc(card.exampleEn)}</div><button type="button" data-select-v3="speak-example" aria-label="播放例句">🔊</button></div>${card.exampleZh?`<p>${esc(card.exampleZh)}</p>`:""}</div>`:""}'''
if old not in select_text: raise SystemExit('example html anchor missing')
select_text=select_text.replace(old,new,1)

pattern=re.compile(r'''  async function speak\(\)\{.*?\n  \}\n\n  document\.addEventListener\("click",event=>\{\n    const button=event\.target\?\.closest\?\.\('\[data-select-v3="speak"\]'\);\n    if\(!button\)return;\n    event\.preventDefault\(\);event\.stopImmediatePropagation\(\);void speak\(\);\n  \},true\);''',re.S)
replacement='''  async function speakTarget(text,audioUrl="",audioUrls=[]){\n    const player=window.LexiFlowPronunciationV3?.play;\n    if(typeof player==="function"){try{if(await player(text,audioUrl,audioUrls))return true;}catch{}}\n    try{const utterance=new SpeechSynthesisUtterance(text);utterance.lang="en-US";speechSynthesis.cancel();speechSynthesis.speak(utterance);return true;}catch{return false;}\n  }\n\n  document.addEventListener("click",event=>{\n    const button=event.target?.closest?.('[data-select-v3]');\n    if(!button)return;\n    const card=currentCard();if(!card)return;\n    if(button.dataset.selectV3==="speak"){event.preventDefault();event.stopImmediatePropagation();void speakTarget(card.word,card.audioUrl||"",Array.isArray(card.audioUrls)?card.audioUrls:[]);return;}\n    if(button.dataset.selectV3==="speak-example"&&card.exampleEn){event.preventDefault();event.stopImmediatePropagation();void speakTarget(card.exampleEn);}\n  },true);'''
select_text,n=pattern.subn(replacement,select_text,count=1)
if n!=1: raise SystemExit(f'select speak block matches={n}')

# Regression contracts.
ct += '''\nassert(source.includes('sessionStorage.setItem("lexiflow:add-intent-v3"'),"Today add action must mark a one-shot Today-origin add intent");\nassert(source.includes('保存并确认词义'),"Today-origin card creation must explain that it goes straight to Select confirmation");\n'''
cs += '''\nassert(select.includes("LexiFlowPronunciationV3?.play"),"Select must reuse the same pronunciation resolver as lookup/library surfaces");\nassert(select.includes('data-select-v3="speak-example"'),"Select reference example must expose pronunciation playback");\nassert(select.includes("card.audioUrl")&&select.includes("card.audioUrls"),"Select target-word playback must reuse persisted dictionary audio before TTS fallback");\n'''

# App-level assertions embedded in an existing check to prevent triple-confirm flow returning.
ct += '''\nconst appSource=read("public/app.js");\nassert(appSource.includes('addIntent?.source==="today"')&&appSource.includes("startStudy(card.id)"),"Today-origin card creation must enter Select directly after saving instead of requiring Library confirmation");\nassert(appSource.includes("LexiFlowPronunciationV3=Object.freeze"),"app shell must expose one shared pronunciation resolver for all learning surfaces");\n'''

app.write_text(app_text,encoding='utf-8')
today.write_text(today_text,encoding='utf-8')
select.write_text(select_text,encoding='utf-8')
check_today.write_text(ct,encoding='utf-8')
check_stage.write_text(cs,encoding='utf-8')

# Final invariants.
for needle in ['addIntent?.source==="today"','startStudy(card.id)','LexiFlowPronunciationV3=Object.freeze']:
    if needle not in app_text: raise SystemExit('missing app invariant '+needle)
for needle in ['lexiflow:add-intent-v3','保存并确认词义']:
    if needle not in today_text: raise SystemExit('missing today invariant '+needle)
for needle in ['speak-example','LexiFlowPronunciationV3?.play','card.audioUrl','card.audioUrls']:
    if needle not in select_text: raise SystemExit('missing select invariant '+needle)
print('today-select-audio migration applied')
