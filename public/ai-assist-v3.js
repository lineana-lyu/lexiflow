(() => {
  "use strict";

  const upstreamFetch=window.fetch.bind(window);
  const SCENE_HISTORY_KEY="lexiflow-ai-scene-history-v3";
  const PROMPT_HISTORY_KEY="lexiflow-ai-prompt-history-v3";
  const MAX_HISTORY=4;

  function clean(value){return String(value||"").trim();}
  function historyKey(body){return `${clean(body?.word).toLowerCase()}|${clean(body?.meaningZh)}`;}
  function loadHistory(key){
    try{const parsed=JSON.parse(sessionStorage.getItem(key)||"{}");return parsed&&typeof parsed==="object"?parsed:{};}catch{return{};}
  }
  function saveHistory(key,value){try{sessionStorage.setItem(key,JSON.stringify(value));}catch{}}
  const sceneHistory=loadHistory(SCENE_HISTORY_KEY);
  const promptHistory=loadHistory(PROMPT_HISTORY_KEY);

  function remember(store,storageKey,key,value){
    const text=clean(value);if(!text)return;
    const next=Array.isArray(store[key])?store[key].filter(item=>item!==text):[];
    next.unshift(text);store[key]=next.slice(0,MAX_HISTORY);saveHistory(storageKey,store);
  }

  function normalizeForSimilarity(value){return clean(value).toLowerCase().replace(/[\s，。！？；：、“”‘’（）()\-—_]/g,"");}
  function bigrams(value){const text=normalizeForSimilarity(value);if(text.length<2)return text?[text]:[];const out=[];for(let i=0;i<text.length-1;i++)out.push(text.slice(i,i+2));return out;}
  function similarity(a,b){
    const aa=bigrams(a),bb=bigrams(b);if(!aa.length||!bb.length)return 0;
    const counts=new Map();aa.forEach(x=>counts.set(x,(counts.get(x)||0)+1));let overlap=0;
    bb.forEach(x=>{const count=counts.get(x)||0;if(count>0){overlap++;counts.set(x,count-1);}});
    return 2*overlap/(aa.length+bb.length);
  }
  function tooSimilar(value,previous,threshold=.72){return (previous||[]).some(item=>similarity(value,item)>=threshold);}
  function sceneIsConcrete(value){
    const text=clean(value);if(text.length<18)return false;
    return ![/放进一个你熟悉.*生活场景/,/围绕.+设计一个.*生活化.*场景/,/一个你熟悉.*具体.*生活场景/,/^把.+放进.+场景[。.]?$/].some(re=>re.test(text));
  }
  function escapeRegExp(value){return String(value||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
  function sceneNeedsCleanup(scene,word){
    const value=clean(scene),target=clean(word);if(!value)return false;
    if(target&&value.toLowerCase().includes(target.toLowerCase()))return true;
    return /[A-Za-z0-9]{2,}/.test(value)||/(写着|标着|印着|标签|招牌|logo|LOGO|屏幕文字|文字为|字样)/.test(value);
  }
  function sanitizeScene(scene,body){
    let text=clean(scene),target=clean(body?.word);
    if(target)text=text.replace(new RegExp(escapeRegExp(target),"ig"),"");
    text=text.replace(/\b[A-Za-z0-9]{2,}\b/g,"").replace(/(?:写着|标着|印着|标签|招牌|屏幕文字|文字为|字样)[^，。；]*/g,"").replace(/\s{2,}/g," ").replace(/，\s*，/g,"，").replace(/^\s*[，。；]+|[，；]+\s*$/g,"").trim();
    if(text.length>=12)return text;
    return `在一个自然、具体的日常场景中，用清晰动作表现“${clean(body?.meaningZh)||"当前词义"}”，画面保持简洁且不出现可读文字。`;
  }

  async function postJson(endpoint,body){
    const response=await upstreamFetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    let payload={};try{payload=await response.json();}catch{}
    if(!response.ok){const err=new Error(payload?.error||`REQUEST_FAILED_${response.status}`);err.payload=payload;err.status=response.status;throw err;}
    return payload;
  }

  function sceneAvoidance(note,previous,failed=""){
    const items=[note,...(previous||[]),failed].map(clean).filter(Boolean).slice(0,5);
    if(!items.length)return clean(note);
    return `${items.join("；")}。请基于用户自己的联想继续具体化，但必须换一个明显不同的地点、动作或物体组合；不要出现英文单词、标签、招牌或其他可读文字。`;
  }

  async function visualScene(body={}){
    const key=historyKey(body),known=Array.isArray(sceneHistory[key])?[...sceneHistory[key]]:[];
    let failed="",last=null;
    for(let attempt=0;attempt<3;attempt++){
      const request={...body,previousScene:attempt===0?clean(body.previousScene):sceneAvoidance(body.previousScene,known,failed)};
      const payload=await postJson("/api/ai/visual-scene",request);last=payload;
      const raw=clean(payload?.assist?.scene);const scene=sceneNeedsCleanup(raw,body.word)?sanitizeScene(raw,body):raw;
      const valid=sceneIsConcrete(scene)&&!tooSimilar(scene,known,.72);
      if(valid){
        remember(sceneHistory,SCENE_HISTORY_KEY,key,scene);
        return {...payload,assist:{...(payload.assist||{}),scene}};
      }
      failed=scene;if(scene)known.unshift(scene);
    }
    if(last?.assist){
      const raw=clean(last.assist.scene);const scene=sceneNeedsCleanup(raw,body.word)?sanitizeScene(raw,body):raw;
      if(scene){remember(sceneHistory,SCENE_HISTORY_KEY,key,scene);return {...last,assist:{...last.assist,scene}};}
    }
    throw new Error("VISUAL_SCENE_EMPTY");
  }

  function promptAvoidance(previous,known,failed=""){
    const items=[previous,...(known||[]),failed].map(clean).filter(Boolean).slice(0,5);
    if(!items.length)return clean(previous);
    return `${items.join("；")}。换题要求：必须换一个明显不同的真实生活情境，不要只替换同义词或调整语序。`;
  }

  async function practicePrompt(body={}){
    const key=historyKey(body),known=Array.isArray(promptHistory[key])?[...promptHistory[key]]:[];
    let failed="",last=null;
    for(let attempt=0;attempt<3;attempt++){
      const request={...body,previousQuestion:attempt===0?clean(body.previousQuestion):promptAvoidance(body.previousQuestion,known,failed)};
      const payload=await postJson("/api/ai/practice-prompt",request);last=payload;
      const question=clean(payload?.prompt?.question);
      if(question&&!tooSimilar(question,known,.72)){
        remember(promptHistory,PROMPT_HISTORY_KEY,key,question);
        return {...payload,prompt:{...(payload.prompt||{}),question}};
      }
      failed=question;if(question)known.unshift(question);
    }
    const question=clean(last?.prompt?.question);
    if(question){remember(promptHistory,PROMPT_HISTORY_KEY,key,question);return last;}
    throw new Error("PRACTICE_PROMPT_EMPTY");
  }

  window.LexiFlowAiAssistV3=Object.freeze({visualScene,practicePrompt});
})();
