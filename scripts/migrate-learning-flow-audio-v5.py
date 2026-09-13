from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT/path).read_text(encoding='utf-8')

def write(path,text):
    (ROOT/path).write_text(text,encoding='utf-8')

def replace_once(text,old,new,label):
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    if text.count(old)!=1:
        raise SystemExit(f'anchor not unique: {label} ({text.count(old)})')
    return text.replace(old,new,1)

# 1) App shell: expose one pronunciation resolver and make newly-created cards
# enter today's Select immediately whenever Today still has capacity.
app_path=Path('public/app.js')
app=read(app_path)

speak_anchor='''  async function speakSentence(sentence){\n    const text=String(sentence||"").trim();\n    if(!text)return;\n    if(await playNaturalTts(text))return;\n    toast("当前没有可用的自然例句发音，请稍后重试");\n  }\n'''
speak_new=speak_anchor+'''\n  // Single pronunciation surface shared by lookup cards and learning stages.\n  // Word playback keeps the same真人音频 -> natural TTS priority everywhere;\n  // example sentences always use the same natural-TTS resolver.\n  window.LexiFlowPronunciationV3=Object.freeze({\n    word(text,audioUrl="",audioUrls=[]){return speak(text,audioUrl,audioUrls);},\n    sentence(text){return speakSentence(text);}\n  });\n'''
app=replace_once(app,speak_anchor,speak_new,'shared pronunciation bridge')

pattern=re.compile(r'''    if\(action==="save-card"\)\{.*?\n    \}\n    if\(action==="continue-learning"\)\{''',re.S)
match=pattern.search(app)
if not match:
    raise SystemExit('missing save-card action block')
replacement='''    if(action==="save-card"){\n      const r=state.lookup?.result,s=r?.senses.find(x=>x.id===state.selectedSenseId);if(!r||!s)return;\n      if(!s.meaningZh?.trim()||!s.exampleEn?.trim()){state.addDraft=JSON.parse(JSON.stringify(s));toast("保存前请补全中文释义和英文例句");render();return;}\n      if(!learningExampleUsesTarget(s.exampleEn,r.word)){\n        showNotice("这张卡片还不能保存",`例句没有使用当前目标词“${r.word}”。请重新识别结果，或修改例句后再保存。`,"warn");\n        return;\n      }\n      const exists=state.data.cards.find(c=>c.word.toLowerCase()===r.word.toLowerCase()&&c.meaningZh===s.meaningZh);\n      if(exists){toast("这张义项卡已经存在");return;}\n\n      // If Today still has a new-word slot, creating the card is itself the\n      // selection action: skip the Library round-trip and open Select directly.\n      // When Today is full, preserve the Pending Library behavior.\n      const todayPlan=currentDailyPlan()||window.LexiFlowTodayPlanV3?.current?.();\n      const remainingSlots=Math.max(0,Number(todayPlan?.remainingSelectSlots||0));\n      const startToday=remainingSlots>0;\n      const nowDate=new Date(),now=nowDate.toISOString(),today=todayKey(nowDate);\n      const card={\n        id:uid(),word:r.word,phonetic:r.phonetic,audioUrl:r.audioUrl||"",audioUrls:Array.isArray(r.audioUrls)?r.audioUrls:[],pronunciationSource:r.pronunciationSource||"",\n        pos:s.pos,meaningZh:s.meaningZh,exampleEn:s.exampleEn,exampleZh:s.exampleZh||"",exampleTranslationPending:!s.exampleZh?.trim(),\n        senseIntentEn:s.senseIntentEn||"",avoidVisualEn:Array.isArray(s.avoidVisualEn)?s.avoidVisualEn:[],sourceQuery:r.sourceQuery||state.lookup?.query||r.word,\n        stage:"select",learningStage:"select",inboxPending:!startToday,inboxAddedOn:today,todaySelectedOn:startToday?today:null,\n        stageEligibleOn:startToday?now:null,inboxSelectedAt:startToday?now:null,\n        createdAt:now,updatedAt:now,reviewCount:0,nextReviewAt:null,memoryHistory:[],visualNote:"",imageData:null,userSentence:""\n      };\n      state.data.cards.unshift(card);\n      state.data.activities.push({id:uid(),type:"card-created",cardId:card.id,at:now,todaySelected:startToday,authority:"app-shell-v1"});\n      saveData();\n      await persistenceQueue.catch(()=>{});\n      state.lookup=null;state.selectedSenseId=null;state.addDraft=null;\n      if(startToday){\n        toast("词卡已保存 · 确认这个词义后完成今天的选词");\n        startStudy(card.id);\n      }else{\n        toast("今天的新词名额已满 · 已保存到单词库");\n        state.route="home";render();\n      }\n      return;\n    }\n    if(action==="continue-learning"){'''
app=app[:match.start()]+replacement+app[match.end():]
write(app_path,app)

# 2) Today decorator: the Add page must tell the truth about what Save will do.
today_path=Path('public/today-plan-v3.js')
today=read(today_path)
old='''  function decorateAdd(){\n    const save=document.querySelector('[data-action="save-card"].save-learning-card,[data-action="save-card"]');\n    if(save&&!document.querySelector(".study-card-focus")){setText(save,"保存到单词库");save.title="保存后会出现在单词库的“待学习”中，由你决定哪天加入 Today";}\n    Array.from(document.querySelectorAll("h1,h2")).forEach(node=>{if(["选词制卡","查词并收集"].includes(node.textContent.trim()))setText(node,"查词并添加");});\n    document.querySelectorAll(".toast").forEach(node=>{if(node.textContent.includes("卡片已保存")||node.textContent.includes("已加入收集箱"))setText(node,"已保存到单词库 · 待学习");});\n  }\n'''
new='''  function decorateAdd(){\n    const save=document.querySelector('[data-action="save-card"].save-learning-card,[data-action="save-card"]');\n    if(save&&!document.querySelector(".study-card-focus")){\n      const plan=latestData?.dailyPlan||null;\n      const hasTodaySlot=Number(plan?.remainingSelectSlots||0)>0;\n      setText(save,hasTodaySlot?"保存并确认词义":"保存到单词库");\n      save.title=hasTodaySlot?"保存后直接进入今天的词义确认":"今天的新词名额已满，保存为待学习词";\n    }\n    Array.from(document.querySelectorAll("h1,h2")).forEach(node=>{if(["选词制卡","查词并收集"].includes(node.textContent.trim()))setText(node,"查词并添加");});\n  }\n'''
today=replace_once(today,old,new,'Today Add decorator')
write(today_path,today)

# 3) Select: use the same pronunciation authority as the lookup card and make
# example playback visually explicit.
select_path=Path('public/select-stage-v3.js')
select=read(select_path)
select=replace_once(
    select,
    '.lexi-select-v3-example-line button{border:0;background:transparent;cursor:pointer;font-size:16px;line-height:1.4}',
    '.lexi-select-v3-example-line button{border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:5px 9px;cursor:pointer;font-size:12px;line-height:1.4;white-space:nowrap}',
    'Select example speaker style'
)
select=replace_once(
    select,
    '<button type="button" data-select-v3="speak-example" aria-label="播放例句">🔊</button>',
    '<button type="button" data-select-v3="speak-example" aria-label="播放例句" title="播放例句">🔊 例句</button>',
    'Select example speaker label'
)
old_audio='''  async function playAudio(src){\n    return new Promise((resolve,reject)=>{const audio=new Audio(src);audio.onended=resolve;audio.onerror=reject;audio.play().catch(reject);});\n  }\n\n  async function speakWord(){\n    const card=currentCard();if(!card)return;\n    const segments=[];\n    if(card.audioUrl)segments.push(card.audioUrl);\n    if(Array.isArray(card.audioUrls))segments.push(...card.audioUrls);\n    if(segments.length){\n      try{for(const src of Array.from(new Set(segments.filter(Boolean))))await playAudio(src);return;}catch{}\n    }\n    try{if(typeof window.LexiFlowNaturalTts?.play==="function")await window.LexiFlowNaturalTts.play(card.word);}catch{}\n  }\n\n  async function speakExample(){\n    const card=currentCard();if(!card?.exampleEn)return;\n    try{if(typeof window.LexiFlowNaturalTts?.play==="function")await window.LexiFlowNaturalTts.play(card.exampleEn);}catch{}\n  }\n'''
new_audio='''  async function speakWord(){\n    const card=currentCard();if(!card)return;\n    const shared=window.LexiFlowPronunciationV3;\n    if(typeof shared?.word==="function"){await shared.word(card.word,card.audioUrl||"",Array.isArray(card.audioUrls)?card.audioUrls:[]);return;}\n    try{if(typeof window.LexiFlowNaturalTts?.play==="function")await window.LexiFlowNaturalTts.play(card.word);}catch{}\n  }\n\n  async function speakExample(){\n    const card=currentCard();if(!card?.exampleEn)return;\n    const shared=window.LexiFlowPronunciationV3;\n    if(typeof shared?.sentence==="function"){await shared.sentence(card.exampleEn);return;}\n    try{if(typeof window.LexiFlowNaturalTts?.play==="function")await window.LexiFlowNaturalTts.play(card.exampleEn);}catch{}\n  }\n'''
select=replace_once(select,old_audio,new_audio,'Select shared pronunciation')
write(select_path,select)

# 4) Strengthen existing regression gates instead of adding another standalone suite.
check_select_path=Path('scripts/check-select-stage-v3.js')
check_select=read(check_select_path)
check_select=replace_once(check_select,'const select=read("public/select-stage-v3.js");\nconst transition=read("public/stage-transition-v3.js");','const app=read("public/app.js");\nconst select=read("public/select-stage-v3.js");\nconst transition=read("public/stage-transition-v3.js");','Select test app source')
check_select=replace_once(check_select,'assert(select.includes("LexiFlowNaturalTts?.play"),"Select renderer must preserve pronunciation support");','assert(app.includes("LexiFlowPronunciationV3=Object.freeze"),"app shell must expose one shared pronunciation resolver");\nassert(select.includes("LexiFlowPronunciationV3"),"Select renderer must use the same pronunciation resolver as lookup cards");\nassert(select.includes(\'data-select-v3="speak-example"\')&&select.includes("🔊 例句"),"Select card must visibly expose example-sentence playback");\nassert(!select.includes("new Audio("),"Select renderer must not own a second audio-source resolver");','Select test pronunciation contract')
write(check_select_path,check_select)

check_today_path=Path('scripts/check-today-plan-v3.js')
check_today=read(check_today_path)
check_today=replace_once(check_today,'const source=read("public/today-plan-v3.js");','const source=read("public/today-plan-v3.js");\nconst app=read("public/app.js");','Today test app source')
insert='''assert(source.includes('window.addEventListener("lexiflow:today-plan-data",schedule)'),"Today writes must trigger an in-memory redraw rather than another GET");\n'''
extra=insert+'''assert(source.includes('hasTodaySlot?"保存并确认词义":"保存到单词库"'),"Add card CTA must reflect whether the new card can enter Today immediately");\nassert(app.includes("const startToday=remainingSlots>0;"),"new cards must detect Today new-word capacity at save time");\nassert(app.includes("inboxPending:!startToday")&&app.includes("todaySelectedOn:startToday?today:null"),"a newly-created card must skip Pending when Today has capacity");\nassert(app.includes("await persistenceQueue.catch(()=>{});")&&app.includes("startStudy(card.id);"),"Today card creation must persist then open Select directly without a Library round-trip");\n'''
check_today=replace_once(check_today,insert,extra,'Today direct selection regression')
write(check_today_path,check_today)

# Final-state assertions for the guarded migration.
app=read(app_path);today=read(today_path);select=read(select_path)
assert 'LexiFlowPronunciationV3=Object.freeze' in app
assert 'const startToday=remainingSlots>0;' in app
assert 'startStudy(card.id);' in app
assert '保存并确认词义' in today
assert 'LexiFlowPronunciationV3' in select
assert '🔊 例句' in select
assert 'new Audio(' not in select
print('Learning flow + pronunciation migration applied.')
