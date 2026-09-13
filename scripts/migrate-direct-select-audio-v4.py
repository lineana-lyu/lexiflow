from pathlib import Path
import json

ROOT=Path(__file__).resolve().parents[1]

def read(rel):
    return (ROOT/rel).read_text(encoding='utf-8')

def write(rel,text):
    (ROOT/rel).write_text(text,encoding='utf-8')

def replace_once(text, old, new, label):
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    return text.replace(old,new,1)

# 1) Today Plan: direct-add intent + pending-library pick completes Select immediately.
p='public/today-plan-v3.js'
s=read(p)
s=replace_once(s,
'''  let libraryFilter = "all";\n''',
'''  let libraryFilter = "all";\n  let directAddIntent = false;\n''','today intent state')
s=replace_once(s,
'''  function cardById(id){return latestData?.cards?.find(card=>card.id===id)||null;}\n''',
'''  function cardById(id){return latestData?.cards?.find(card=>card.id===id)||null;}\n  function beginDirectAddIntent(){directAddIntent=true;schedule();}\n  function clearDirectAddIntent(){directAddIntent=false;schedule();}\n  function directAddActive(){return directAddIntent;}\n''','today intent helpers')
s=replace_once(s,
'''  function decorateAdd(){\n    const save=document.querySelector('[data-action="save-card"].save-learning-card,[data-action="save-card"]');\n    if(save&&!document.querySelector(".study-card-focus")){setText(save,"保存到单词库");save.title="保存后会出现在单词库的“待学习”中，由你决定哪天加入 Today";}\n    Array.from(document.querySelectorAll("h1,h2")).forEach(node=>{if(["选词制卡","查词并收集"].includes(node.textContent.trim()))setText(node,"查词并添加");});\n    document.querySelectorAll(".toast").forEach(node=>{if(node.textContent.includes("卡片已保存")||node.textContent.includes("已加入收集箱"))setText(node,"已保存到单词库 · 待学习");});\n  }\n''',
'''  function decorateAdd(){\n    const save=document.querySelector('[data-action="save-card"].save-learning-card,[data-action="save-card"]');\n    if(save&&!document.querySelector(".study-card-focus")){\n      if(directAddIntent){setText(save,"确认词义并加入今日学习");save.title="确认当前义项后直接计入今天的新词，不再经过单词库和二次确认";}\n      else{setText(save,"保存到单词库");save.title="保存后会出现在单词库的“待学习”中，需要时再加入当天学习";}\n    }\n    Array.from(document.querySelectorAll("h1,h2")).forEach(node=>{if(["选词制卡","查词并收集"].includes(node.textContent.trim()))setText(node,directAddIntent?"选择今天的新词":"查词并添加");});\n    document.querySelectorAll(".toast").forEach(node=>{if(node.textContent.includes("卡片已保存")||node.textContent.includes("已加入收集箱"))setText(node,"已保存到单词库 · 待学习");});\n  }\n''','decorate add direct intent')
s=replace_once(s,
'''        if(group==="pending")actions.insertAdjacentHTML("afterbegin",`<button class="btn small lexi-library-today-action" type="button" data-tp-pick="${esc(card.id)}" ${slots<=0?"disabled":""}>${slots>0?"加入今天":"今日已满"}</button>`);\n''',
'''        if(group==="pending")actions.insertAdjacentHTML("afterbegin",`<button class="btn small lexi-library-today-action" type="button" data-tp-pick="${esc(card.id)}" ${slots<=0?"disabled":""}>${slots>0?"确认并加入今天":"今日已满"}</button>`);\n''','pending button copy')
s=replace_once(s,
'''      await persist(next,"library-selected");location.reload();return true;\n''',
'''      await persist(next,"library-selected");\n      const completed=await window.LexiFlowStageTransitionV3?.completeSelectCard?.(id,{direct:true});\n      if(!completed)throw new Error("DIRECT_SELECT_TRANSITION_FAILED");\n      location.reload();return true;\n''','pending direct completion')
s=replace_once(s,
'''    const route=String(routeButton.dataset.route||"").trim();\n    if(!route)return false;\n''',
'''    const route=String(routeButton.dataset.route||"").trim();\n    if(!route)return false;\n    if(route==="add")beginDirectAddIntent();\n''','today add intent activation')
s=replace_once(s,
'''  document.addEventListener("click",event=>{\n    const filter=event.target?.closest?.("[data-library-filter]");''',
'''  document.addEventListener("click",event=>{\n    const navRoute=event.target?.closest?.(".nav [data-route]");\n    if(navRoute)clearDirectAddIntent();\n    const filter=event.target?.closest?.("[data-library-filter]");''','clear stale intent on nav')
s=replace_once(s,
'''    moveBackToPending,\n    current(){return latestData?JSON.parse(JSON.stringify(latestData.dailyPlan||null)):null;}\n''',
'''    moveBackToPending,\n    directAddActive,\n    clearDirectAddIntent,\n    current(){return latestData?JSON.parse(JSON.stringify(latestData.dailyPlan||null)):null;}\n''','export direct intent')
write(p,s)

# 2) Stage Transition: expose canonical Select completion by card id.
p='public/stage-transition-v3.js'
s=read(p)
old='''  async function completeSelect(button){\n    const data=await loadData(); const card=currentStudyCard(data); if(!card)return false;\n    const now=new Date(),commandId=stageCommandId(card.id,"select",now);\n    if(commandCommitted(data,commandId)){busy(button,"已确认 · 明天开始记忆");setTimeout(()=>location.reload(),80);return true;}\n    if(core.canonicalStage(card)!=="select"||card.inboxPending)return false;\n    const prev={...card,learningStage:"select"};\n    card.stage="memorize";\n    card.learningStage="memorize";\n    Object.assign(card,core.crossDayPatch(prev,{stage:"memorize",learningStage:"memorize"},now)||{});\n    card.updatedAt=now.toISOString(); appendActivity(data,card.id,"select",{nextStage:"memorize",commandId});\n    busy(button,"已确认 · 明天开始记忆"); await persist(data); location.reload(); return true;\n  }\n'''
new='''  async function completeSelectCard(cardId,{direct=false,button=null}={}){\n    const data=await loadData();\n    const card=Array.isArray(data?.cards)?data.cards.find(item=>String(item.id)===String(cardId||"")):null;\n    if(!card)return false;\n    const now=new Date(),commandId=stageCommandId(card.id,"select",now);\n    if(commandCommitted(data,commandId)){if(button)busy(button,"已确认 · 明天开始记忆");return true;}\n    const stage=core.canonicalStage(card);\n    if(stage==="memorize")return true;\n    if(stage!=="select")return false;\n    if(card.inboxPending&&!direct)return false;\n    if(direct){\n      card.inboxPending=false;\n      card.todaySelectedOn=card.todaySelectedOn||core.dayKey(now);\n      card.selectedOn=card.selectedOn||core.dayKey(now);\n      card.inboxSelectedAt=card.inboxSelectedAt||now.toISOString();\n    }\n    const prev={...card,learningStage:"select"};\n    card.stage="memorize";\n    card.learningStage="memorize";\n    Object.assign(card,core.crossDayPatch(prev,{stage:"memorize",learningStage:"memorize"},now)||{});\n    card.updatedAt=now.toISOString();\n    appendActivity(data,card.id,"select",{nextStage:"memorize",commandId,source:direct?"direct-selection":"study-select"});\n    if(button)busy(button,"已确认 · 明天开始记忆");\n    await persist(data);\n    return true;\n  }\n\n  async function completeSelect(button){\n    const cardId=currentStudyCardId();if(!cardId)return false;\n    const completed=await completeSelectCard(cardId,{direct:false,button});\n    if(completed)setTimeout(()=>location.reload(),80);\n    return completed;\n  }\n'''
s=replace_once(s,old,new,'complete select card authority')
s=replace_once(s,
'''    endStageWrite,\n  });\n''',
'''    endStageWrite,\n    completeSelectCard,\n  });\n''','export completeSelectCard')
write(p,s)

# 3) App shell: expose one pronunciation resolver and consume Today direct-add intent at save.
p='public/app.js'
s=read(p)
s=replace_once(s,
'''  async function speakSentence(sentence){\n    const text=String(sentence||"").trim();\n    if(!text)return;\n    if(await playNaturalTts(text))return;\n    toast("当前没有可用的自然例句发音，请稍后重试");\n  }\n''',
'''  async function speakSentence(sentence){\n    const text=String(sentence||"").trim();\n    if(!text)return;\n    if(await playNaturalTts(text))return;\n    toast("当前没有可用的自然例句发音，请稍后重试");\n  }\n\n  window.LexiFlowPronunciationV1=Object.freeze({\n    playWord:(word,audioUrl="",audioUrls=[])=>speak(word,audioUrl,audioUrls),\n    playSentence:sentence=>speakSentence(sentence),\n  });\n''','shared pronunciation resolver')
old='''    if(action==="save-card"){\n      const r=state.lookup?.result,s=r?.senses.find(x=>x.id===state.selectedSenseId);if(!r||!s)return;\n      if(!s.meaningZh?.trim()||!s.exampleEn?.trim()){state.addDraft=JSON.parse(JSON.stringify(s));toast("保存前请补全中文释义和英文例句");render();return;}\n      if(!learningExampleUsesTarget(s.exampleEn,r.word)){\n        showNotice("这张卡片还不能保存",`例句没有使用当前目标词“${r.word}”。请重新识别结果，或修改例句后再保存。`,"warn");\n        return;\n      }\n      const exists=state.data.cards.find(c=>c.word.toLowerCase()===r.word.toLowerCase()&&c.meaningZh===s.meaningZh);\n      if(exists){toast("这张义项卡已经存在");return;}\n      const now=new Date().toISOString();\n      const card={id:uid(),word:r.word,phonetic:r.phonetic,audioUrl:r.audioUrl||"",audioUrls:Array.isArray(r.audioUrls)?r.audioUrls:[],pronunciationSource:r.pronunciationSource||"",pos:s.pos,meaningZh:s.meaningZh,exampleEn:s.exampleEn,exampleZh:s.exampleZh||"",exampleTranslationPending:!s.exampleZh?.trim(),senseIntentEn:s.senseIntentEn||"",avoidVisualEn:Array.isArray(s.avoidVisualEn)?s.avoidVisualEn:[],sourceQuery:r.sourceQuery||state.lookup?.query||r.word,stage:"select",createdAt:now,updatedAt:now,reviewCount:0,nextReviewAt:null,memoryHistory:[],visualNote:"",imageData:null,userSentence:""};\n      state.data.cards.unshift(card);recordActivity("card-created",card.id);toast("卡片已保存，已进入学习流程");state.lookup=null;state.selectedSenseId=null;state.route="home";render();return;\n    }\n'''
new='''    if(action==="save-card"){\n      const r=state.lookup?.result,s=r?.senses.find(x=>x.id===state.selectedSenseId);if(!r||!s)return;\n      if(!s.meaningZh?.trim()||!s.exampleEn?.trim()){state.addDraft=JSON.parse(JSON.stringify(s));toast("保存前请补全中文释义和英文例句");render();return;}\n      if(!learningExampleUsesTarget(s.exampleEn,r.word)){\n        showNotice("这张卡片还不能保存",`例句没有使用当前目标词“${r.word}”。请重新识别结果，或修改例句后再保存。`,"warn");\n        return;\n      }\n      const exists=state.data.cards.find(c=>c.word.toLowerCase()===r.word.toLowerCase()&&c.meaningZh===s.meaningZh);\n      if(exists){toast("这张义项卡已经存在");return;}\n      const directToday=Boolean(window.LexiFlowTodayPlanV3?.directAddActive?.());\n      const now=new Date().toISOString();\n      const card={id:uid(),word:r.word,phonetic:r.phonetic,audioUrl:r.audioUrl||"",audioUrls:Array.isArray(r.audioUrls)?r.audioUrls:[],pronunciationSource:r.pronunciationSource||"",pos:s.pos,meaningZh:s.meaningZh,exampleEn:s.exampleEn,exampleZh:s.exampleZh||"",exampleTranslationPending:!s.exampleZh?.trim(),senseIntentEn:s.senseIntentEn||"",avoidVisualEn:Array.isArray(s.avoidVisualEn)?s.avoidVisualEn:[],sourceQuery:r.sourceQuery||state.lookup?.query||r.word,stage:"select",createdAt:now,updatedAt:now,reviewCount:0,nextReviewAt:null,memoryHistory:[],visualNote:"",imageData:null,userSentence:""};\n      if(directToday){\n        card.inboxPending=false;\n        card.todaySelectedOn=todayKey();\n        card.selectedOn=todayKey();\n        card.inboxSelectedAt=now;\n        card.stageEligibleOn=now;\n      }\n      state.data.cards.unshift(card);\n      recordActivity("card-created",card.id,{source:directToday?"today-direct-select":"library-collection"});\n      if(directToday){\n        await persistenceQueue.catch(()=>{});\n        let completed=false;\n        try{completed=Boolean(await window.LexiFlowStageTransitionV3?.completeSelectCard?.(card.id,{direct:true}));}\n        catch(err){console.error("direct Select completion failed",err);}\n        window.LexiFlowTodayPlanV3?.clearDirectAddIntent?.();\n        state.lookup=null;state.selectedSenseId=null;state.route="home";\n        if(completed)toast("词义已确认 · 明天开始记忆");\n        else showNotice("词义已经保存","单词已经加入今天，学习状态正在重新同步；返回今日学习即可继续。","warn");\n        render();return;\n      }\n      toast("已保存到单词库 · 待学习");state.lookup=null;state.selectedSenseId=null;state.route="home";render();return;\n    }\n'''
s=replace_once(s,old,new,'save-card direct flow')
write(p,s)

# 4) Select renderer: same word pronunciation source as lookup + example audio.
p='public/select-stage-v3.js'
s=read(p)
s=replace_once(s,
'''    style.textContent=`.lexi-select-v3{min-height:500px;padding:4px;display:flex;flex-direction:column}.lexi-select-v3-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.lexi-select-v3-head span{font-size:12px;color:var(--muted)}.lexi-select-v3-body{width:min(640px,100%);margin:34px auto 0;display:grid;gap:18px}.lexi-select-v3-word{display:flex;align-items:center;justify-content:center;gap:9px;text-align:center}.lexi-select-v3-word strong{font-size:40px;line-height:1.1}.lexi-select-v3-word button{border:0;background:transparent;cursor:pointer;font-size:18px}.lexi-select-v3-meta{text-align:center;color:var(--muted);font-size:13px}.lexi-select-v3-answer{padding:20px;border:1px solid var(--line);border-radius:18px;background:var(--surface);display:grid;gap:11px}.lexi-select-v3-answer>strong{font-size:21px}.lexi-select-v3-example{padding-top:11px;border-top:1px solid var(--line);line-height:1.65}.lexi-select-v3-example p{margin:4px 0 0;color:var(--muted)}.lexi-select-v3-actions{display:flex;justify-content:flex-end}.lexi-select-v3-actions .btn{min-width:210px}@media(max-width:700px){.lexi-select-v3-word strong{font-size:34px}.lexi-select-v3-actions .btn{width:100%}}`;\n''',
'''    style.textContent=`.lexi-select-v3{min-height:500px;padding:4px;display:flex;flex-direction:column}.lexi-select-v3-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.lexi-select-v3-head span{font-size:12px;color:var(--muted)}.lexi-select-v3-body{width:min(640px,100%);margin:34px auto 0;display:grid;gap:18px}.lexi-select-v3-word{display:flex;align-items:center;justify-content:center;gap:9px;text-align:center}.lexi-select-v3-word strong{font-size:40px;line-height:1.1}.lexi-select-v3-word button,.lexi-select-v3-example button{border:0;background:transparent;cursor:pointer;font-size:18px}.lexi-select-v3-meta{text-align:center;color:var(--muted);font-size:13px}.lexi-select-v3-answer{padding:20px;border:1px solid var(--line);border-radius:18px;background:var(--surface);display:grid;gap:11px}.lexi-select-v3-answer>strong{font-size:21px}.lexi-select-v3-example{padding-top:11px;border-top:1px solid var(--line);line-height:1.65}.lexi-select-v3-example-line{display:flex;align-items:flex-start;gap:8px}.lexi-select-v3-example-line>span{flex:1}.lexi-select-v3-example p{margin:4px 0 0;color:var(--muted)}.lexi-select-v3-actions{display:flex;justify-content:flex-end}.lexi-select-v3-actions .btn{min-width:210px}@media(max-width:700px){.lexi-select-v3-word strong{font-size:34px}.lexi-select-v3-actions .btn{width:100%}}`;\n''','select stage audio styles')
s=replace_once(s,
'''    return `<div class="lexi-select-v3" data-select-stage-v3="${esc(card.id)}"><div class="lexi-select-v3-head"><strong>Select · 确认词义</strong><span>确认的是你真正想学、想说的这个意思</span></div><div class="lexi-select-v3-body"><div><div class="lexi-select-v3-word"><strong>${esc(card.word)}</strong><button type="button" data-select-v3="speak" aria-label="播放发音">🔊</button></div><div class="lexi-select-v3-meta">${esc(phonetic(card.phonetic))}${card.pos?` · ${esc(card.pos)}`:""}</div></div><div class="lexi-select-v3-answer"><strong>${esc(card.meaningZh||"")}</strong>${card.exampleEn?`<div class="lexi-select-v3-example"><div>${esc(card.exampleEn)}</div>${card.exampleZh?`<p>${esc(card.exampleZh)}</p>`:""}</div>`:""}</div><div class="lexi-select-v3-actions"><button class="btn primary" type="button" data-action="complete-stage" data-next="memorize">确认这个词义 · 明天开始记忆</button></div></div></div>`;\n''',
'''    return `<div class="lexi-select-v3" data-select-stage-v3="${esc(card.id)}"><div class="lexi-select-v3-head"><strong>Select · 确认词义</strong><span>确认的是你真正想学、想说的这个意思</span></div><div class="lexi-select-v3-body"><div><div class="lexi-select-v3-word"><strong>${esc(card.word)}</strong><button type="button" data-select-v3="speak-word" aria-label="播放发音">🔊</button></div><div class="lexi-select-v3-meta">${esc(phonetic(card.phonetic))}${card.pos?` · ${esc(card.pos)}`:""}</div></div><div class="lexi-select-v3-answer"><strong>${esc(card.meaningZh||"")}</strong>${card.exampleEn?`<div class="lexi-select-v3-example"><div class="lexi-select-v3-example-line"><span>${esc(card.exampleEn)}</span><button type="button" data-select-v3="speak-example" aria-label="播放例句">🔊</button></div>${card.exampleZh?`<p>${esc(card.exampleZh)}</p>`:""}</div>`:""}</div><div class="lexi-select-v3-actions"><button class="btn primary" type="button" data-action="complete-stage" data-next="memorize">确认这个词义 · 明天开始记忆</button></div></div></div>`;\n''','select stage audio markup')
s=replace_once(s,
'''  async function speak(){\n    const card=currentCard();if(!card)return;\n    try{if(typeof window.LexiFlowNaturalTts?.play==="function"&&await window.LexiFlowNaturalTts.play(card.word))return;}catch{}\n    try{const utterance=new SpeechSynthesisUtterance(card.word);utterance.lang="en-US";speechSynthesis.cancel();speechSynthesis.speak(utterance);}catch{}\n  }\n\n  document.addEventListener("click",event=>{\n    const button=event.target?.closest?.('[data-select-v3="speak"]');\n    if(!button)return;\n    event.preventDefault();event.stopImmediatePropagation();void speak();\n  },true);\n''',
'''  async function speakWord(){\n    const card=currentCard();if(!card)return;\n    await window.LexiFlowPronunciationV1?.playWord?.(card.word,card.audioUrl||"",Array.isArray(card.audioUrls)?card.audioUrls:[]);\n  }\n\n  async function speakExample(){\n    const card=currentCard();if(!card?.exampleEn)return;\n    await window.LexiFlowPronunciationV1?.playSentence?.(card.exampleEn);\n  }\n\n  document.addEventListener("click",event=>{\n    const button=event.target?.closest?.('[data-select-v3]');\n    if(!button)return;\n    const action=button.dataset.selectV3;\n    if(action!=="speak-word"&&action!=="speak-example")return;\n    event.preventDefault();event.stopImmediatePropagation();\n    if(action==="speak-word")void speakWord();else void speakExample();\n  },true);\n''','select shared pronunciation')
write(p,s)

# 5) Add a targeted regression contract and wire it into checks.
test_path=ROOT/'scripts/check-direct-select-v4.js'
test_path.write_text(r'''const fs=require("fs");
const assert=require("assert");
const app=fs.readFileSync("public/app.js","utf8");
const today=fs.readFileSync("public/today-plan-v3.js","utf8");
const transition=fs.readFileSync("public/stage-transition-v3.js","utf8");
const select=fs.readFileSync("public/select-stage-v3.js","utf8");

assert(today.includes("directAddActive"),"Today Plan must expose direct-add intent");
assert(today.includes("确认词义并加入今日学习"),"Today add CTA must describe the single-step confirmation");
assert(today.includes("completeSelectCard?.(id,{direct:true})"),"Pending-library selection must complete Select without returning to Today for another confirmation");
assert(app.includes("window.LexiFlowTodayPlanV3?.directAddActive?.()"),"Add-card save must detect Today selection intent");
assert(app.includes("completeSelectCard?.(card.id,{direct:true})"),"Today lookup save must complete Select immediately");
assert(app.includes("window.LexiFlowPronunciationV1=Object.freeze"),"App must expose one pronunciation resolver");
assert(transition.includes("async function completeSelectCard"),"Stage Transition must own direct Select completion");
assert(transition.includes("completeSelectCard,"),"Stage Transition must expose direct Select completion");
assert(select.includes("LexiFlowPronunciationV1?.playWord"),"Select word audio must reuse lookup pronunciation resolver");
assert(select.includes("LexiFlowPronunciationV1?.playSentence"),"Select example must expose sentence audio through shared resolver");
assert(select.includes('data-select-v3="speak-example"'),"Select example must render an audio control");
assert(!select.includes("SpeechSynthesisUtterance"),"Select stage must not use a separate system-TTS fallback");
console.log("Direct Select V4 regression passed");
''',encoding='utf-8')

p='package.json'
pkg=json.loads(read(p))
check_learning=pkg['scripts']['check:learning']
if 'check-direct-select-v4.js' not in check_learning:
    pkg['scripts']['check:learning']=check_learning+' && node scripts/check-direct-select-v4.js'
check=pkg['scripts']['check']
if 'node --check scripts/check-direct-select-v4.js' not in check:
    marker='node --check scripts/check-user-surface-v4.js'
    pkg['scripts']['check']=check.replace(marker,marker+' && node --check scripts/check-direct-select-v4.js',1)
write(p,json.dumps(pkg,ensure_ascii=False,indent=2)+'\n')

# Final state assertions.
app=read('public/app.js');today=read('public/today-plan-v3.js');transition=read('public/stage-transition-v3.js');select=read('public/select-stage-v3.js')
required=[
    (today,'directAddActive','today direct intent'),
    (today,'确认词义并加入今日学习','today one-step CTA'),
    (app,'LexiFlowPronunciationV1','shared pronunciation API'),
    (app,'today-direct-select','direct save source'),
    (transition,'completeSelectCard','direct stage authority'),
    (select,'speak-example','example audio'),
]
for text,needle,label in required:
    if needle not in text: raise SystemExit(f'missing {label}: {needle}')
if 'SpeechSynthesisUtterance' in select: raise SystemExit('select stage still owns a separate SpeechSynthesis fallback')
print('Direct Select + shared pronunciation migration applied')
