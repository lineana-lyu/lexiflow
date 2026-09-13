from pathlib import Path
import re

root=Path(__file__).resolve().parents[1]


def read(path):
    return (root/path).read_text(encoding='utf-8')

def write(path,text):
    (root/path).write_text(text,encoding='utf-8')

def replace_once(text,old,new,label):
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    if text.count(old)!=1:
        raise SystemExit(f'non-unique anchor: {label} ({text.count(old)})')
    return text.replace(old,new,1)

# 1) Today entry marks Add as an explicit Today-intake flow.
today=read('public/today-plan-v3.js')
old='''    const route=String(routeButton.dataset.route||"").trim();\n    if(!route)return false;\n    const appRoute=document.querySelector(`.nav [data-route="${CSS.escape(route)}"]`);'''
new='''    const route=String(routeButton.dataset.route||"").trim();\n    if(!route)return false;\n    if(route==="add"){\n      try{window.dispatchEvent(new CustomEvent("lexiflow:add-context",{detail:{source:"today-plan",date:core.dayKey(new Date())}}));}catch{}\n    }\n    const appRoute=document.querySelector(`.nav [data-route="${CSS.escape(route)}"]`);'''
today=replace_once(today,old,new,'today route context')
write('public/today-plan-v3.js',today)

# 2) App shell remembers the narrow Add context and persists before opening Select.
app=read('public/app.js')
app=replace_once(app,
'''    searchResolution: null,\n    lookupAlternativesOpen: false,\n  };''',
'''    searchResolution: null,\n    lookupAlternativesOpen: false,\n    addContext: null,\n  };\n\n  window.addEventListener("lexiflow:add-context",event=>{\n    const source=String(event?.detail?.source||"");\n    state.addContext=source==="today-plan"?{source,date:String(event?.detail?.date||todayKey())}:null;\n  });''',
'app add context state')

app=replace_once(app,
'''      .catch(err=>{\n        console.error("learning data save failed",err);\n        if(!state.notice) showNotice("学习进度暂未保存","本机存储暂时不可用，请稍后重试。","error");\n      });\n  }''',
'''      .catch(err=>{\n        console.error("learning data save failed",err);\n        if(!state.notice) showNotice("学习进度暂未保存","本机存储暂时不可用，请稍后重试。","error");\n      });\n    return persistenceQueue;\n  }''',
'saveData promise')

app=replace_once(app,
'''    document.querySelectorAll("[data-route]").forEach(el=>el.addEventListener("click",()=>{\n      state.route=el.dataset.route;\n      if(state.route!=="library-edit") state.libraryEditor=null;''',
'''    document.querySelectorAll("[data-route]").forEach(el=>el.addEventListener("click",()=>{\n      state.route=el.dataset.route;\n      if(state.route!=="add") state.addContext=null;\n      if(state.route!=="library-edit") state.libraryEditor=null;''',
'route clears add context')

# Expose the exact same pronunciation path used by Add/result cards to stage renderers.
match=re.search(r'''  async function speakSentence\(sentence\)\{.*?\n  \}\n''',app,re.S)
if not match:
    raise SystemExit('missing speakSentence function')
if 'LexiFlowPronunciationV3' not in app:
    bridge='''\n  window.LexiFlowPronunciationV3=Object.freeze({\n    playWord:(word,audioUrl="",audioUrls=[])=>speak(word,audioUrl,audioUrls),\n    playSentence:sentence=>speakSentence(sentence),\n  });\n'''
    app=app[:match.end()]+bridge+app[match.end():]

# Replace only the card creation tail. Today-intake cards become part of today's frozen Select bucket immediately.
pattern=re.compile(r'''      const now=new Date\(\)\.toISOString\(\);\n      const card=\{id:uid\(\),word:r\.word,phonetic:r\.phonetic,audioUrl:r\.audioUrl\|\|"",audioUrls:Array\.isArray\(r\.audioUrls\)\?r\.audioUrls:\[\],pronunciationSource:r\.pronunciationSource\|\|"",pos:s\.pos,meaningZh:s\.meaningZh,exampleEn:s\.exampleEn,exampleZh:s\.exampleZh\|\|"",exampleTranslationPending:!s\.exampleZh\?\.trim\(\),senseIntentEn:s\.senseIntentEn\|\|"",avoidVisualEn:Array\.isArray\(s\.avoidVisualEn\)\?s\.avoidVisualEn:\[\],sourceQuery:r\.sourceQuery\|\|state\.lookup\?\.query\|\|r\.word,stage:"select",createdAt:now,updatedAt:now,reviewCount:0,nextReviewAt:null,memoryHistory:\[\],visualNote:"",imageData:null,userSentence:""\};\n      state\.data\.cards\.unshift\(card\);recordActivity\("card-created",card\.id\);toast\("卡片已保存，已进入学习流程"\);state\.lookup=null;state\.selectedSenseId=null;state\.route="home";render\(\);return;''')
replacement='''      const now=new Date().toISOString();\n      const learningCore=window.LexiFlowLearningCore;\n      const plan=state.data.dailyPlan?.date===todayKey()?state.data.dailyPlan:learningCore?.buildDailyPlan?.(learningCore.normalizeData(state.data),new Date());\n      const fromToday=state.addContext?.source==="today-plan"&&state.addContext?.date===todayKey();\n      const joinToday=Boolean(fromToday&&Number(plan?.remainingSelectSlots||0)>0);\n      const card={id:uid(),word:r.word,phonetic:r.phonetic,audioUrl:r.audioUrl||"",audioUrls:Array.isArray(r.audioUrls)?r.audioUrls:[],pronunciationSource:r.pronunciationSource||"",pos:s.pos,meaningZh:s.meaningZh,exampleEn:s.exampleEn,exampleZh:s.exampleZh||"",exampleTranslationPending:!s.exampleZh?.trim(),senseIntentEn:s.senseIntentEn||"",avoidVisualEn:Array.isArray(s.avoidVisualEn)?s.avoidVisualEn:[],sourceQuery:r.sourceQuery||state.lookup?.query||r.word,stage:"select",createdAt:now,updatedAt:now,reviewCount:0,nextReviewAt:null,memoryHistory:[],visualNote:"",imageData:null,userSentence:""};\n      if(joinToday){\n        card.inboxPending=false;\n        card.todaySelectedOn=todayKey();\n        card.selectedOn=todayKey();\n        card.inboxSelectedAt=now;\n        card.stageEligibleOn=now;\n      }\n      state.data.cards.unshift(card);\n      state.data.activities.push({id:uid(),type:"card-created",cardId:card.id,at:now});\n      if(joinToday)state.data.activities.push({id:uid(),type:"library-selected",cardId:card.id,at:now,authority:"today-intake-v4"});\n      await saveData();\n      state.lookup=null;state.selectedSenseId=null;state.addContext=null;state.route="home";\n      if(joinToday){\n        toast("已加入今日学习 · 现在确认词义");\n        render();\n        setTimeout(()=>window.LexiFlowStudySessionV3?.open?.(),0);\n      }else{\n        toast("已保存到单词库 · 待学习");\n        render();\n      }\n      return;'''
app2,count=pattern.subn(lambda m:replacement,app,count=1)
if count!=1:
    raise SystemExit(f'card creation tail replacement count={count}')
app=app2
write('public/app.js',app)

# 3) Select uses the same word resolver and adds sentence playback.
select=read('public/select-stage-v3.js')
select=replace_once(select,
'''.lexi-select-v3-example{padding-top:11px;border-top:1px solid var(--line);line-height:1.65}.lexi-select-v3-example p{margin:4px 0 0;color:var(--muted)}''',
'''.lexi-select-v3-example{padding-top:11px;border-top:1px solid var(--line);line-height:1.65}.lexi-select-v3-example-en{display:flex;align-items:flex-start;gap:8px}.lexi-select-v3-example-en>span{flex:1}.lexi-select-v3-example button{border:0;background:transparent;cursor:pointer;font-size:15px;line-height:1.5;padding:0 2px}.lexi-select-v3-example p{margin:4px 0 0;color:var(--muted)}''',
'select example audio style')

old_html='''    return `<div class="lexi-select-v3" data-select-stage-v3="${esc(card.id)}"><div class="lexi-select-v3-head"><strong>Select · 确认词义</strong><span>确认的是你真正想学、想说的这个意思</span></div><div class="lexi-select-v3-body"><div><div class="lexi-select-v3-word"><strong>${esc(card.word)}</strong><button type="button" data-select-v3="speak" aria-label="播放发音">🔊</button></div><div class="lexi-select-v3-meta">${esc(phonetic(card.phonetic))}${card.pos?` · ${esc(card.pos)}`:""}</div></div><div class="lexi-select-v3-answer"><strong>${esc(card.meaningZh||"")}</strong>${card.exampleEn?`<div class="lexi-select-v3-example"><div>${esc(card.exampleEn)}</div>${card.exampleZh?`<p>${esc(card.exampleZh)}</p>`:""}</div>`:""}</div><div class="lexi-select-v3-actions"><button class="btn primary" type="button" data-action="complete-stage" data-next="memorize">确认这个词义 · 明天开始记忆</button></div></div></div>`;'''
new_html='''    return `<div class="lexi-select-v3" data-select-stage-v3="${esc(card.id)}"><div class="lexi-select-v3-head"><strong>Select · 确认词义</strong><span>确认的是你真正想学、想说的这个意思</span></div><div class="lexi-select-v3-body"><div><div class="lexi-select-v3-word"><strong>${esc(card.word)}</strong><button type="button" data-select-v3="speak-word" aria-label="播放 ${esc(card.word)} 的发音">🔊</button></div><div class="lexi-select-v3-meta">${esc(phonetic(card.phonetic))}${card.pos?` · ${esc(card.pos)}`:""}</div></div><div class="lexi-select-v3-answer"><strong>${esc(card.meaningZh||"")}</strong>${card.exampleEn?`<div class="lexi-select-v3-example"><div class="lexi-select-v3-example-en"><span>${esc(card.exampleEn)}</span><button type="button" data-select-v3="speak-example" aria-label="播放例句">🔊</button></div>${card.exampleZh?`<p>${esc(card.exampleZh)}</p>`:""}</div>`:""}</div><div class="lexi-select-v3-actions"><button class="btn primary" type="button" data-action="complete-stage" data-next="memorize">确认这个词义 · 明天开始记忆</button></div></div></div>`;'''
select=replace_once(select,old_html,new_html,'select html')

pattern_speak=re.compile(r'''  async function speak\(\)\{.*?\n  \}\n\n  document\.addEventListener\("click",event=>\{.*?\n  \},true\);''',re.S)
new_speak='''  async function speakWord(){\n    const card=currentCard();if(!card)return;\n    try{\n      const bridge=window.LexiFlowPronunciationV3;\n      if(typeof bridge?.playWord==="function"){await bridge.playWord(card.word,card.audioUrl||"",Array.isArray(card.audioUrls)?card.audioUrls:[]);return;}\n    }catch{}\n    try{if(typeof window.LexiFlowNaturalTts?.play==="function"&&await window.LexiFlowNaturalTts.play(card.word))return;}catch{}\n    try{const utterance=new SpeechSynthesisUtterance(card.word);utterance.lang="en-US";speechSynthesis.cancel();speechSynthesis.speak(utterance);}catch{}\n  }\n\n  async function speakExample(){\n    const card=currentCard();if(!card?.exampleEn)return;\n    try{\n      const bridge=window.LexiFlowPronunciationV3;\n      if(typeof bridge?.playSentence==="function"){await bridge.playSentence(card.exampleEn);return;}\n    }catch{}\n    try{if(typeof window.LexiFlowNaturalTts?.play==="function"&&await window.LexiFlowNaturalTts.play(card.exampleEn))return;}catch{}\n    try{const utterance=new SpeechSynthesisUtterance(card.exampleEn);utterance.lang="en-US";speechSynthesis.cancel();speechSynthesis.speak(utterance);}catch{}\n  }\n\n  document.addEventListener("click",event=>{\n    const button=event.target?.closest?.('[data-select-v3]');\n    if(!button)return;\n    const action=String(button.dataset.selectV3||"");\n    if(action!=="speak-word"&&action!=="speak-example")return;\n    event.preventDefault();event.stopImmediatePropagation();\n    if(action==="speak-example")void speakExample();else void speakWord();\n  },true);'''
select2,count=pattern_speak.subn(lambda m:new_speak,select,count=1)
if count!=1:
    raise SystemExit(f'select speak replacement count={count}')
select=select2
write('public/select-stage-v3.js',select)

# 4) Strengthen existing checks rather than adding another hidden runtime layer.
check_today=read('scripts/check-today-plan-v3.js')
anchor='''assert(source.includes('authority:"today-plan-v3"'),"Today selection activities must record V3 authority");'''
if anchor not in check_today: raise SystemExit('missing today check anchor')
check_today=check_today.replace(
    anchor,
    anchor+'\nassert(source.includes("lexiflow:add-context")&&source.includes(\'source:"today-plan"\'),"Today Add must mark a direct Today-intake context instead of forcing a Library confirmation round-trip");',
    1
)
write('scripts/check-today-plan-v3.js',check_today)

check_select=read('scripts/check-select-stage-v3.js')
anchor2='''assert(select.includes("LexiFlowNaturalTts?.play"),"Select renderer must preserve pronunciation support");'''
if anchor2 not in check_select: raise SystemExit('missing select check anchor')
check_select=check_select.replace(anchor2,anchor2+'\nassert(select.includes("LexiFlowPronunciationV3")&&select.includes("card.audioUrl")&&select.includes("card.audioUrls"),"Select word pronunciation must reuse the same stored-audio resolver as the Add card");\nassert(select.includes(\'data-select-v3="speak-example"\')&&select.includes("playSentence"),"Select example sentence must expose pronunciation through the shared resolver");',1)
write('scripts/check-select-stage-v3.js',check_select)

# final static invariants
assertions=[
    ('public/app.js','today-intake-v4'),
    ('public/app.js','LexiFlowPronunciationV3'),
    ('public/today-plan-v3.js','lexiflow:add-context'),
    ('public/select-stage-v3.js','data-select-v3="speak-example"'),
]
for path,needle in assertions:
    if needle not in read(path): raise SystemExit(f'missing final invariant {needle} in {path}')

print('V7 intake/pronunciation migration applied.')