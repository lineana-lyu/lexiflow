"use strict";

const fs=require("fs");
const path=require("path");
const root=path.resolve(__dirname,"..");

function file(name){return path.join(root,name);}
function read(name){return fs.readFileSync(file(name),"utf8");}
function write(name,value){fs.writeFileSync(file(name),value,"utf8");}
function replaceOnce(name,before,after,label){
  const source=read(name);
  const first=source.indexOf(before);
  if(first<0)throw new Error(`${label||name}: source snippet not found`);
  if(source.indexOf(before,first+before.length)>=0)throw new Error(`${label||name}: source snippet is not unique`);
  write(name,source.slice(0,first)+after+source.slice(first+before.length));
}

// 1) Multi-word English expressions must never be shadowed by an older saved card.
replaceOnce(
  "public/app.js",
  'const exactLocal=Boolean(saved&&!containsChinese(q)&&normalizeSearchText(saved.word)===qNormalized);',
  'const exactLocal=Boolean(saved&&!containsChinese(q)&&!/\\s/.test(qNormalized)&&normalizeSearchText(saved.word)===qNormalized);',
  "phrase lookup local-card guard"
);

// 2) Every speaker surface uses the same card-creation speaker treatment, including nested study renderers.
replaceOnce(
  "public/product-ux.js",
  'document.querySelectorAll(".speaker,.sentence-speaker").forEach(button => {',
  'document.querySelectorAll(".speaker,.sentence-speaker,[data-m2=\\"speak\\"],[data-r3=\\"speak\\"]").forEach(button => {',
  "speaker selector"
);
replaceOnce(
  "public/product-ux.js",
  'button.classList.add("lexi-speaker-button");',
  'button.classList.add("speaker","lexi-speaker-button");',
  "speaker canonical class"
);
replaceOnce(
  "public/product-ux.js",
  'new MutationObserver(scheduleDecorate).observe(app, { childList: true, subtree: false });',
  'new MutationObserver(scheduleDecorate).observe(app, { childList: true, subtree: true });',
  "speaker nested observer"
);

// 3) Memorize: roomy submit button, canonical speaker, dictionary-first pronunciation, and interleaved directions.
replaceOnce(
  "public/memorize-stage-v3.js",
  'const wordBlock = c => `<div class="lexi-m2-word" data-lexi-mem-word="${esc(c.word)}"><div><strong>${esc(c.word)}</strong><button type="button" data-m2="speak">🔊</button></div><small>${esc(phonetic(c.phonetic))} · ${esc(c.pos||"")}</small></div>`;',
  'const wordBlock = c => `<div class="lexi-m2-word" data-lexi-mem-word="${esc(c.word)}"><div><strong>${esc(c.word)}</strong><button type="button" class="speaker lexi-m2-speaker" data-m2="speak" title="播放美式发音" aria-label="播放 ${esc(c.word)} 的发音">🔊</button></div><small>${esc(phonetic(c.phonetic))} · ${esc(c.pos||"")}</small></div>`;',
  "memorize speaker markup"
);
replaceOnce(
  "public/memorize-stage-v3.js",
  '.lexi-m2-input{display:flex;gap:10px;width:min(500px,100%)}.lexi-m2-input input{text-align:center;font-size:18px}.lexi-m2-actions{display:flex;gap:10px;width:min(420px,100%)}',
  '.lexi-m2-input{display:flex;gap:10px;width:min(560px,100%)}.lexi-m2-input input{flex:1;min-width:0;text-align:center;font-size:18px}.lexi-m2-input .btn{flex:0 0 auto;min-width:116px;white-space:nowrap;padding-inline:18px}.lexi-m2-actions{display:flex;gap:10px;width:min(420px,100%)}',
  "memorize submit button layout"
);
replaceOnce(
  "public/memorize-stage-v3.js",
  '@media(max-width:700px){.lexi-m2-input{flex-direction:column}.lexi-m2-word strong{font-size:34px}}',
  '@media(max-width:700px){.lexi-m2-input{flex-direction:column}.lexi-m2-input .btn{width:100%}.lexi-m2-word strong{font-size:34px}}',
  "memorize mobile submit layout"
);
replaceOnce(
  "public/memorize-stage-v3.js",
  '      await save(data);\n      clearSession(card.id);\n      location.reload();',
  '      await save(data);\n      clearSession(card.id);\n      if(window.LexiFlowStudySessionV3?.advanceWithinBucket?.(card.id,"memorize"))return;\n      location.reload();',
  "memorize completion rotation"
);
replaceOnce(
  "public/memorize-stage-v3.js",
  '    if(a==="speak"){ try{if(typeof window.LexiFlowNaturalTts?.play==="function"&&await window.LexiFlowNaturalTts.play(card.word))return;}catch{}; try{const u=new SpeechSynthesisUtterance(card.word);u.lang="en-US";speechSynthesis.cancel();speechSynthesis.speak(u);}catch{}; return; }',
  '    if(a==="speak"){\n      try{\n        const pronunciation=window.LexiFlowPronunciationV3;\n        if(typeof pronunciation?.playWord==="function"){\n          await pronunciation.playWord(card.word,{audioUrl:card.audioUrl||"",audioUrls:Array.isArray(card.audioUrls)?card.audioUrls:[]});\n          return;\n        }\n        if(typeof window.LexiFlowNaturalTts?.play==="function"&&await window.LexiFlowNaturalTts.play(card.word,btn))return;\n      }catch{}\n      return;\n    }',
  "memorize pronunciation priority"
);
replaceOnce(
  "public/memorize-stage-v3.js",
  '    if(a==="rate"){s.results[s.round].en=btn.dataset.ok==="1";s.direction="zh-en";s.revealed=false;s.draft="";s.checked=false;s.correct=null;setSession(card.id,s);render();return;}',
  '    if(a==="rate"){\n      s.results[s.round].en=btn.dataset.ok==="1";\n      s.direction="zh-en";s.revealed=false;s.draft="";s.checked=false;s.correct=null;\n      setSession(card.id,s);\n      if(window.LexiFlowStudySessionV3?.advanceWithinBucket?.(card.id,"memorize"))return;\n      render();return;\n    }',
  "memorize direction interleave"
);

// 4) Study session exposes one narrow same-bucket rotation hook so different recall forms are separated by other words when possible.
replaceOnce(
  "public/study-session-v3.js",
  '  function pauseSession(){\n',
  '  function advanceWithinBucket(currentCardId,bucket){\n    syncFromGateway();\n    const session=reconcile(loadSession());\n    const queue=Array.isArray(session.queue)?session.queue:[];\n    if(!queue.length)return false;\n    const currentId=String(currentCardId||"");\n    const currentIndex=queue.indexOf(currentId);\n    for(let offset=1;offset<=queue.length;offset++){\n      const index=currentIndex>=0?(currentIndex+offset)%queue.length:(offset-1)%queue.length;\n      const id=queue[index];\n      if(!id||id===currentId)continue;\n      const card=cardById(id);\n      if(bucketForCard(card)!==bucket||!core.eligibleToday(card,new Date()))continue;\n      session.activeCardId=id;\n      session.activeBucket=bucket;\n      session.paused=false;\n      saveSession(session);\n      return invokeRenderer(session);\n    }\n    return false;\n  }\n\n  function pauseSession(){\n',
  "study session bucket rotation"
);
replaceOnce(
  "public/study-session-v3.js",
  '    open:()=>openSession({resume:true}),\n    pause:pauseSession,',
  '    open:()=>openSession({resume:true}),\n    advanceWithinBucket,\n    pause:pauseSession,',
  "study session rotation export"
);

// 5) Review uses the same dictionary -> natural synthesis -> system fallback bridge and the same speaker UI.
replaceOnce(
  "public/review-session-v3.js",
  '<button class="btn" type="button" data-r3="speak">🔊 发音</button>',
  '<button class="speaker lexi-r3-speaker" type="button" data-r3="speak" title="播放美式发音" aria-label="播放当前单词的发音">🔊</button>',
  "review speaker markup"
);
replaceOnce(
  "public/review-session-v3.js",
  '.lexi-r3-input{display:flex;gap:10px;width:min(500px,100%);margin:0 auto}.lexi-r3-input input{text-align:center;font-size:18px}',
  '.lexi-r3-input{display:flex;gap:10px;width:min(560px,100%);margin:0 auto}.lexi-r3-input input{flex:1;min-width:0;text-align:center;font-size:18px}.lexi-r3-input .btn{flex:0 0 auto;min-width:116px;white-space:nowrap;padding-inline:18px}',
  "review submit button layout"
);
replaceOnce(
  "public/review-session-v3.js",
  '@media(max-width:700px){.lexi-r3-screen{padding:18px 14px}.lexi-r3-card{padding:24px 18px;margin-top:20px}.lexi-r3-input{flex-direction:column}.lexi-r3-word{font-size:35px}.lexi-r3-meaning{font-size:25px}}',
  '@media(max-width:700px){.lexi-r3-screen{padding:18px 14px}.lexi-r3-card{padding:24px 18px;margin-top:20px}.lexi-r3-input{flex-direction:column}.lexi-r3-input .btn{width:100%}.lexi-r3-word{font-size:35px}.lexi-r3-meaning{font-size:25px}}',
  "review mobile submit layout"
);
replaceOnce(
  "public/review-session-v3.js",
  '  async function speakCurrent(){\n    const session=reconcile(loadSession()),card=cardById(currentId(session));if(!card)return;\n    try{if(typeof window.LexiFlowNaturalTts?.play==="function"&&await window.LexiFlowNaturalTts.play(card.word))return;}catch{}\n    try{const u=new SpeechSynthesisUtterance(card.word);u.lang="en-US";speechSynthesis.cancel();speechSynthesis.speak(u);}catch{}\n  }',
  '  async function speakCurrent(){\n    const session=reconcile(loadSession()),card=cardById(currentId(session));if(!card)return;\n    try{\n      const pronunciation=window.LexiFlowPronunciationV3;\n      if(typeof pronunciation?.playWord==="function"){\n        await pronunciation.playWord(card.word,{audioUrl:card.audioUrl||"",audioUrls:Array.isArray(card.audioUrls)?card.audioUrls:[]});\n        return;\n      }\n      if(typeof window.LexiFlowNaturalTts?.play==="function")await window.LexiFlowNaturalTts.play(card.word);\n    }catch{}\n  }',
  "review pronunciation priority"
);

// 6) Phrase pronunciation: keep exact dictionary recording when available; otherwise compose a complete display IPA from word-level dictionary phonetics. Never stitch component audio.
const oldHydration=`  async function hydratePronunciation(result) {\n    if (!result?.word) return;\n    const existing = [clean(result.audioUrl), ...(Array.isArray(result.audioUrls) ? result.audioUrls.map(clean) : [])].filter(Boolean);\n    if (existing.length) return;\n    const word = normalizeWord(result.word);\n    let task = pronunciationInFlight.get(word);\n    if (!task) {\n      task = nativeFetch(\`\${API_ORIGIN}/api/dictionary/pronunciation\`, {\n        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({word:result.word}),\n      }).then(async response => {\n        let payload={}; try{payload=await response.json();}catch{}\n        if(!response.ok || !payload?.ok) return null;\n        return payload.result || null;\n      }).finally(()=>pronunciationInFlight.delete(word));\n      pronunciationInFlight.set(word, task);\n    }\n    try { const pronunciation = await task; if (pronunciation) patchPronunciation(result, pronunciation); } catch {}\n  }`;
const newHydration=`  function phoneticToken(value) {\n    return clean(value).replace(/^\\/+|\\/+$/g,"").replace(/^\\[+|\\]+$/g,"").trim();\n  }\n\n  async function requestPronunciation(word) {\n    const key=normalizeWord(word);\n    if(!key)return null;\n    let task=pronunciationInFlight.get(key);\n    if(!task){\n      task=nativeFetch(\`\${API_ORIGIN}/api/dictionary/pronunciation\`,{\n        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({word}),\n      }).then(async response=>{\n        let payload={};try{payload=await response.json();}catch{}\n        if(!response.ok||!payload?.ok)return null;\n        return payload.result||null;\n      }).finally(()=>pronunciationInFlight.delete(key));\n      pronunciationInFlight.set(key,task);\n    }\n    try{return await task;}catch{return null;}\n  }\n\n  async function composePhrasePhonetic(expression) {\n    const parts=clean(expression).split(/\\s+/).map(part=>part.replace(/^[^A-Za-z'-]+|[^A-Za-z'-]+$/g,"")).filter(Boolean);\n    if(parts.length<2||parts.length>8)return "";\n    const pronunciations=await Promise.all(parts.map(part=>requestPronunciation(part)));\n    const tokens=pronunciations.map(item=>phoneticToken(item?.phonetic));\n    if(tokens.some(token=>!token))return "";\n    return \`/\${tokens.join(" ")}/\`;\n  }\n\n  async function hydratePronunciation(result) {\n    if(!result?.word)return;\n    const word=normalizeWord(result.word);\n    const isPhrase=/\\s/.test(word);\n    const existing=[clean(result.audioUrl),...(Array.isArray(result.audioUrls)?result.audioUrls.map(clean):[])].filter(Boolean);\n    let pronunciation=null;\n    if(!existing.length||!clean(result.phonetic)||isPhrase){\n      pronunciation=await requestPronunciation(result.word);\n      if(pronunciation)patchPronunciation(result,pronunciation);\n    }\n    if(isPhrase&&!pronunciation?.dictionaryAudio){\n      const composite=await composePhrasePhonetic(result.word);\n      if(composite)patchPronunciation(result,{phonetic:composite});\n    }\n  }`;
replaceOnce("public/example-hydration.js",oldHydration,newHydration,"phrase pronunciation hydration");

// 7) Lock the regressions in tests.
replaceOnce(
  "scripts/check-expression-query-v4.js",
  'const kokoro = fs.readFileSync(path.join(root, "public", "kokoro-voice.js"), "utf8");',
  'const kokoro = fs.readFileSync(path.join(root, "public", "kokoro-voice.js"), "utf8");\nconst app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");\nconst hydration = fs.readFileSync(path.join(root, "public", "example-hydration.js"), "utf8");\nconst memorize = fs.readFileSync(path.join(root, "public", "memorize-stage-v3.js"), "utf8");\nconst review = fs.readFileSync(path.join(root, "public", "review-session-v3.js"), "utf8");\nconst productUx = fs.readFileSync(path.join(root, "public", "product-ux.js"), "utf8");',
  "expression regression test fixtures"
);
replaceOnce(
  "scripts/check-expression-query-v4.js",
  'assert(runtime.includes(\'local?.phonetic && !/\\\\s/.test(word)\'), "multiword phrases must not display a one-component ECDICT phonetic fallback");\nconsole.log("Expression query V4 checks passed");',
  'assert(runtime.includes(\'local?.phonetic && !/\\\\s/.test(word)\'), "multiword phrases must not display a one-component ECDICT phonetic fallback");\nassert(app.includes(\'!/\\\\s/.test(qNormalized)\'), "saved-card fast path must be limited to one-word English headwords so stale phrases cannot shadow whole-expression resolution");\nassert(hydration.includes("composePhrasePhonetic")&&hydration.includes("if(isPhrase&&!pronunciation?.dictionaryAudio)"), "phrase lookup must show complete phrase phonetics without stitching component audio");\nassert(memorize.includes("LexiFlowPronunciationV3")&&review.includes("LexiFlowPronunciationV3"), "Memorize and Review must reuse the shared dictionary-first pronunciation bridge");\nassert(productUx.includes(\'[data-m2=\\\\"speak\\\\"]\')&&productUx.includes("subtree: true"), "speaker decoration must reach nested learning surfaces");\nconsole.log("Expression query V4 checks passed");',
  "expression regression assertions"
);
replaceOnce(
  "scripts/check-study-session-v3.js",
  'const app=read("public/app.js");',
  'const app=read("public/app.js");\nconst memorize=read("public/memorize-stage-v3.js");',
  "study interleave test fixture"
);
replaceOnce(
  "scripts/check-study-session-v3.js",
  'assert(!session.includes("activeLearningCards()[0]"),"Study Session V3 must never choose work from the legacy activeLearningCards queue");',
  'assert(!session.includes("activeLearningCards()[0]"),"Study Session V3 must never choose work from the legacy activeLearningCards queue");\nassert(session.includes("function advanceWithinBucket")&&session.includes("core.eligibleToday(card,new Date())"),"Study Session V3 must support safe same-stage rotation between planned cards");\nassert(memorize.includes(\'advanceWithinBucket?.(card.id,"memorize")\'),"Memorize must separate the two recall directions with another word whenever the plan has one");',
  "study interleave assertions"
);

console.log("Applied V7 regression fixes.");
