(() => {
  "use strict";

  const previousFetch = window.fetch.bind(window);
  const DRAFT_KEY = "lexiflow-source-context-draft-v2";
  let latestData = null;
  let scheduled = false;
  const sourceMap = new Map();

  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const labels = {
    video:"视频 / 影视",
    article:"文章 / 书",
    conversation:"对话",
    synonym:"同义词 / 关联词",
    work:"工作 / 学习材料",
    other:"其他",
  };

  function endpointOf(input){
    try{return new URL(typeof input === "string" ? input : input?.url || "",location.href).pathname;}catch{return "";}
  }
  function parseBody(init){
    if(!init || typeof init.body !== "string") return null;
    try{return JSON.parse(init.body);}catch{return null;}
  }
  function withJson(init,body){
    return {...(init||{}),headers:{"Content-Type":"application/json",...((init&&init.headers)||{})},body:JSON.stringify(body)};
  }
  function responseWithJson(original,payload){
    const headers=new Headers(original.headers||{});headers.set("Content-Type","application/json; charset=utf-8");headers.delete("Content-Length");
    return new Response(JSON.stringify(payload),{status:original.status,statusText:original.statusText,headers});
  }

  function loadDraft(){
    try{
      const parsed=JSON.parse(localStorage.getItem(DRAFT_KEY)||"{}");
      return parsed&&typeof parsed==="object"?parsed:{};
    }catch{return {};}
  }
  function saveDraft(next){
    try{localStorage.setItem(DRAFT_KEY,JSON.stringify(next));}catch{}
  }
  function clearDraft(){
    try{localStorage.removeItem(DRAFT_KEY);}catch{}
  }

  function sourceFields(card){
    return {
      sourceType:String(card?.sourceType||""),
      sourceTitle:String(card?.sourceTitle||""),
      sourceContext:String(card?.sourceContext||""),
      sourceCapturedAt:String(card?.sourceCapturedAt||""),
    };
  }
  function hasSource(fields){
    return Boolean(String(fields?.sourceType||"").trim() || String(fields?.sourceTitle||"").trim() || String(fields?.sourceContext||"").trim());
  }
  function hydrateSourceMap(data){
    if(!Array.isArray(data?.cards)) return;
    for(const card of data.cards){
      const fields=sourceFields(card);
      if(hasSource(fields)) sourceMap.set(card.id,fields);
    }
  }

  window.fetch = async function lexiFlowSourceContextFetch(input,init={}){
    const endpoint=endpointOf(input), method=String(init?.method||"GET").toUpperCase();
    if(endpoint==="/api/learning-data"&&method==="POST"){
      const body=parseBody(init);
      if(body?.data?.cards){
        const known=new Set((latestData?.cards||[]).map(card=>card.id));
        const draft=loadDraft();
        let attachedNew=false;
        for(const card of body.data.cards){
          const remembered=sourceMap.get(card.id);
          if(remembered){
            if(!card.sourceType)card.sourceType=remembered.sourceType;
            if(!card.sourceTitle)card.sourceTitle=remembered.sourceTitle;
            if(!card.sourceContext)card.sourceContext=remembered.sourceContext;
            if(!card.sourceCapturedAt)card.sourceCapturedAt=remembered.sourceCapturedAt;
          }
          if(!known.has(card.id)&&card.stage==="select"){
            const fields={
              sourceType:String(draft.sourceType||"other"),
              sourceTitle:String(draft.sourceTitle||"").trim(),
              sourceContext:String(draft.sourceContext||"").trim(),
              sourceCapturedAt:new Date().toISOString(),
            };
            card.sourceType=fields.sourceType;
            card.sourceTitle=fields.sourceTitle;
            card.sourceContext=fields.sourceContext;
            card.sourceCapturedAt=fields.sourceCapturedAt;
            sourceMap.set(card.id,fields);
            attachedNew=true;
          }
        }
        const response=await previousFetch(input,withJson(init,body));
        if(response.ok){
          latestData=body.data;
          hydrateSourceMap(latestData);
          if(attachedNew)clearDraft();
        }
        return response;
      }
    }

    const response=await previousFetch(input,init);
    if(endpoint==="/api/learning-data"&&method==="GET"&&response.ok){
      try{
        const payload=await response.clone().json();
        if(payload?.data){
          latestData=payload.data;
          hydrateSourceMap(latestData);
          return responseWithJson(response,payload);
        }
      }catch{}
    }
    return response;
  };

  async function refresh(){
    try{
      const response=await previousFetch("/api/learning-data",{cache:"no-store"});
      if(response.ok){const payload=await response.json();if(payload?.data){latestData=payload.data;hydrateSourceMap(latestData);}}
    }catch{}
  }

  function injectStyle(){
    if(document.getElementById("lexi-source-style"))return;
    const style=document.createElement("style");style.id="lexi-source-style";
    style.textContent=`
      .lexi-source-box{margin:14px 0;padding:16px;border:1px solid var(--line);border-radius:18px;background:rgba(120,140,132,.035)}
      .lexi-source-box-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.lexi-source-box-head strong{font-size:14px}.lexi-source-box-head span{font-size:12px;color:var(--muted);line-height:1.5;text-align:right}
      .lexi-source-grid{display:grid;grid-template-columns:minmax(160px,.7fr) minmax(220px,1.3fr);gap:10px}.lexi-source-grid .field{margin:0}.lexi-source-context-field{grid-column:1/-1}.lexi-source-box textarea{min-height:84px}.lexi-source-reminder{margin:10px 0 16px;padding:11px 13px;border:1px solid var(--line);border-radius:14px;background:rgba(120,140,132,.045);font-size:12px;line-height:1.65;color:var(--muted)}.lexi-source-reminder strong{display:block;color:var(--text);font-size:12px;margin-bottom:2px}.lexi-source-tag{display:inline-flex;margin-right:6px;padding:3px 7px;border-radius:999px;border:1px solid var(--line);font-size:11px;color:var(--muted)}
      @media(max-width:720px){.lexi-source-grid{grid-template-columns:1fr}.lexi-source-context-field{grid-column:auto}.lexi-source-box-head{flex-direction:column}.lexi-source-box-head span{text-align:left}}
    `;document.head.appendChild(style);
  }

  function sourceEditorHtml(){
    const draft=loadDraft();
    const type=String(draft.sourceType||"other");
    return `<div class="lexi-source-box" id="lexi-source-box"><div class="lexi-source-box-head"><strong>你在哪里遇到这个词？</strong><span>可选。保留真实语境后，Visualize 和 Apply 会优先提醒这个场景。</span></div><div class="lexi-source-grid"><div class="field"><label>来源</label><select class="input" id="lexi-source-type">${Object.entries(labels).map(([key,label])=>`<option value="${key}" ${key===type?"selected":""}>${label}</option>`).join("")}</select></div><div class="field"><label>来源名称</label><input class="input" id="lexi-source-title" value="${esc(draft.sourceTitle||"")}" placeholder="例如：某个 B 站视频、一本书、一场会议" /></div><div class="field lexi-source-context-field"><label>当时的原句 / 场景</label><textarea class="textarea" id="lexi-source-context" placeholder="例如：老师说 The room was enormous，我当时想到学校最大的报告厅。">${esc(draft.sourceContext||"")}</textarea></div></div></div>`;
  }

  function decorateAdd(){
    const save=document.querySelector('[data-action="save-card"]');
    if(!save||document.getElementById("lexi-source-box")||document.querySelector(".study-card-focus"))return;
    const holder=document.createElement("div");holder.innerHTML=sourceEditorHtml();
    const box=holder.firstElementChild;
    const parent=save.parentElement;
    if(parent)parent.insertAdjacentElement("beforebegin",box);
  }

  function currentCard(){
    if(!latestData?.cards)return null;
    const id=String(window.LexiFlowStudyRenderer?.currentCardId?.()||"");
    if(!id)return null;
    return latestData.cards.find(card=>String(card.id)===id)||null;
  }

  function reminderCopy(card){
    const type=labels[card.sourceType]||labels.other;
    const title=String(card.sourceTitle||"").trim();
    const context=String(card.sourceContext||"").trim();
    if(!title&&!context)return "";
    const stage=String(card.stage||"");
    let cue="保留你第一次遇到这个词时的真实语境。";
    if(stage==="visualize")cue="先回想这个真实场景，再产生你自己的视觉联想。";
    if(stage==="apply")cue="先围绕这个真实场景，写一句你自己真的会说的话。";
    if(stage==="select")cue="确认这是不是你真正想学的这个词义。";
    return `<div class="lexi-source-reminder" data-source-card="${esc(card.id)}"><strong><span class="lexi-source-tag">${esc(type)}</span>${title?esc(title):"最初语境"}</strong>${context?`<div>${esc(context)}</div>`:""}<div>${esc(cue)}</div></div>`;
  }

  function decorateStudy(){
    const host=document.querySelector(".study-card-focus");if(!host)return;
    const card=currentCard();if(!card)return;
    const html=reminderCopy(card);if(!html)return;
    const existing=host.querySelector(".lexi-source-reminder");
    if(existing?.dataset.sourceCard===card.id)return;
    existing?.remove();
    const kicker=host.querySelector(".study-kicker");
    if(kicker)kicker.insertAdjacentHTML("afterend",html);else host.insertAdjacentHTML("afterbegin",html);
  }

  function persistDraftFromUi(){
    const type=document.getElementById("lexi-source-type"),title=document.getElementById("lexi-source-title"),context=document.getElementById("lexi-source-context");
    if(!type&&!title&&!context)return;
    saveDraft({sourceType:String(type?.value||"other"),sourceTitle:String(title?.value||""),sourceContext:String(context?.value||"")});
  }

  document.addEventListener("input",event=>{if(["lexi-source-title","lexi-source-context"].includes(event.target?.id))persistDraftFromUi();},true);
  document.addEventListener("change",event=>{if(event.target?.id==="lexi-source-type")persistDraftFromUi();},true);

  function decorate(){injectStyle();decorateAdd();decorateStudy();}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(async()=>{scheduled=false;await refresh();decorate();});}
  function start(){const app=document.getElementById("app");if(!app)return;injectStyle();void refresh().then(decorate);new MutationObserver(schedule).observe(app,{childList:true,subtree:true});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();