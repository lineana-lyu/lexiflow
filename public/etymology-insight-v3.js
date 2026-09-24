(() => {
  "use strict";

  const requestCache = new Map();
  const resultCache = new Map();
  let scheduled = false;

  function clean(value){ return String(value ?? "").trim(); }
  function esc(value){
    return String(value ?? "")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }
  function keyFor(word,lemma,meaningZh){ return [clean(word).toLowerCase(),clean(lemma).toLowerCase(),clean(meaningZh)].join("|"); }
  function singleWord(word){ return /^[a-z][a-z'-]{0,63}$/i.test(clean(word)); }

  function injectStyle(){
    if(document.getElementById("lexi-etymology-style"))return;
    const style=document.createElement("style");
    style.id="lexi-etymology-style";
    style.textContent=`
      .lexi-etymology{margin:16px 0 4px;border:1px solid var(--line);border-radius:16px;background:rgba(120,140,132,.035);overflow:hidden}
      .lexi-etymology-body{padding:15px 16px}.lexi-etymology-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
      .lexi-etymology-head strong{font-size:13px}.lexi-etymology-head small{display:block;margin-top:3px;color:var(--muted);font-size:11px;line-height:1.45}
      .lexi-etymology-path{margin:12px 0 0;padding:9px 11px;border-radius:11px;background:rgba(120,140,132,.055);font-size:11.5px;line-height:1.55;color:var(--muted)}
      .lexi-etymology-components{display:grid;gap:7px;margin:12px 0}
      .lexi-etymology-component{display:grid;grid-template-columns:minmax(72px,.35fr) minmax(130px,.65fr);gap:10px;align-items:start;padding:9px 11px;border:1px solid var(--line);border-radius:12px;background:var(--surface,#fff)}
      .lexi-etymology-component b{font-size:13px;letter-spacing:.02em}.lexi-etymology-component span{font-size:11.5px;color:var(--muted);line-height:1.55}
      .lexi-etymology-explain{font-size:12.5px;line-height:1.75;color:var(--text);margin-top:10px}
      .lexi-etymology-sources{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.lexi-etymology-sources a{font-size:10.5px;color:var(--muted);text-decoration:none;border-bottom:1px dotted currentColor}
      .lexi-etymology-status{padding:13px 15px;font-size:11.5px;line-height:1.6;color:var(--muted)}
      .lexi-etymology-retry{border:0;background:transparent;padding:0;color:var(--muted);font:inherit;text-decoration:underline;text-underline-offset:2px;cursor:pointer}
      details.lexi-etymology-study>summary{list-style:none;cursor:pointer;padding:12px 15px;font-size:12px;font-weight:650;display:flex;justify-content:space-between;gap:12px}
      details.lexi-etymology-study>summary::-webkit-details-marker{display:none}details.lexi-etymology-study>summary span{color:var(--muted);font-weight:400;font-size:11px}
      @media(max-width:720px){.lexi-etymology-component{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  async function request(word,lemma,meaningZh,{forceRefresh=false}={}){
    const key=keyFor(word,lemma,meaningZh);
    if(!forceRefresh&&resultCache.has(key))return resultCache.get(key);
    if(!forceRefresh&&requestCache.has(key))return requestCache.get(key);

    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),38000);
    const task=fetch("/api/etymology/explain",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({word,lemma,meaningZh,forceRefresh}),
      signal:controller.signal,
    }).then(async response=>{
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||!payload?.ok){
        const err=new Error(payload?.error||"词源解释暂时不可用");
        err.code=payload?.code||"ETYMOLOGY_LOOKUP_FAILED";
        throw err;
      }
      resultCache.set(key,payload.result);
      return payload.result;
    }).finally(()=>{
      clearTimeout(timer);
      requestCache.delete(key);
    });
    requestCache.set(key,task);
    return task;
  }

  function sourceLinks(sources){
    const seen=new Set();
    const list=(Array.isArray(sources)?sources:[])
      .filter(item=>item?.title&&item?.url)
      .filter(item=>{
        const key=`${item.title}|${item.url}`;
        if(seen.has(key))return false;
        seen.add(key);
        return true;
      })
      .slice(0,6);
    if(!list.length)return "";
    return `<div class="lexi-etymology-sources"><span>来源</span>${list.map(item=>`<a href="${esc(item.url)}" target="_blank" rel="noreferrer">${esc(item.title)}</a>`).join("")}</div>`;
  }

  function content(result){
    if(!result)return `<div class="lexi-etymology-status">暂未取得词源结果。</div>`;
    if(result.status!=="verified_explanation"){
      const retryable=new Set(["provider_unavailable","evidence_ready_ai_unavailable"]).has(result.status);
      return `<div class="lexi-etymology-status">${esc(result.learnerExplanationZh||"暂时没有找到足够可靠的词源信息。")} ${retryable?'<button class="lexi-etymology-retry" data-etymology-refresh="1">重试</button>':""}${sourceLinks(result.sources)}</div>`;
    }
    const components=Array.isArray(result.morphology?.components)?result.morphology.components:[];
    const sourcePath=clean(result.origin?.sourcePath);
    const lemmaNote=result.lookupWord&&result.lookupWord!==result.word
      ? `<small>按原形 ${esc(result.lookupWord)} 追溯</small>`
      : `<small>从单词来源继续追到构词成分</small>`;
    return `<div class="lexi-etymology-body">
      <div class="lexi-etymology-head"><div><strong>词源与构词</strong>${lemmaNote}</div><span class="pill green">${result.cacheHit?"已缓存":"来源已核对"}</span></div>
      ${sourcePath?`<div class="lexi-etymology-path">${esc(sourcePath)}</div>`:""}
      ${components.length?`<div class="lexi-etymology-components">${components.map(item=>`<div class="lexi-etymology-component"><b>${esc(item.form)}</b><span>${esc(item.meaningZh)}${item.sourceLanguage?` · ${esc(item.sourceLanguage)}`:""}${item.sourceForm?` · ${esc(item.sourceForm)}`:""}</span></div>`).join("")}</div>`:""}
      <div class="lexi-etymology-explain">${esc(result.learnerExplanationZh)}</div>
      ${sourceLinks(result.sources)}
    </div>`;
  }

  function renderHost(host,result){
    const mode=host.dataset.etymologyHost||"lookup";
    if(mode==="study"){
      host.innerHTML=`<details class="lexi-etymology lexi-etymology-study"><summary>词源与构词 <span>理解这个词为什么这样表达</span></summary>${content(result)}</details>`;
    }else{
      host.innerHTML=`<section class="lexi-etymology" aria-label="词源与构词">${content(result)}</section>`;
    }
  }

  async function hydrate(host,{forceRefresh=false}={}){
    const word=clean(host.dataset.etymologyWord);
    const lemma=clean(host.dataset.etymologyLemma)||word;
    const meaningZh=clean(host.dataset.etymologyMeaning);
    if(!singleWord(word)){host.hidden=true;return;}
    host.hidden=false;
    const key=keyFor(word,lemma,meaningZh);
    if(!forceRefresh&&host.dataset.etymologyLoadedKey===key)return;
    host.dataset.etymologyLoadedKey=key;
    host.innerHTML=`<div class="lexi-etymology"><div class="lexi-etymology-status">正在整理“${esc(word)}”的词源证据…</div></div>`;
    try{
      const result=await request(word,lemma,meaningZh,{forceRefresh});
      if(keyFor(host.dataset.etymologyWord,host.dataset.etymologyLemma||host.dataset.etymologyWord,host.dataset.etymologyMeaning)!==key)return;
      renderHost(host,result);
    }catch(err){
      if(err?.name==="AbortError"){
        host.innerHTML=`<div class="lexi-etymology"><div class="lexi-etymology-status">词源查询超时。<button class="lexi-etymology-retry" data-etymology-refresh="1">重试</button></div></div>`;
      }else{
        host.innerHTML=`<div class="lexi-etymology"><div class="lexi-etymology-status">词源解释暂时不可用。<button class="lexi-etymology-retry" data-etymology-refresh="1">重试</button></div></div>`;
      }
    }
  }

  function scan(){
    injectStyle();
    document.querySelectorAll("[data-etymology-host]").forEach(host=>void hydrate(host));
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;scan();});
  }

  document.addEventListener("click",event=>{
    const retry=event.target?.closest?.("[data-etymology-refresh]");
    if(!retry)return;
    const host=retry.closest("[data-etymology-host]");
    if(!host)return;
    const key=keyFor(host.dataset.etymologyWord,host.dataset.etymologyLemma||host.dataset.etymologyWord,host.dataset.etymologyMeaning);
    resultCache.delete(key);
    requestCache.delete(key);
    delete host.dataset.etymologyLoadedKey;
    void hydrate(host,{forceRefresh:true});
  },true);

  function start(){
    scan();
    const app=document.getElementById("app");
    if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
  }

  window.LexiFlowEtymologyInsightV3=Object.freeze({
    refresh(){document.querySelectorAll("[data-etymology-host]").forEach(host=>{delete host.dataset.etymologyLoadedKey;void hydrate(host,{forceRefresh:true});});}
  });

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();