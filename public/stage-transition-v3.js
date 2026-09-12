(() => {
  "use strict";

  const core = window.LexiFlowLearningCore;
  if(!core) throw new Error("LexiFlowLearningCore must load before stage-transition-v3.js");

  let saving = false;

  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `stage-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const normalize = value => String(value || "").trim().toLowerCase();
  const containsChinese = value => /[\u3400-\u9fff]/.test(String(value || ""));
  const escapeRe = value => String(value || "").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const copyNorm = value => normalize(value).replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/[.,!?;:()[\]{}"']/g," ").replace(/\s+/g," ").trim();

  function targetForms(word){
    const w = normalize(word); if(!w) return [];
    if(w.includes(" ")) return [w];
    const set = new Set([w]);
    if(w.endsWith("y") && w.length > 2){set.add(`${w.slice(0,-1)}ies`);set.add(`${w.slice(0,-1)}ied`);}
    if(w.endsWith("e")){set.add(`${w}s`);set.add(`${w}d`);set.add(`${w.slice(0,-1)}ing`);} else {set.add(`${w}s`);set.add(`${w}es`);set.add(`${w}ed`);set.add(`${w}ing`);}
    const irregular={keep:["kept"],run:["ran","running"],write:["wrote","written","writing"],go:["went","gone"],have:["has","had"],do:["does","did","done"],make:["made"],take:["took","taken"],see:["saw","seen"],come:["came"],get:["got","gotten"],give:["gave","given"],eat:["ate","eaten"],buy:["bought"],bring:["brought"],think:["thought"],say:["said"]};
    (irregular[w]||[]).forEach(item=>set.add(item)); return [...set];
  }

  function usesTarget(text,word){
    const value=String(text||""), target=normalize(word); if(!target)return false;
    if(target.includes(" "))return value.toLowerCase().includes(target);
    return targetForms(target).some(form=>new RegExp(`\\b${escapeRe(form)}\\b`,"i").test(value));
  }

  async function loadData(){
    const response=await fetch("/api/learning-data",{cache:"no-store"});
    if(!response.ok)throw new Error("LOAD_FAILED");
    const payload=await response.json();
    return payload?.data?core.normalizeData(payload.data):null;
  }

  async function persist(data){
    const response=await fetch("/api/learning-data",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({data:core.normalizeData(data),stageTransitionAuthority:"v3"})
    });
    if(!response.ok)throw new Error("SAVE_FAILED");
  }

  function currentStudyCardId(){return String(window.LexiFlowStudyRenderer?.currentCardId?.()||"");}
  function currentStudyCard(data){const id=currentStudyCardId();if(!id||!Array.isArray(data?.cards))return null;return data.cards.find(item=>String(item.id)===id)||null;}
  function stageCommandId(cardId,stage,now=new Date()){return `stage:${core.dayKey(now)}:${String(cardId)}:${String(stage)}`;}
  function commandCommitted(data,commandId){return Array.isArray(data?.activities)&&data.activities.some(item=>String(item.commandId||"")===commandId);}
  function appendActivity(data,cardId,stage,extra={}){
    data.activities=Array.isArray(data.activities)?data.activities:[];
    if(extra.commandId&&commandCommitted(data,extra.commandId))return;
    data.activities.push({id:uid(),type:"stage-complete",cardId,stage,at:new Date().toISOString(),authority:"stage-transition-v3",...extra});
  }
  function busy(button,text){if(!button)return;button.disabled=true;button.dataset.lexiTransitionSaving="1";if(text)button.textContent=text;}
  function resync(button){if(button){button.disabled=true;button.textContent="正在重新同步…";}setTimeout(()=>location.reload(),80);}

  function applyWarning(message){
    const composer=document.querySelector(".apply-composer");if(!composer)return;
    let box=document.querySelector(".lexi-apply-transition-warning");
    if(!box){box=document.createElement("div");box.className="lexi-apply-transition-warning";box.style.cssText="margin-top:10px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:rgba(120,140,132,.04);color:var(--muted);font-size:13px;line-height:1.6";composer.insertAdjacentElement("afterend",box);}box.textContent=message;
  }

  async function completeSelect(button){
    const data=await loadData(); const card=currentStudyCard(data); if(!card)return false;
    const now=new Date(),commandId=stageCommandId(card.id,"select",now);
    if(commandCommitted(data,commandId)){busy(button,"已确认 · 明天开始记忆");setTimeout(()=>location.reload(),80);return true;}
    if(core.canonicalStage(card)!=="select"||card.inboxPending)return false;
    const prev={...card,learningStage:"select"};
    card.stage="memorize";
    card.learningStage="memorize";
    Object.assign(card,core.crossDayPatch(prev,{stage:"memorize",learningStage:"memorize"},now)||{});
    card.updatedAt=now.toISOString(); appendActivity(data,card.id,"select",{nextStage:"memorize",commandId});
    busy(button,"已确认 · 明天开始记忆"); await persist(data); location.reload(); return true;
  }

  async function completeVisualize(button){
    const data=await loadData(); const card=currentStudyCard(data); if(!card)return false;
    const now=new Date(),commandId=stageCommandId(card.id,"visualize",now);
    if(commandCommitted(data,commandId)){busy(button,"已完成 · 明天开始造句");setTimeout(()=>location.reload(),80);return true;}
    if(core.canonicalStage(card)!=="visualize")return false;
    const hasImage=Boolean(card.imageData||card.imageUrl); if(!hasImage)return false;
    const prev={...card,learningStage:"visualize"};
    const note=String(document.getElementById("visual-note")?.value||card.visualNote||"").trim();
    card.visualNote=note; card.visualSkipped=false; card.stage="apply"; card.learningStage="apply";
    Object.assign(card,core.crossDayPatch(prev,{stage:"apply",learningStage:"apply"},now)||{});
    card.updatedAt=now.toISOString(); appendActivity(data,card.id,"visualize",{skipped:false,nextStage:"apply",commandId});
    busy(button,"已完成 · 明天开始造句"); await persist(data); location.reload(); return true;
  }

  async function completeApply(button){
    const data=await loadData(); const card=currentStudyCard(data); if(!card)return false;
    const now=new Date(),commandId=stageCommandId(card.id,"apply",now);
    if(commandCommitted(data,commandId)){busy(button,"已完成 · 明天首次复习");setTimeout(()=>location.reload(),80);return true;}
    if(core.canonicalStage(card)!=="apply")return false;
    const sentence=String(document.getElementById("apply-text")?.value||card.applyDraft||card.userSentence||"").trim();
    if(!sentence||containsChinese(sentence)||!usesTarget(sentence,card.word))return false;
    if(copyNorm(sentence)&&copyNorm(sentence)===copyNorm(card.exampleEn||"")){applyWarning("这句话和词典参考例句相同。请换一个与你自己有关的场景，再用目标词写一句。");return "blocked";}
    const prev={...card,learningStage:"apply"};
    card.userSentence=sentence;card.finalSentence=sentence;card.applyDraft="";card.applyDraftSavedAt="";card.applySkipped=false;card.applySkippedOn="";card.stage="review";card.learningStage="review";card.initialReviewPending=false;
    Object.assign(card,core.crossDayPatch(prev,{stage:"review",learningStage:"review"},now)||{});
    card.updatedAt=now.toISOString(); appendActivity(data,card.id,"apply",{sentence,skipped:false,nextStage:"review",commandId});
    busy(button,"已完成 · 明天首次复习"); await persist(data); location.reload(); return true;
  }

  async function handle(button,kind){
    if(saving)return; saving=true;
    try{let completed=false;if(kind==="select")completed=await completeSelect(button);if(kind==="visualize")completed=await completeVisualize(button);if(kind==="apply")completed=await completeApply(button);if(completed==="blocked")return;if(!completed)resync(button);}catch(err){console.error("stage transition failed",err);if(button){button.disabled=false;delete button.dataset.lexiTransitionSaving;button.textContent="状态未保存，请重试";}}finally{saving=false;}
  }

  document.addEventListener("click",event=>{
    const button=event.target?.closest?.("button,[data-action]");if(!button)return;
    if(button.matches('[data-action="complete-stage"][data-next="memorize"],[data-action="complete-stage"][data-next="memorize1"]')){event.preventDefault();event.stopImmediatePropagation();void handle(button,"select");return;}
    if(button.matches('[data-action="finish-visual"]')){const hasImage=Boolean(document.querySelector(".visual-image-canvas img,.visual-image img,.generated-visual-image"));if(!hasImage&&button.disabled)return;event.preventDefault();event.stopImmediatePropagation();void handle(button,"visualize");return;}
    if(button.matches('[data-action="pass-apply"]')){event.preventDefault();event.stopImmediatePropagation();void handle(button,"apply");}
  },true);

  window.LexiFlowStageTransitionV3=Object.freeze({currentCardId:currentStudyCardId});
})();
