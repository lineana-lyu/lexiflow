(() => {
  "use strict";

  const core = window.LexiFlowLearningCore;
  if(!core) throw new Error("LexiFlowLearningCore must load before stage-transition-v2.js");

  let saving = false;

  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `stage-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const normalize = value => String(value || "").trim().toLowerCase();
  const containsChinese = value => /[\u3400-\u9fff]/.test(String(value || ""));
  const escapeRe = value => String(value || "").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");

  function targetForms(word){
    const w = normalize(word);
    if(!w) return [];
    if(w.includes(" ")) return [w];
    const set = new Set([w]);
    if(w.endsWith("y") && w.length > 2){set.add(`${w.slice(0,-1)}ies`);set.add(`${w.slice(0,-1)}ied`);}
    if(w.endsWith("e")){set.add(`${w}s`);set.add(`${w}d`);set.add(`${w.slice(0,-1)}ing`);}
    else{set.add(`${w}s`);set.add(`${w}es`);set.add(`${w}ed`);set.add(`${w}ing`);}
    const irregular={
      keep:["kept"],run:["ran","running"],write:["wrote","written","writing"],go:["went","gone"],
      have:["has","had"],do:["does","did","done"],make:["made"],take:["took","taken"],see:["saw","seen"],
      come:["came"],get:["got","gotten"],give:["gave","given"],eat:["ate","eaten"],buy:["bought"],
      bring:["brought"],think:["thought"],say:["said"]
    };
    (irregular[w]||[]).forEach(item=>set.add(item));
    return [...set];
  }

  function usesTarget(text,word){
    const value=String(text||""), target=normalize(word);
    if(!target)return false;
    if(target.includes(" "))return value.toLowerCase().includes(target);
    return targetForms(target).some(form=>new RegExp(`\\b${escapeRe(form)}\\b`,"i").test(value));
  }

  async function loadData(){
    const response=await fetch("/api/learning-data",{cache:"no-store"});
    if(!response.ok)throw new Error("LOAD_FAILED");
    const payload=await response.json();
    return payload?.data||null;
  }

  async function persist(data){
    const response=await fetch("/api/learning-data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data})});
    if(!response.ok)throw new Error("SAVE_FAILED");
  }

  function domWord(){
    return normalize(document.querySelector(".study-card-focus .target-word-text,.apply-word-hero .target-word-text,.apply-word-hero strong,.word-title")?.textContent||"");
  }

  function cardForDom(data,expectedStage){
    const word=domWord();
    if(!word||!Array.isArray(data?.cards))return null;
    return data.cards.find(card=>normalize(card.word)===word&&(!expectedStage||card.stage===expectedStage))||null;
  }

  function appendActivity(data,cardId,stage,extra={}){
    data.activities=Array.isArray(data.activities)?data.activities:[];
    data.activities.push({id:uid(),type:"stage-complete",cardId,stage,at:new Date().toISOString(),...extra});
  }

  function busy(button,text){
    if(!button)return;
    button.disabled=true;
    button.dataset.lexiTransitionSaving="1";
    if(text)button.textContent=text;
  }

  async function completeSelect(button){
    const data=await loadData();
    const card=cardForDom(data,"select");
    if(!card||card.inboxPending)return false;
    const now=new Date(), prev={...card};
    card.stage="memorize1";
    Object.assign(card,core.crossDayPatch(prev,{stage:"memorize1"},now)||{});
    card.updatedAt=now.toISOString();
    appendActivity(data,card.id,"select");
    busy(button,"已确认 · 明天开始记忆");
    await persist(data);
    location.reload();
    return true;
  }

  async function completeVisualize(button){
    const data=await loadData();
    const card=cardForDom(data,"visualize");
    if(!card)return false;
    const hasImage=Boolean(card.imageData||card.imageUrl);
    if(!hasImage)return false;
    const now=new Date(), prev={...card};
    const note=String(document.getElementById("visual-note")?.value||card.visualNote||"").trim();
    card.visualNote=note;
    card.visualSkipped=false;
    card.stage="apply";
    Object.assign(card,core.crossDayPatch(prev,{stage:"apply"},now)||{});
    card.updatedAt=now.toISOString();
    appendActivity(data,card.id,"visualize",{skipped:false});
    busy(button,"已完成 · 明天开始造句");
    await persist(data);
    location.reload();
    return true;
  }

  async function completeApply(button){
    const data=await loadData();
    const card=cardForDom(data,"apply");
    if(!card)return false;
    const sentence=String(document.getElementById("apply-text")?.value||card.userSentence||"").trim();
    if(!sentence||containsChinese(sentence)||!usesTarget(sentence,card.word))return false;

    const now=new Date(), prev={...card};
    card.userSentence=sentence;
    card.finalSentence=sentence;
    card.stage="review";
    card.initialReviewPending=false;
    Object.assign(card,core.crossDayPatch(prev,{stage:"review"},now)||{});
    card.updatedAt=now.toISOString();
    appendActivity(data,card.id,"apply",{sentence});
    busy(button,"已完成 · 明天首次复习");
    await persist(data);
    location.reload();
    return true;
  }

  async function handle(button,kind){
    if(saving)return;
    saving=true;
    try{
      if(kind==="select")await completeSelect(button);
      if(kind==="visualize")await completeVisualize(button);
      if(kind==="apply")await completeApply(button);
    }catch(err){
      console.error("stage transition failed",err);
      if(button){button.disabled=false;delete button.dataset.lexiTransitionSaving;}
    }finally{saving=false;}
  }

  document.addEventListener("click",event=>{
    const button=event.target?.closest?.("button,[data-action]");
    if(!button)return;

    if(button.matches('[data-action="complete-stage"][data-next="memorize1"]')){
      event.preventDefault();event.stopImmediatePropagation();void handle(button,"select");return;
    }

    if(button.matches('[data-action="finish-visual"]')){
      const hasImage=Boolean(document.querySelector(".visual-image-canvas img,.visual-image img,.generated-visual-image"));
      if(!hasImage&&button.disabled)return;
      event.preventDefault();event.stopImmediatePropagation();void handle(button,"visualize");return;
    }

    if(button.matches('[data-action="pass-apply"]')){
      const text=String(document.getElementById("apply-text")?.value||"").trim(), word=domWord();
      if(!text||containsChinese(text)||!usesTarget(text,word))return;
      event.preventDefault();event.stopImmediatePropagation();void handle(button,"apply");
    }
  },true);
})();