(() => {
  "use strict";

  const KEY="lexiflow-review-resume-v2";
  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before review-v2.js");
  let data=null, queued=false, autoResuming=false, leavingDeferred=false;

  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const norm=v=>String(v||"").trim().toLowerCase().replace(/[’‘]/g,"'").replace(/^[\s.,!?;:()\[\]{}"']+|[\s.,!?;:()\[\]{}"']+$/g,"").replace(/\s+/g," ");
  const phonetic=v=>{const s=String(v||"").trim();return !s?"暂无音标":((s.startsWith("/")&&s.endsWith("/"))||(s.startsWith("[")&&s.endsWith("]")))?s:`/${s}/`;};
  const load=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||"{}");return x&&typeof x==="object"?x:{};}catch{return {};}};
  const save=x=>{try{localStorage.setItem(KEY,JSON.stringify(x));}catch{}};
  const clear=()=>{try{localStorage.removeItem(KEY);}catch{}};
  const today=()=>core.dayKey(new Date());

  async function refresh(){
    try{const r=await fetch("/api/learning-data",{cache:"no-store"});if(r.ok){const p=await r.json();if(p?.data?.cards)data=p.data;}}catch{}
  }

  function currentCard(){
    if(!data?.cards)return null;
    const explicit=document.querySelector("[data-lexi-r2-word]")?.dataset.lexiR2Word;
    const word=String(explicit||document.querySelector(".review-depth-stage .target-word-text")?.textContent||"").trim().toLowerCase();
    if(!word)return null;
    return data.cards.find(x=>String(x.word||"").trim().toLowerCase()===word)||null;
  }

  function typeSettings(card){
    const settings=data?.settings||{};
    const enabled={enZh:true,zhEn:true,imageEn:true,...(settings.reviewTypes||{})};
    const weights={enZh:30,zhEn:50,imageEn:20,...(settings.reviewTypeWeights||{})};
    const options=[];
    if(enabled.enZh!==false)options.push({type:"en-zh",weight:Math.max(1,Number(weights.enZh)||30)});
    if(enabled.zhEn!==false)options.push({type:"zh-en",weight:Math.max(1,Number(weights.zhEn)||50)});
    if(enabled.imageEn!==false&&(card.imageData||card.imageUrl))options.push({type:"image-en",weight:Math.max(1,Number(weights.imageEn)||20)});
    if(!options.length)options.push({type:"zh-en",weight:1});
    return options;
  }

  function hashSeed(value){
    let h=2166136261;
    for(const ch of String(value||"")){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
    return h>>>0;
  }

  function typeFor(card){
    const options=typeSettings(card);
    const total=options.reduce((sum,item)=>sum+item.weight,0);
    let target=hashSeed(`${card.id}:${Number(card.reviewCount||0)}:${today()}`)%total;
    for(const item of options){if(target<item.weight)return item.type;target-=item.weight;}
    return options[0].type;
  }

  function typeAvailable(card,type){return typeSettings(card).some(item=>item.type===type);}

  function activeFor(card){
    const stored=load().active;
    if(stored&&stored.date===today()&&stored.cardId===card.id&&Number(stored.reviewCount)===Number(card.reviewCount||0)&&typeAvailable(card,stored.type))return stored;
    const next={date:today(),cardId:card.id,reviewCount:Number(card.reviewCount||0),type:typeFor(card),revealed:false,draft:"",checked:false,correct:null};save({active:next});return next;
  }

  function plannedToday(card){
    const plan=data?.dailyPlan;
    if(!plan||plan.date!==today()||plan.frozen!==true||!Array.isArray(plan.review))return true;
    return plan.review.includes(card.id);
  }

  function exitDeferredCard(card){
    if(!card||plannedToday(card)||leavingDeferred)return false;
    leavingDeferred=true;
    clear();
    requestAnimationFrame(()=>{
      const exit=Array.from(document.querySelectorAll('[data-route="review"]')).find(node=>/退出复习/.test(node.textContent||""))||document.querySelector('[data-route="review"]');
      if(exit)exit.click();else location.reload();
      setTimeout(()=>{leavingDeferred=false;},250);
    });
    return true;
  }

  function injectStyle(){
    if(document.getElementById("lexi-r2-style"))return;
    const s=document.createElement("style");s.id="lexi-r2-style";s.textContent=`.lexi-r2{width:min(650px,100%);margin:8px auto 0;display:flex;flex-direction:column;align-items:center;text-align:center;gap:18px}.lexi-r2-type{font-size:13px;font-weight:700;color:var(--muted);letter-spacing:.08em}.lexi-r2-prompt{font-size:30px;font-weight:750;line-height:1.45}.lexi-r2-input{display:flex;gap:10px;width:min(500px,100%)}.lexi-r2-input input{text-align:center;font-size:18px}.lexi-r2-result{width:min(540px,100%);border:1px solid var(--line);border-radius:18px;padding:18px;display:flex;flex-direction:column;gap:10px;align-items:center;background:var(--surface)}.lexi-r2-result>span{color:var(--muted)}.lexi-r2-word{display:flex;align-items:center;gap:9px}.lexi-r2-word strong{font-size:32px}.lexi-r2-word button{border:0;background:transparent;cursor:pointer}.lexi-r2-meta{font-size:14px;color:var(--muted)}.lexi-r2-image{width:min(360px,82vw);aspect-ratio:4/3;object-fit:cover;border-radius:18px;border:1px solid var(--line)}.lexi-r2-badge{display:inline-flex;margin:0 auto 12px;padding:5px 9px;border-radius:999px;border:1px solid var(--line);font-size:12px;color:var(--muted)}@media(max-width:700px){.lexi-r2-input{flex-direction:column}.lexi-r2-prompt{font-size:25px}}`;document.head.appendChild(s);
  }

  function typedHtml(card,a){
    const image=a.type==="image-en"?`<img class="lexi-r2-image" src="${esc(card.imageData||card.imageUrl)}" alt="联想图"/>`:`<div class="lexi-r2-prompt">${esc(card.meaningZh)}</div>`;
    return `<div class="lexi-r2" data-lexi-r2-word="${esc(card.word)}"><div class="lexi-r2-type">${a.type==="image-en"?"图片 → 英文":"中文 → 英文"}</div>${image}<p style="color:var(--muted);margin:0">不要先看答案，直接把英文词写出来。</p><div class="lexi-r2-input"><input id="lexi-r2-answer" class="input" value="${esc(a.draft||"")}" autocomplete="off" spellcheck="false" ${a.checked?"readonly":""}/>${a.checked?"":`<button class="btn primary" type="button" data-r2="check">提交答案</button>`}</div>${a.checked?`<div class="lexi-r2-result"><strong>${a.correct?"主动回忆成功":"这次没有完整想起来"}</strong><span>${a.correct?"你没有先看答案就把词提取出来了。":"先看清答案，下一次仍需重新主动提取。"}</span><div class="lexi-r2-word"><strong>${esc(card.word)}</strong><button type="button" data-r2="speak">🔊</button></div><div class="lexi-r2-meta">${esc(phonetic(card.phonetic))} · ${esc(card.meaningZh)}</div><button class="btn primary" type="button" data-r2="finish" data-quality="${a.correct?"good":"again"}">${a.correct?"记住了，继续":"没记住，进入修复"}</button></div>`:""}</div>`;
  }

  function decorate(){
    injectStyle();
    const host=document.querySelector(".review-depth-stage .study-card");if(!host)return;
    const card=currentCard();if(!card)return;
    if(exitDeferredCard(card))return;
    const a=activeFor(card), key=`${card.id}:${card.reviewCount}:${a.date}:${a.type}`;if(host.dataset.lexiR2===key)return;host.dataset.lexiR2=key;
    const center=host.querySelector(".study-center");if(!center)return;
    host.querySelector(".lexi-r2")?.remove();host.querySelector(".lexi-r2-badge")?.remove();
    if(a.type==="en-zh"){
      center.style.display="";
      const badge=document.createElement("div");badge.className="lexi-r2-badge";badge.textContent="英文 → 中文 · 主动回忆";center.insertBefore(badge,center.firstChild);
      if(a.revealed&&center.querySelector('[data-action="review-reveal"]'))requestAnimationFrame(()=>center.querySelector('[data-action="review-reveal"]')?.click());
      return;
    }
    center.style.display="none";
    const wrap=document.createElement("div");wrap.innerHTML=typedHtml(card,a);host.appendChild(wrap.firstElementChild);
    if(!a.checked)requestAnimationFrame(()=>document.getElementById("lexi-r2-answer")?.focus());
  }

  async function speak(card){
    try{if(typeof window.LexiFlowNaturalTts?.play==="function"&&await window.LexiFlowNaturalTts.play(card.word))return;}catch{}
    try{const u=new SpeechSynthesisUtterance(card.word);u.lang="en-US";speechSynthesis.cancel();speechSynthesis.speak(u);}catch{}
  }

  document.addEventListener("click",e=>{
    const b=e.target?.closest?.("[data-r2]");
    if(b){
      e.preventDefault();e.stopImmediatePropagation();const card=currentCard();if(!card)return;const a=activeFor(card);
      if(b.dataset.r2==="speak"){void speak(card);return;}
      if(b.dataset.r2==="check"){const input=document.getElementById("lexi-r2-answer"),v=String(input?.value||a.draft||"").trim();if(!v){input?.focus();return;}a.draft=v;a.checked=true;a.correct=norm(v)===norm(card.word);save({active:a});document.querySelector(".review-depth-stage .study-card")?.removeAttribute("data-lexi-r2");decorate();return;}
      if(b.dataset.r2==="finish"){const quality=b.dataset.quality;clear();const hidden=document.querySelector(`.review-depth-stage [data-action="review-rate"][data-quality="${quality}"]`);hidden?.click();return;}
    }
    const reveal=e.target?.closest?.('[data-action="review-reveal"]');if(reveal){const card=currentCard();if(card){const a=activeFor(card);a.revealed=true;save({active:a});}}
    const rate=e.target?.closest?.('[data-action="review-rate"]');
    if(rate){
      const card=currentCard();
      if(rate.dataset.quality==="again"&&card){const a=activeFor(card);save({active:{...a,forceResume:true}});}
      else clear();
    }
    const exit=e.target?.closest?.('[data-route="review"]');if(exit&&document.querySelector(".review-depth-stage"))clear();
  },true);

  document.addEventListener("input",e=>{if(e.target?.id!=="lexi-r2-answer")return;const card=currentCard();if(!card)return;const a=activeFor(card);a.draft=e.target.value;save({active:a});},true);
  document.addEventListener("keydown",e=>{if(e.target?.id==="lexi-r2-answer"&&e.key==="Enter"&&!e.isComposing){e.preventDefault();document.querySelector('[data-r2="check"]')?.click();}},true);

  function resumeIfNeeded(){
    const a=load().active;if(!a||autoResuming||document.querySelector(".review-depth-stage"))return;
    if(a.date!==today()){clear();return;}
    const home=Array.from(document.querySelectorAll("h1,h2")).some(x=>x.textContent.trim()==="今日学习");if(!home)return;
    const card=data?.cards?.find(x=>x.id===a.cardId);if(!card||card.stage!=="review"||!card.nextReviewAt||new Date(card.nextReviewAt).getTime()>Date.now()||!plannedToday(card)){clear();return;}
    const button=document.querySelector('[data-action="start-review"]');if(button){autoResuming=true;setTimeout(()=>{button.click();autoResuming=false;},120);}
  }

  function schedule(){if(queued)return;queued=true;requestAnimationFrame(async()=>{queued=false;await refresh();decorate();resumeIfNeeded();});}
  function start(){const app=document.getElementById("app");if(!app)return;injectStyle();void refresh().then(()=>{decorate();resumeIfNeeded();});new MutationObserver(schedule).observe(app,{childList:true,subtree:true});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();