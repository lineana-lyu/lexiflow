(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before visualize-stage-v3.js");

  let data=null;
  let queued=false;
  let refreshing=false;
  let busy=false;
  let uploadBusy=false;
  const localDrafts=new Map();

  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const phonetic=value=>{const s=String(value||"").trim();return !s?"暂无音标":((s.startsWith("/")&&s.endsWith("/"))||(s.startsWith("[")&&s.endsWith("]")))?s:`/${s}/`;};

  async function loadData(){
    const response=await fetch("/api/learning-data",{cache:"no-store"});
    if(!response.ok)throw new Error("LOAD_FAILED");
    const payload=await response.json();
    data=payload?.data?core.normalizeData(payload.data):null;
    return data;
  }

  async function refresh(){
    if(refreshing)return data;
    refreshing=true;
    try{return await loadData();}catch{return data;}finally{refreshing=false;}
  }

  async function persist(next){
    const normalized=core.normalizeData(next);
    const response=await fetch("/api/learning-data",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({data:normalized}),
    });
    if(!response.ok)throw new Error("SAVE_FAILED");
    data=normalized;
    return normalized;
  }

  function currentCardId(){return String(window.LexiFlowStudyRenderer?.currentCardId?.()||"");}
  function currentCard(){
    const id=currentCardId();
    if(!id||!Array.isArray(data?.cards))return null;
    const card=data.cards.find(item=>String(item.id)===id)||null;
    return card&&core.canonicalStage(card)==="visualize"?card:null;
  }

  function draftFor(card){
    if(localDrafts.has(card.id))return localDrafts.get(card.id);
    const value=String(card.visualNote||"");
    localDrafts.set(card.id,value);
    return value;
  }

  function setDraft(cardId,value){localDrafts.set(String(cardId),String(value||""));}

  function injectStyle(){
    if(document.getElementById("lexi-visualize-stage-v3-style"))return;
    const style=document.createElement("style");
    style.id="lexi-visualize-stage-v3-style";
    style.textContent=`
      .lexi-v3-visual{min-height:500px;padding:4px;display:grid;gap:20px}.lexi-v3-visual-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}.lexi-v3-visual-kicker{font-size:12px;font-weight:800;letter-spacing:.09em;color:var(--muted)}.lexi-v3-visual-word{display:flex;align-items:center;gap:8px;margin-top:4px}.lexi-v3-visual-word strong{font-size:30px}.lexi-v3-visual-word button{border:0;background:transparent;cursor:pointer;font-size:18px}.lexi-v3-visual-meta{font-size:13px;color:var(--muted);margin-top:3px}.lexi-v3-visual-principle{max-width:360px;font-size:12px;line-height:1.6;color:var(--muted);text-align:right}.lexi-v3-visual-grid{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(300px,.92fr);gap:18px}.lexi-v3-visual-image{min-height:330px;border:1px solid var(--line);border-radius:20px;background:rgba(120,140,132,.035);display:grid;place-items:center;overflow:hidden;position:relative}.lexi-v3-visual-image img{width:100%;height:100%;min-height:330px;object-fit:cover}.lexi-v3-visual-empty{text-align:center;display:grid;gap:7px;color:var(--muted);padding:28px}.lexi-v3-visual-empty strong{color:var(--text)}.lexi-v3-visual-loading{position:absolute;inset:0;background:rgba(250,251,249,.88);display:grid;place-items:center;text-align:center;padding:24px}.lexi-v3-visual-loading>div{display:grid;gap:8px}.lexi-v3-visual-panel{border:1px solid var(--line);border-radius:20px;padding:18px;background:var(--surface);display:grid;gap:12px;align-content:start}.lexi-v3-visual-panel h3{margin:0;font-size:16px}.lexi-v3-visual-panel p{margin:0;color:var(--muted);font-size:12px;line-height:1.6}.lexi-v3-visual-panel textarea{min-height:135px}.lexi-v3-ai-suggestion{padding:12px;border-radius:14px;background:rgba(120,140,132,.05);display:grid;gap:8px;font-size:13px;line-height:1.6}.lexi-v3-ai-suggestion small{color:var(--muted)}.lexi-v3-ai-actions,.lexi-v3-visual-actions{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.lexi-v3-visual-actions{justify-content:space-between}.lexi-v3-visual-actions>div{display:flex;gap:9px;flex-wrap:wrap}.lexi-v3-visual-error{padding:10px 12px;border:1px solid var(--line);border-radius:12px;color:var(--muted);font-size:12px;line-height:1.6}.lexi-v3-visual .learning-stage-footer{margin-top:2px;display:flex;justify-content:flex-end;gap:9px;flex-wrap:wrap}@media(max-width:820px){.lexi-v3-visual-grid{grid-template-columns:1fr}.lexi-v3-visual-principle{text-align:left}.lexi-v3-visual-actions{align-items:stretch;flex-direction:column}.lexi-v3-visual-actions>div{width:100%}.lexi-v3-visual-actions .btn,.lexi-v3-visual-actions label{flex:1;text-align:center}.lexi-v3-visual .learning-stage-footer .btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function imageGeneration(card){return card.imageGeneration&&typeof card.imageGeneration==="object"?card.imageGeneration:{};}

  function html(card){
    const note=draftFor(card);
    const image=String(card.imageData||card.imageUrl||"");
    const generation=imageGeneration(card);
    const generating=generation.status==="generating"||busy;
    const suggestion=String(card.visualSceneSuggestion?.scene||"").trim();
    const cue=String(card.visualSceneSuggestion?.cue||"").trim();
    return `<div class="lexi-v3-visual" data-visualize-stage-v3="${esc(card.id)}">
      <div class="lexi-v3-visual-head">
        <div><div class="lexi-v3-visual-kicker">VISUALIZE · 视觉联想</div><div class="lexi-v3-visual-word"><strong>${esc(card.word)}</strong><button type="button" data-visual-v3="speak" aria-label="播放发音">🔊</button></div><div class="lexi-v3-visual-meta">${esc(phonetic(card.phonetic))}${card.pos?` · ${esc(card.pos)}`:""} · ${esc(card.meaningZh||"")}</div></div>
        <div class="lexi-v3-visual-principle">先用你自己的记忆和经历想画面。AI 可以帮你把画面变得更具体，但不会替你完成第一次联想。</div>
      </div>
      <div class="lexi-v3-visual-grid">
        <div class="lexi-v3-visual-image ${image?"has-image":""}">
          ${image?`<img class="visual-memory-image generated-visual-image" data-card-id="${esc(card.id)}" src="${esc(image)}" alt="${esc(card.word)} 的联想图"/>`:`<div class="lexi-v3-visual-empty"><span>✦</span><strong>先在右侧写下你想到的画面</strong><span>写完后可以生成图片，也可以上传自己的图片。</span></div>`}
          ${generating?`<div class="lexi-v3-visual-loading"><div><span class="mini-spinner"></span><strong>正在生成联想图</strong><span>你可以先保留当前场景；图片完成后会自动更新。</span></div></div>`:""}
        </div>
        <aside class="lexi-v3-visual-panel scene-panel">
          <h3>我的联想场景</h3><p>尽量写具体的人、地点、动作或物体。越和你自己的经历有关，越容易记住。</p>
          <textarea class="textarea scene-editor" id="visual-note" ${generating?"readonly aria-readonly=\"true\"":""} placeholder="例如：我第一次去东京时，在车站看到一个巨大到让我停下来的广告牌。">${esc(note)}</textarea>
          <div class="lexi-v3-ai-actions"><button class="btn" type="button" data-visual-v3="assist" ${!String(note).trim()||generating?"disabled":""}>${suggestion?"重新给一个 AI 建议":"让 AI 帮我把画面变具体"}</button></div>
          ${suggestion?`<div class="lexi-v3-ai-suggestion"><small>AI 建议 · 仅供参考</small><span>${esc(suggestion)}</span>${cue?`<small>记忆提示：${esc(cue)}</small>`:""}<div><button class="text-action" type="button" data-visual-v3="adopt">采用这个建议</button></div></div>`:""}
        </aside>
      </div>
      ${generation.status==="error"?`<div class="lexi-v3-visual-error">${esc(generation.message||"这次图片没有生成成功，可以重试或上传自己的图片。")}</div>`:""}
      <div class="lexi-v3-visual-actions"><div><button class="btn primary" type="button" data-visual-v3="generate" ${!String(note).trim()||generating?"disabled":""}>${generating?"生成中…":image?"重新生成图片":"生成联想图"}</button><label class="btn" for="visual-v3-file" ${generating||uploadBusy?"aria-disabled=\"true\" style=\"pointer-events:none;opacity:.55\"":""}>上传图片</label></div><span style="font-size:11px;color:var(--muted)">没有图片也可以明确选择“跳过视觉联想”。</span></div>
      <input id="visual-v3-file" type="file" accept="image/png,image/jpeg,image/webp" style="display:none" />
      <div class="learning-stage-footer single-action"><button class="btn primary" type="button" data-action="finish-visual">完成视觉联想 · 明天开始造句</button></div>
    </div>`;
  }

  function render(){
    injectStyle();
    const host=document.querySelector(".study-card-focus");
    const card=currentCard();
    if(!host||!card)return;
    const generation=imageGeneration(card);
    const signature=JSON.stringify({id:card.id,note:draftFor(card),image:card.imageData||card.imageUrl||"",status:generation.status||"",message:generation.message||"",suggestion:card.visualSceneSuggestion?.scene||"",cue:card.visualSceneSuggestion?.cue||"",busy,uploadBusy});
    if(host.dataset.visualizeStageV3===signature)return;
    host.dataset.visualizeStageV3=signature;
    host.innerHTML=html(card);
  }

  async function saveCardPatch(cardId,mutate){
    const latest=await loadData();
    const card=latest?.cards?.find(item=>String(item.id)===String(cardId));
    if(!card)return null;
    mutate(card,latest);
    card.updatedAt=new Date().toISOString();
    await persist(latest);
    return data?.cards?.find(item=>String(item.id)===String(cardId))||card;
  }

  async function speak(){
    const card=currentCard();if(!card)return;
    try{if(typeof window.LexiFlowNaturalTts?.play==="function"&&await window.LexiFlowNaturalTts.play(card.word))return;}catch{}
    try{const utterance=new SpeechSynthesisUtterance(card.word);utterance.lang="en-US";speechSynthesis.cancel();speechSynthesis.speak(utterance);}catch{}
  }

  async function assist(){
    if(busy)return;
    const card=currentCard();if(!card)return;
    const note=String(document.getElementById("visual-note")?.value??draftFor(card)).trim();
    if(!note)return;
    setDraft(card.id,note);busy=true;render();
    try{
      const response=await fetch("/api/ai/visual-scene",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({word:card.word,meaningZh:card.meaningZh,exampleEn:card.exampleEn,senseIntentEn:card.senseIntentEn||"",previousScene:note})});
      if(!response.ok)throw new Error("VISUAL_ASSIST_FAILED");
      const payload=await response.json();
      const scene=String(payload.assist?.scene||"").trim();
      const cue=String(payload.assist?.cue||"").trim();
      const question=String(payload.assist?.practiceQuestion||"").trim();
      await saveCardPatch(card.id,c=>{
        c.visualSceneSuggestion={scene,cue};
        if(question)c.practicePrompt={question};
      });
    }catch(err){console.error("Visualize V3 assist failed",err);}
    finally{busy=false;await refresh();render();}
  }

  async function adopt(){
    const card=currentCard();if(!card)return;
    const suggestion=String(card.visualSceneSuggestion?.scene||"").trim();if(!suggestion)return;
    setDraft(card.id,suggestion);
    const input=document.getElementById("visual-note");
    if(input){input.value=suggestion;input.dispatchEvent(new Event("input",{bubbles:true}));}
    try{await saveCardPatch(card.id,c=>{c.visualNote=suggestion;c.visualSuggestionAdoptedAt=new Date().toISOString();});}catch{}
    await refresh();render();
  }

  async function generate(){
    if(busy)return;
    const card=currentCard();if(!card)return;
    const note=String(document.getElementById("visual-note")?.value??draftFor(card)).trim();if(!note)return;
    setDraft(card.id,note);busy=true;
    try{
      await saveCardPatch(card.id,c=>{c.visualNote=note;c.imageGeneration={status:"generating",phase:"submitted",message:"正在生成联想图。",code:"",startedAt:new Date().toISOString()};});
      render();
      const response=await fetch("/api/ai/image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({word:card.word,meaningZh:card.meaningZh,exampleEn:card.exampleEn,visualNote:note,suggestedScene:"",sourceQuery:card.sourceQuery||card.word,senseIntentEn:card.senseIntentEn||"",avoidVisualEn:Array.isArray(card.avoidVisualEn)?card.avoidVisualEn:[]})});
      let payload={};try{payload=await response.json();}catch{}
      if(!response.ok||!payload?.image?.url)throw Object.assign(new Error(payload?.error||"IMAGE_FAILED"),{payload});
      await saveCardPatch(card.id,c=>{c.imageData="";c.imageUrl=payload.image.url;c.generatedVisualScene=String(payload.image.visualNote||note||"").trim();c.imageGeneration={status:"success",phase:"done",message:"联想图已生成。",code:"",finishedAt:new Date().toISOString()};});
    }catch(err){
      const message=err?.payload?.userError?.message||"这次图片没有生成成功，可以重试或上传自己的图片。";
      try{await saveCardPatch(card.id,c=>{c.imageGeneration={status:"error",phase:"error",message,code:err?.payload?.code||"IMAGE_GENERATION_FAILED",finishedAt:new Date().toISOString()};});}catch{}
    }finally{busy=false;await refresh();render();}
  }

  async function upload(file){
    if(uploadBusy||!file)return;
    if(file.size>900*1024){window.alert("图片太大，请选择小于 900KB 的 PNG、JPG 或 WebP 图片。");return;}
    const card=currentCard();if(!card)return;
    uploadBusy=true;render();
    try{
      const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=reject;reader.onload=()=>resolve(String(reader.result||""));reader.readAsDataURL(file);});
      const response=await fetch("/api/images/local",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dataUrl})});
      if(!response.ok)throw new Error("UPLOAD_FAILED");
      const payload=await response.json();
      const note=String(document.getElementById("visual-note")?.value??draftFor(card)).trim();
      setDraft(card.id,note);
      await saveCardPatch(card.id,c=>{c.visualNote=note;c.imageData="";c.imageUrl=payload.image.url;c.generatedVisualScene="";c.imageGeneration={status:"success",phase:"done",message:"已使用本地上传图片。",code:"LOCAL_UPLOAD",finishedAt:new Date().toISOString()};});
    }catch(err){console.error("Visualize V3 upload failed",err);window.alert("图片没有保存成功，请重试。");}
    finally{uploadBusy=false;await refresh();render();}
  }

  document.addEventListener("input",event=>{
    if(event.target?.id!=="visual-note")return;
    const card=currentCard();if(!card)return;
    setDraft(card.id,event.target.value);
    const assist=document.querySelector('[data-visual-v3="assist"]');
    const generateButton=document.querySelector('[data-visual-v3="generate"]');
    const empty=!String(event.target.value||"").trim();
    if(assist)assist.disabled=empty||busy;
    if(generateButton)generateButton.disabled=empty||busy;
  },true);

  document.addEventListener("change",event=>{
    if(event.target?.id!=="visual-v3-file")return;
    const file=event.target.files?.[0];if(file)void upload(file);
  },true);

  document.addEventListener("click",event=>{
    const button=event.target?.closest?.("[data-visual-v3]");
    if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();
    const action=button.dataset.visualV3;
    if(action==="speak")void speak();
    if(action==="assist")void assist();
    if(action==="adopt")void adopt();
    if(action==="generate")void generate();
  },true);

  function schedule(){
    if(queued)return;queued=true;
    requestAnimationFrame(async()=>{queued=false;await refresh();render();});
  }
  function start(){
    const app=document.getElementById("app");if(!app)return;
    injectStyle();void refresh().then(render);
    new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();