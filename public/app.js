
(() => {
  "use strict";

  const STORAGE_KEY = "lexiflow-standalone-mvp-v1";
  const APP_VERSION = 1;

  const state = {
    route: "home",
    data: defaultData(),
    toast: "",
    modal: null,
    lookup: null,
    selectedSenseId: null,
    addDraft: null,
    addToTodayIntent: null,
    study: null,
    librarySearch: "",
    libraryEditor: null,
    lookupStatus: "idle",
    providerStatus: null,
    providerChecks: { dictionary:null, ai:null },
    loadingMoreSenses: false,
    pronunciationHydration: {},
    notice: null,
    searchResolution: null,
    lookupAlternativesOpen: false,
  };

  function defaultData(){
    return {
      version: APP_VERSION,
      cards: [],
      activities: [],
      settings: { dailyGoal: 3, ttsVoice: "af_bella" },
      createdAt: new Date().toISOString()
    };
  }

  function normalizeLearningData(parsed){
    return { ...defaultData(), ...(parsed||{}), settings:{dailyGoal:3,ttsVoice:"af_bella",...(parsed?.settings||{})} };
  }

  function loadLegacyBrowserData(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      if(!raw)return null;
      return normalizeLearningData(JSON.parse(raw));
    }catch{return null;}
  }

  let persistenceReady=false;
  let persistenceQueue=Promise.resolve();

  function syncAppDataFromGateway(snapshot){
    if(!snapshot||!Array.isArray(snapshot.cards))return false;
    state.data=normalizeLearningData(snapshot);
    return true;
  }

  const learningDataGateway=window.LexiFlowLearningDataGatewayV3;
  if(learningDataGateway?.registerAfterPersist){
    learningDataGateway.registerAfterPersist(snapshot=>{syncAppDataFromGateway(snapshot);});
    const current=learningDataGateway.current?.();
    if(current?.cards)syncAppDataFromGateway(current);
  }

  function saveData(){
    if(!persistenceReady)return;
    const snapshot=JSON.parse(JSON.stringify(state.data));
    persistenceQueue=persistenceQueue
      .catch(()=>{})
      .then(()=>api("/api/learning-data",{method:"POST",body:{data:snapshot,appShellAuthority:"v1"}}))
      .catch(err=>{
        console.error("learning data save failed",err);
        if(!state.notice) showNotice("学习进度暂未保存","本机存储暂时不可用，请稍后重试。","error");
      });
  }

  async function hydrateLearningData(){
    const legacy=loadLegacyBrowserData();
    const payload=await api("/api/learning-data");
    if(payload.hasStoredData){
      state.data=normalizeLearningData(payload.data);
    }else if(legacy && (legacy.cards.length||legacy.activities.length)){
      state.data=legacy;
      await api("/api/learning-data",{method:"POST",body:{data:state.data,appShellAuthority:"v1",reason:"legacy-browser-migration"}});
      try{localStorage.removeItem(STORAGE_KEY);}catch{}
    }else{
      state.data=normalizeLearningData(payload.data);
    }
    persistenceReady=true;
  }

  function uid(){
    return (crypto.randomUUID ? crypto.randomUUID() : "id-"+Date.now()+"-"+Math.random().toString(16).slice(2));
  }

  function todayKey(date=new Date()){
    const y=date.getFullYear(), m=String(date.getMonth()+1).padStart(2,"0"), d=String(date.getDate()).padStart(2,"0");
    return `${y}-${m}-${d}`;
  }

  function addDays(date,days){
    const d=new Date(date); d.setDate(d.getDate()+days); return d;
  }

  function toast(msg){
    state.toast=msg; render();
    setTimeout(()=>{ if(state.toast===msg){state.toast="";render();}},2200);
  }

  function recordActivity(type, cardId, extra={}){
    state.data.activities.push({id:uid(),type,cardId,at:new Date().toISOString(),...extra});
    saveData();
  }

  function escapeHtml(v){
    return String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }


  const LOCAL_API_ORIGIN = location.protocol === "file:" ? "http://127.0.0.1:4177" : "";

  async function api(path, options={}){
    let response;
    try{
      response=await fetch(`${LOCAL_API_ORIGIN}${path}`,{
        method:options.method||"GET",
        headers:{"Content-Type":"application/json",...(options.headers||{})},
        body:options.body===undefined?undefined:JSON.stringify(options.body)
      });
    }catch(cause){
      const err=new Error("本地 LexiFlow 服务未连接");
      err.code="LOCAL_SERVICE_UNAVAILABLE";
      err.cause=cause;
      err.userError={
        title:"本地服务没有启动",
        message:"请关闭当前页面，双击解压目录里的“启动LexiFlow.bat”。启动窗口保持打开后，再在浏览器中使用 LexiFlow。"
      };
      throw err;
    }
    let payload={};
    try{payload=await response.json();}catch{}
    if(!response.ok){
      const err=new Error(payload.error||`请求失败：HTTP ${response.status}`);
      err.code=payload.code||"HTTP_ERROR";
      err.payload=payload;
      err.userError=payload.userError||null;
      throw err;
    }
    return payload;
  }

  function captureProviderDraft(){
    const ids=["word-input","mw-api-key","codex-model-select","codex-model-custom","codex-effort"];
    const values={};
    for(const id of ids){
      const el=document.getElementById(id);
      if(el) values[id]=el.value;
    }
    const active=document.activeElement;
    return {
      values,
      activeId:active?.id||"",
      selectionStart:typeof active?.selectionStart==="number"?active.selectionStart:null,
      selectionEnd:typeof active?.selectionEnd==="number"?active.selectionEnd:null
    };
  }

  function restoreProviderDraft(draft){
    if(!draft)return;
    for(const [id,value] of Object.entries(draft.values||{})){
      const el=document.getElementById(id);
      if(el) el.value=value;
    }

    document.querySelectorAll("[data-library-card]").forEach(row=>{
      const open=()=>openLibraryEditor(row.dataset.libraryCard);
      row.addEventListener("click",e=>{
        if(e.target.closest("button,a,input,label,textarea,select"))return;
        open();
      });
      row.addEventListener("keydown",e=>{
        if((e.key==="Enter"||e.key===" ")&&!e.target.closest("button,a,input,label,textarea,select")){
          e.preventDefault();
          open();
        }
      });
    });

    const libraryImageFile=document.getElementById("library-image-file");
    if(libraryImageFile) libraryImageFile.addEventListener("change",e=>{
      const file=e.target.files?.[0];if(!file)return;
      if(file.size>900*1024){showNotice("图片太大","请选择小于 900KB 的 PNG、JPG 或 WebP 图片。","warn");return;}
      const editor=state.libraryEditor;
      if(!editor)return;
      const cardId=editor.cardId;
      const draft=captureLibraryEditorDraft();
      const reader=new FileReader();
      reader.onload=async()=>{
        try{
          const payload=await api("/api/images/local",{method:"POST",body:{dataUrl:String(reader.result||"")}});
          if(state.libraryEditor?.cardId!==cardId)return;
          state.libraryEditor.draft={
            ...draft,
            imageData:"",
            imageUrl:payload.image.url,
            generatedVisualScene:"",
            imageGeneration:{status:"success",message:"已选择本地图片。",code:"LOCAL_UPLOAD",finishedAt:new Date().toISOString()}
          };
          render();
        }catch(err){
          if(state.libraryEditor?.cardId===cardId)showErrorNotice(err,"图片没有保存成功");
        }
      };
      reader.readAsDataURL(file);
    });

    document.querySelectorAll(".library-editor-image").forEach(img=>img.addEventListener("error",()=>{
      const editor=state.libraryEditor;
      if(!editor)return;
      const card=getCard(editor.cardId);
      const draft=editor.draft||libraryEditorBaseDraft(card);
      editor.draft={...draft,imageData:"",imageUrl:"",imageGeneration:{status:"error",message:"原图片文件已不在本机。",code:"IMAGE_MISSING",finishedAt:new Date().toISOString()}};
      render();
    }));

    const modelSelect=document.getElementById("codex-model-select");
    const custom=document.getElementById("codex-model-custom");
    if(modelSelect&&custom) custom.style.display=modelSelect.value==="__custom__"?"block":"none";
    const active=draft.activeId&&document.getElementById(draft.activeId);
    if(active){
      active.focus();
      if(draft.selectionStart!==null&&typeof active.setSelectionRange==="function"){
        active.setSelectionRange(draft.selectionStart,draft.selectionEnd??draft.selectionStart);
      }
    }
  }

  async function refreshProviderStatus(silent=true){
    try{
      const payload=await api("/api/status");
      const draft=captureProviderDraft();
      state.providerStatus=payload;
      render();
      restoreProviderDraft(draft);
      if(!silent) toast("服务状态已刷新");
    }catch(err){
      const draft=captureProviderDraft();
      state.providerStatus={ok:false,serviceUnavailable:true};
      render();
      restoreProviderDraft(draft);
      if(!silent) showErrorNotice(err,"本地服务没有启动");
    }
  }

  let providerVerificationPromise=null;
  async function verifyProviderConnectionsOnStartup({force=false}={}){
    if(providerVerificationPromise&&!force)return providerVerificationPromise;
    const task=(async()=>{
      try{
        const status=await api("/api/status");
        state.providerStatus=status;
        const jobs=[];
        if(status?.dictionary?.fallbackConfigured){
          state.providerChecks.dictionary={status:"checking",at:""};
          jobs.push(api("/api/dictionary/test",{method:"POST",body:{}})
            .then(()=>{state.providerChecks.dictionary={status:"passed",at:new Date().toISOString()};})
            .catch(()=>{state.providerChecks.dictionary={status:"failed",at:new Date().toISOString()};}));
        }else state.providerChecks.dictionary=null;
        if(status?.codex?.cliAvailable&&status?.codex?.authFound){
          state.providerChecks.ai={status:"checking",at:""};
          jobs.push(api("/api/ai/test",{method:"POST",body:{}})
            .then(payload=>{state.providerChecks.ai={status:payload?.test?.status==="passed"?"passed":"failed",at:payload?.test?.at||new Date().toISOString()};})
            .catch(()=>{state.providerChecks.ai={status:"failed",at:new Date().toISOString()};}));
        }else state.providerChecks.ai=null;
        render();
        await Promise.allSettled(jobs);
        await refreshProviderStatus(true);
        render();
      }catch{}
    })();
    providerVerificationPromise=task.finally(()=>{if(providerVerificationPromise===task)providerVerificationPromise=null;});
    return providerVerificationPromise;
  }

  async function ensureCardPronunciation(card){
    const cardId=String(card?.id||"");
    const word=String(card?.word||"").trim();
    const existingAudios=Array.isArray(card?.audioUrls)?card.audioUrls.filter(Boolean):[];
    if(!cardId || !word || card.audioUrl || existingAudios.length || state.pronunciationHydration[cardId]) return;
    state.pronunciationHydration[cardId]="loading";
    try{
      const payload=await api("/api/dictionary/pronunciation",{method:"POST",body:{word}});
      const target=getCard(cardId);
      if(!target){state.pronunciationHydration[cardId]="done";return;}
      const phonetic=String(payload.result?.phonetic||"").trim();
      const audioUrl=String(payload.result?.audioUrl||"").trim();
      const audioUrls=Array.isArray(payload.result?.audioUrls)?payload.result.audioUrls.map(String).filter(Boolean):[];
      if(phonetic) target.phonetic=phonetic;
      if(audioUrl && !target.audioUrl) target.audioUrl=audioUrl;
      if(audioUrls.length) target.audioUrls=audioUrls;
      if(payload.result?.pronunciationSource) target.pronunciationSource=String(payload.result.pronunciationSource);
      if(phonetic || audioUrl || audioUrls.length){target.updatedAt=new Date().toISOString();saveData();}
      state.pronunciationHydration[cardId]="done";
      render();
    }catch{
      state.pronunciationHydration[cardId]="failed";
      render();
    }
  }

  function showNotice(title,message,tone="warn"){
    state.notice={title:String(title||"提示"),message:String(message||""),tone};
    render();
  }

  function showErrorNotice(err,fallbackTitle="操作没有完成"){
    const user=err?.userError||err?.payload?.userError;
    if(user?.title||user?.message){
      showNotice(user?.title||fallbackTitle,user?.message||"请稍后重试。","error");
      return;
    }
    if(err?.code==="LOCAL_SERVICE_UNAVAILABLE" || /failed to fetch/i.test(String(err?.message||""))){
      showNotice(
        "本地服务没有启动",
        "请关闭当前页面，双击解压目录里的“启动LexiFlow.bat”。启动窗口保持打开后，再在浏览器中使用 LexiFlow。",
        "error"
      );
      return;
    }
    showNotice(fallbackTitle,"当前操作没有完成，请稍后重试。","error");
  }

  function renderNotice(){
    if(!state.notice)return "";
    return `<div class="persistent-notice ${escapeHtml(state.notice.tone||"warn")}">
      <div><strong>${escapeHtml(state.notice.title)}</strong><p>${escapeHtml(state.notice.message)}</p></div>
      <button class="btn small" data-action="dismiss-notice">知道了</button>
    </div>`;
  }

  function normalizeSearchText(v){return String(v||"").trim().toLowerCase();}

  function levenshtein(a,b){
    const s=Array.from(normalizeSearchText(a)),t=Array.from(normalizeSearchText(b));
    const prev=Array.from({length:t.length+1},(_,i)=>i);
    for(let i=1;i<=s.length;i++){
      const cur=[i];
      for(let j=1;j<=t.length;j++){
        const cost=s[i-1]===t[j-1]?0:1;
        cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+cost);
      }
      for(let j=0;j<cur.length;j++)prev[j]=cur[j];
    }
    return prev[t.length];
  }

  function localSearchCandidates(query){
    const q=normalizeSearchText(query);
    if(!q)return [];
    const hits=[];
    const seen=new Set();
    for(const c of state.data.cards){
      const w=normalizeSearchText(c.word),m=normalizeSearchText(c.meaningZh);
      const direct=w.includes(q)||m.includes(q)||q.includes(m);
      const wd=levenshtein(w,q),md=levenshtein(m.replace(/[；;、，,\s]/g,""),q.replace(/[；;、，,\s]/g,""));
      if(direct||wd<=Math.max(1,Math.floor(q.length/4))||md<=Math.max(1,Math.floor(q.length/4))){
        if(!seen.has(w)){seen.add(w);hits.push({word:c.word,reason:c.meaningZh,source:"local-card"});}
      }
    }
    return hits.slice(0,5);
  }

  function navButton(route, icon, label){
    const active=state.route===route||(route==="library"&&state.route==="library-edit");
    return `<button class="nav-btn ${active?"active":""}" data-route="${route}">
      <span class="nav-icon">${icon}</span><span>${label}</span>
    </button>`;
  }

  function shell(content){
    return `<div class="shell">
      <aside class="sidebar">
        <div class="brand"><div class="logo lexi-brand-icon"><img class="lexi-brand-icon-image" src="./icon.png" alt="LexiFlow" draggable="false"></div><div><strong>LexiFlow</strong><span>词义 · 语境 · 主动回忆</span></div></div>
        <nav class="nav">
          ${navButton("home","⌂","今日学习")}
          ${navButton("add","＋","选词制卡")}
          ${navButton("review","↻","复习中心")}
          ${navButton("library","▤","单词库")}
          ${navButton("stats","▥","学习统计")}
          ${navButton("settings","⚙","设置")}
        </nav>
        <div class="sidebar-foot"><strong>本地学习空间</strong><p>学习进度保存在当前设备，词典与 AI 服务按需连接。</p></div>
      </aside>
      <main class="main"><div class="content">${renderNotice()}${content}</div></main>
      ${state.toast?`<div class="toast">${escapeHtml(state.toast)}</div>`:""}
      ${state.modal?renderModal():""}
    </div>`;
  }

  function header(eyebrow,title,subtitle,actions=""){
    return `<div class="page-head">
      <div>${eyebrow?`<div class="eyebrow">${eyebrow}</div>`:""}<h1>${title}</h1><p>${subtitle}</p></div>
      <div class="head-actions">${actions}</div>
    </div>`;
  }

  function getCard(id){ return state.data.cards.find(c=>c.id===id); }

  function currentDailyPlan(){
    const plan=state.data.dailyPlan;
    return plan?.frozen===true&&plan.date===todayKey()?plan:null;
  }

  function planCards(key){
    const plan=currentDailyPlan();
    if(!plan||!Array.isArray(plan[key]))return [];
    const byId=new Map(state.data.cards.map(card=>[card.id,card]));
    return plan[key].map(id=>byId.get(id)).filter(Boolean);
  }

  function todayActivities(){
    const key=todayKey();
    return state.data.activities.filter(a=>todayKey(new Date(a.at))===key);
  }

  function uniqueLearnedToday(){
    return new Set(todayActivities().filter(a=>["stage-complete","review"].includes(a.type)).map(a=>a.cardId)).size;
  }

  function stableCount(){
    return state.data.cards.filter(card=>card.memoryState==="stable").length;
  }

  function progressPercent(){
    const plan=currentDailyPlan();
    const goal=Number(plan?.selectGoal ?? state.data.settings.dailyGoal ?? 3);
    return Math.min(100,Math.round((uniqueLearnedToday()/Math.max(1,goal))*100));
  }

  function homePage(){
    const plan=currentDailyPlan();
    const review=Array.isArray(plan?.review)?plan.review.length:0;
    const learning=["memorize","visualize","apply","select"].reduce((sum,key)=>sum+(Array.isArray(plan?.[key])?plan[key].length:0),0);
    const cards=state.data.cards.length;
    const today=uniqueLearnedToday();
    const goal=Number(plan?.selectGoal ?? state.data.settings.dailyGoal ?? 3);
    const stable=stableCount();
    const inbox=Array.isArray(plan?.inbox)?plan.inbox.length:state.data.cards.filter(card=>card.inboxPending).length;
    const primary=review
      ? `<button class="btn primary" data-action="start-review">开始复习</button>`
      : learning
        ? `<button class="btn primary" data-action="continue-learning">继续学习</button>`
        : inbox&&Number(plan?.remainingSelectSlots||0)>0
          ? `<button class="btn primary" data-route="add">继续收集单词</button>`
          : cards===0
            ? `<button class="btn primary" data-route="add">添加第一个单词</button>`
            : `<button class="btn primary" disabled>今天的计划已完成</button>`;
    return shell(
      header("","今日学习","",`<button class="btn" data-route="add">＋ 添加单词</button>`)
      + `<div class="grid cols-4">
        <div class="card stat"><div class="stat-label">今日完成</div><div class="stat-value">${today}<span style="font-size:14px;color:var(--muted)"> / ${goal}</span></div><div class="stat-hint">今日推进记录</div></div>
        <div class="card stat"><div class="stat-label">待复习</div><div class="stat-value">${review}</div><div class="stat-hint">系统今天已安排</div></div>
        <div class="card stat"><div class="stat-label">学习中</div><div class="stat-value">${learning}</div><div class="stat-hint">今天可推进的学习任务</div></div>
        <div class="card stat"><div class="stat-label">长期稳定</div><div class="stat-value">${stable}</div><div class="stat-hint">已进入长期维护复习</div></div>
      </div>
      <div class="section card today-card">
        <div>
          <div class="eyebrow">今日进度</div>
          <h2>${cards===0?"从一个单词开始":review?"先完成今天的复习":learning?"继续今天的学习":"今天的计划已完成"}</h2>
          <p>${cards===0?"先收集一个真正想学会并会用的词。":review?`今天安排了 ${review} 个复习词，完成后再继续新学习。`:learning?`今天还有 ${learning} 个学习任务，按记忆 → 联想 → 应用 → 选词推进。`:"没有补昨天任务，也不会制造词汇债；明天会按当前状态重新生成计划。"}</p>
          <div style="margin-top:16px"><div class="progress-track"><div class="progress-bar" style="width:${progressPercent()}%"></div></div><div class="stat-hint" style="margin-top:7px">今日推进 ${today}/${goal}</div></div>
        </div>
        <div class="today-actions">${primary}<button class="btn" data-route="library">查看单词库</button></div>
      </div>
      <div class="section">
        <div class="section-title"><div><h2>最近单词</h2><p>最近添加或学习的内容。</p></div></div>
        ${cards?`<div class="grid cols-3">${state.data.cards.slice().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,6).map(cardMini).join("")}</div>`
        : `<div class="card empty"><div class="empty-icon">＋</div><strong>还没有单词</strong><span>去“选词制卡”添加你的第一个学习词。</span></div>`}
      </div>`
    );
  }

  function cardMini(c){
    const stageLabel = stageLabelOf(c);
    return `<div class="card pad">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
        <div><strong style="font-size:18px">${escapeHtml(c.word)}</strong><div class="phonetic">${escapeHtml(formatPhonetic(c.phonetic||""))}</div></div>
        <span class="pill ${c.stage==="review"?"green":"blue"}">${stageLabel}</span>
      </div>
      <p style="margin:13px 0 0;color:var(--muted);font-size:12px;line-height:1.6">${escapeHtml(c.meaningZh)}</p>
    </div>`;
  }

  function stageLabelOf(card){
    const core=window.LexiFlowLearningCore;
    const stage=typeof core?.canonicalStage==="function"?core.canonicalStage(card):String(card?.stage||"");
    if(card?.memoryState==="stable")return "长期稳定";
    return ({select:"待确认",memorize:"记忆中",visualize:"视觉联想",apply:"造句应用",review:"复习巩固"})[stage]||stage;
  }

  function addPage(){
    const dict=state.providerStatus?.dictionary;
    const badge=dict?.configured
      ? `<span class="pill green">● 词典已连接</span>`
      : state.providerStatus
        ? `<button class="btn small" data-route="settings">检查词典状态</button>`
        : `<span class="pill green">● 本地词典已就绪</span>`;
    const shouldShowResult=state.lookupStatus==="loading"||Boolean(state.lookup?.result);
    return shell(
      header("","选词制卡","",badge)
      + `<div class="card search-hero-card">
        <form id="lookup-form" class="search-command-bar">
          <div class="search-input-wrap"><span class="search-input-icon">⌕</span><input class="input" id="word-input" placeholder="输入英文或中文，例如 keyboard、键盘、wrok" value="${escapeHtml(state.lookup?.query||"")}" autocomplete="off" /></div>
          <button class="btn primary" type="submit" ${state.lookupStatus==="loading"?"disabled":""}>${state.lookupStatus==="loading"?"正在查询…":"查询"}</button>
          ${state.lookup?.query?`<button class="btn ghost" type="button" data-action="clear-lookup">清空</button>`:""}
        </form>
        <div class="search-helper"><span>支持中文</span><span>支持英文</span><span>支持拼写纠错</span><span>默认只生成一个核心学习词义</span></div>
      </div>
      ${shouldShowResult?`<div class="card pad word-result lookup-surface">${renderLookupResult()}</div>`:""}`
    );
  }

  function renderLookupResult(){
    if(state.lookupStatus==="loading"){
      return `<div class="lookup-loader">
        <div class="lookup-loader-orb"><span></span></div>
        <strong>正在整理学习卡</strong>
        <p>识别输入 · 匹配词义 · 准备例句与发音</p>
        <div class="lookup-loader-track"><i></i></div>
      </div>`;
    }
    if(state.lookup?.result?.suggestions?.length){
      return `<div class="search-suggestions-panel"><div class="empty-icon">⌕</div><strong>${escapeHtml(state.lookup.result.suggestionTitle||"你可能想找")}</strong><span>${escapeHtml(state.lookup.result.suggestionHint||"选择一个候选词继续。")}</span><div class="search-candidate-list">${state.lookup.result.suggestions.map(item=>{const word=typeof item==="string"?item:item.word;const reason=typeof item==="string"?"":item.reason;return `<button class="search-candidate" data-suggestion="${escapeHtml(word)}"><b>${escapeHtml(word)}</b>${reason?`<small>${escapeHtml(reason)}</small>`:""}</button>`}).join("")}</div></div>`;
    }
    if(!state.lookup?.result) return "";

    const r=state.lookup.result;
    const senses=Array.isArray(r.senses)?r.senses:[];
    const primarySense=senses.find(s=>s.id===state.selectedSenseId)||senses[0]||null;
    const targetExampleMismatch=Boolean(primarySense?.exampleEn && !learningExampleUsesTarget(primarySense.exampleEn,r.word));
    const resolvedNote = r.sourceQuery && (r.autoResolved || r.autoCorrectedFrom || r.normalizedQuery)
      ? `<div class="auto-resolved-note"><span>已自动识别</span><strong>${escapeHtml(r.sourceQuery)} → ${escapeHtml(r.word)}</strong>${r.normalizedQuery && r.normalizedQuery!==r.sourceQuery?`<small>识别为“${escapeHtml(r.normalizedQuery)}”</small>`:""}</div>`
      : "";
    const alternativeWords=Array.isArray(r.alternatives)?r.alternatives.filter(item=>item?.word&&String(item.word).toLowerCase()!==String(r.word).toLowerCase()):[];
    const alternativePanel=(r.sourceQuery&&/[\u3400-\u9fff]/.test(r.sourceQuery)&&(alternativeWords.length||r.autoResolved))?`
      <div class="lookup-recovery-row">
        <button class="text-action" data-action="toggle-lookup-alternatives">${state.lookupAlternativesOpen?"收起其它结果":"不是这个词？换个结果"}</button>
        <button class="text-action" data-action="refresh-lookup">重新识别</button>
      </div>
      ${state.lookupAlternativesOpen&&alternativeWords.length?`<div class="lookup-alternatives">${alternativeWords.map(item=>`<button class="lookup-alternative" data-search-alternative="${escapeHtml(item.word)}"><strong>${escapeHtml(item.word)}</strong><span>${escapeHtml(item.meaningZh||r.normalizedQuery||r.sourceQuery)}</span></button>`).join("")}</div>`:""}`:"";

    const primaryView=primarySense?`
      <div class="primary-sense-card">
        <div class="primary-sense-meta"><span class="pill blue">${escapeHtml(primarySense.pos||"word")}</span><span>核心学习词义</span></div>
        <div class="primary-meaning">${escapeHtml(primarySense.meaningZh||"请手动编辑")}</div>
        <div class="example-pair">
          <div class="example-label">例句</div>
          ${primarySense.exampleEn?sentenceExample(primarySense.exampleEn,"example-en"):`<div class="example-en">暂无例句，请手动编辑</div>`}
          <div class="example-zh">${escapeHtml(primarySense.exampleZh||"暂无翻译，请手动编辑")}</div>
        </div>
      </div>`:"";

    const expandedView=r.mode==="expanded"?`
      <div class="expanded-senses-head"><strong>其它常用词义</strong><span>一个中文学习词义对应一张卡片</span></div>
      <div class="sense-list">${senses.map(s=>`<div class="sense ${s.id===state.selectedSenseId?"selected":""}" data-sense-id="${s.id}" role="button" tabindex="0">
        <div class="sense-head"><span class="pill blue">${escapeHtml(s.pos)}</span>${s.id===state.selectedSenseId?`<span class="sense-selected-mark">✓</span>`:""}</div>
        <div class="sense-meaning">${escapeHtml(s.meaningZh||"请手动编辑")}</div>
        ${s.exampleEn?sentenceExample(s.exampleEn,"sense-example"):`<div class="sense-example">暂无例句</div>`}
        <div class="sense-example-zh">${escapeHtml(s.exampleZh||"")}</div>
      </div>`).join("")}</div>`:"";

    return `${resolvedNote}${alternativePanel}
      <div class="word-top learning-card-wordtop">
        <div><div class="word-line"><h2>${escapeHtml(r.word)}</h2><button class="speaker" data-action="speak" data-word="${escapeHtml(r.word)}" data-audio="${escapeHtml(r.audioUrl||"")}" data-audios="${escapeHtml(JSON.stringify(r.audioUrls||[]))}" title="播放美式发音">🔊</button></div><div class="phonetic">${escapeHtml(formatPhonetic(r.phonetic||""))}</div></div>
        <div class="result-meta">${r.cacheHit?`<span class="pill green">⚡ 快速结果</span>`:""}</div>
      </div>
      ${primarySense&&!String(primarySense.meaningZh||"").trim()?`<div class="feedback warn"><h4>中文释义暂缺</h4><ul><li>当前词条没有可用中文释义，可以重新查询或手动补充。</li></ul></div>`:""}
      ${r.translationNeedsReview?`<div class="feedback warn"><h4>建议检查中文释义</h4><ul><li>当前释义置信度较低，保存前建议快速确认或手动编辑。</li></ul></div>`:""}
      ${targetExampleMismatch?`<div class="feedback warn lookup-consistency-warning"><h4>结果需要重新确认</h4><ul><li>例句没有使用当前目标词“${escapeHtml(r.word)}”，为避免把不一致内容保存进单词库，当前不能保存。</li></ul></div>`:""}
      ${r.mode==="expanded"?expandedView:primaryView}
      ${state.addDraft?renderSenseEditor(state.addDraft):""}
      <div class="action-row learning-card-actions">
        <div class="left-actions">
          ${r.hasMore && r.mode!=="expanded"?`<button class="btn" data-action="load-more-senses" ${state.loadingMoreSenses?"disabled":""}>${state.loadingMoreSenses?"加载中…":"查看其它常用词义"}</button>`:""}
          <button class="btn ghost" data-action="edit-sense">手动编辑</button>
          <button class="btn ghost" data-action="lookup-again">重新查询</button>
        </div>
        <button class="btn primary save-learning-card" data-action="save-card" ${targetExampleMismatch?"disabled":""}>保存并开始学习</button>
      </div>`;
  }

  function renderSenseEditor(s){
    return `<div class="editor"><h3 class="editor-title">手动编辑当前义项</h3><div class="editor-grid">
      <div class="field"><label>词性</label><input class="input" id="edit-pos" value="${escapeHtml(s.pos)}" /></div>
      <div class="field"><label>中文释义</label><input class="input" id="edit-meaning" value="${escapeHtml(s.meaningZh)}" /></div>
      <div class="field"><label>英文例句</label><textarea class="textarea" id="edit-en">${escapeHtml(s.exampleEn)}</textarea></div>
      <div class="field"><label>中文例句</label><textarea class="textarea" id="edit-zh">${escapeHtml(s.exampleZh)}</textarea></div>
      <div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn" data-action="cancel-edit">取消</button><button class="btn primary" data-action="apply-edit">保存修改</button></div>
    </div></div>`;
  }

  async function playNaturalTts(text){
    const value=String(text||"").trim();
    if(!value)return false;
    const player=window.LexiFlowNaturalTts?.play;
    if(typeof player!=="function")return false;
    try{return Boolean(await player(value));}catch{return false;}
  }

  async function speak(word,audioUrl="",audioUrls=[]){
    const segments=Array.isArray(audioUrls)?audioUrls.filter(Boolean):[];
    if(audioUrl) segments.unshift(audioUrl);
    if(segments.length){
      try{
        for(const src of Array.from(new Set(segments))){
          await new Promise((resolve,reject)=>{
            const audio=new Audio(src);audio.onended=resolve;audio.onerror=reject;audio.play().catch(reject);
          });
        }
        return;
      }catch{}
    }
    if(await playNaturalTts(word))return;
    toast("当前没有可用的自然发音，请稍后重试");
  }

  async function speakSentence(sentence){
    const text=String(sentence||"").trim();
    if(!text)return;
    if(await playNaturalTts(text))return;
    toast("当前没有可用的自然例句发音，请稍后重试");
  }

  window.LexiFlowPronunciationV3=Object.freeze({
    playWord(word,{audioUrl="",audioUrls=[]}={}){return speak(word,audioUrl,audioUrls);},
    playSentence(sentence){return speakSentence(sentence);}
  });

  function highlightKeyword(text,keyword){
    const source=String(text||"");
    const key=String(keyword||"").trim();
    if(!key)return escapeHtml(source);
    const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const re=new RegExp(`\\b(${escaped})\\b`,"ig");
    let cursor=0;
    let out="";
    let match;
    while((match=re.exec(source))){
      out+=escapeHtml(source.slice(cursor,match.index));
      out+=`<mark class="keyword-mark">${escapeHtml(match[0])}</mark>`;
      cursor=match.index+match[0].length;
      if(re.lastIndex===match.index)re.lastIndex++;
    }
    out+=escapeHtml(source.slice(cursor));
    return out;
  }

  function sentenceExample(text,className="example-en",keyword=""){
    const value=String(text||"").trim();
    if(!value)return "";
    const body=keyword?highlightKeyword(value,keyword):escapeHtml(value);
    return `<div class="sentence-audio-line ${className}">
      <span class="sentence-audio-text">${body}</span>
      <button class="sentence-speaker" data-action="speak-sentence" data-sentence="${escapeHtml(value)}" title="播放例句" aria-label="播放例句">🔊</button>
    </div>`;
  }

  function containsChinese(text){
    return /[\u3400-\u9fff]/.test(String(text||""));
  }


  function escapeRegExp(value){
    return String(value||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  }

  function targetWordForms(word){
    const w=String(word||"").trim().toLowerCase();
    if(!w)return [];
    const forms=new Set([w]);
    if(w.endsWith("y")&&w.length>2){forms.add(w.slice(0,-1)+"ies");forms.add(w.slice(0,-1)+"ied");}
    if(w.endsWith("e")){forms.add(w+"s");forms.add(w+"d");forms.add(w.slice(0,-1)+"ing");}
    else{forms.add(w+"s");forms.add(w+"es");forms.add(w+"ed");forms.add(w+"ing");}
    const irregular={
      keep:["kept"],run:["ran","running"],write:["wrote","written","writing"],go:["went","gone"],
      have:["has","had"],do:["does","did","done"],make:["made"],take:["took","taken"],
      see:["saw","seen"],come:["came"],get:["got","gotten"],give:["gave","given"],
      eat:["ate","eaten"],buy:["bought"],bring:["brought"],think:["thought"],say:["said"]
    };
    (irregular[w]||[]).forEach(x=>forms.add(x));
    return Array.from(forms);
  }

  function textContainsKeyword(text,keyword){
    const key=String(keyword||"").trim();
    if(!key)return false;
    return new RegExp(`\\b${escapeRegExp(key)}\\b`,"i").test(String(text||""));
  }

  function sentenceUsesTargetWord(text,word){
    return targetWordForms(word).some(form=>textContainsKeyword(text,form));
  }

  function learningExampleUsesTarget(text,word){
    const example=String(text||"").trim().toLowerCase().replace(/\s+/g," ");
    const target=String(word||"").trim().toLowerCase().replace(/\s+/g," ");
    if(!example||!target)return false;
    if(target.includes(" "))return example.includes(target);
    return sentenceUsesTargetWord(example,target);
  }

  function startStudy(cardId){
    const explicitId=String(cardId||"").trim();
    const card=explicitId?getCard(explicitId):null;
    if(!card){toast("当前没有可打开的学习任务");state.route="home";render();return false;}
    const canonical=window.LexiFlowLearningCore?.canonicalStage?.(card)||String(card.stage||"");
    if(card.inboxPending||canonical==="review"||card.memoryState==="stable"){
      toast("这张卡片当前不能进入首次学习");
      state.route="home";
      render();
      return false;
    }
    state.study={cardId:card.id};
    state.route="study";
    render();
    void ensureCardPronunciation(card);
    return true;
  }

  // Narrow rendering bridge for Study Session V3. The renderer may display one
  // explicit card, but it does not choose Today membership, ordering or timing.
  window.LexiFlowStudyRenderer=Object.freeze({
    openCard(cardId){return startStudy(String(cardId||""));},
    currentCardId(){return state.route==="study"?String(state.study?.cardId||""):"";},
    hasCard(cardId){return Boolean(getCard(String(cardId||"")));}
  });


  function openAddFromToday(){
    const core=window.LexiFlowLearningCore;
    const plan=state.data.dailyPlan;
    if(Number(plan?.remainingSelectSlots||0)<=0){toast("今天的新词已经选满");return false;}
    state.addToTodayIntent=todayKey();
    state.route="add";
    state.study=null;
    render();
    return true;
  }

  window.LexiFlowAddFlowV3=Object.freeze({
    openForToday:openAddFromToday,
    isAddingForToday(){return state.route==="add"&&state.addToTodayIntent===todayKey();}
  });

  function studyPage(){
    const s=state.study, card=s&&getCard(s.cardId);
    if(card && !card.phonetic && !state.pronunciationHydration[card.id]){setTimeout(()=>void ensureCardPronunciation(card),0);}
    if(!card) return shell(header("","学习会话","当前没有学习任务。")+`<div class="card empty"><div class="empty-icon">✓</div><strong>暂无学习任务</strong></div>`);
    return shell(
      header(
        "",
        "学习会话",
        `正在学习：${escapeHtml(card.word)} · ${escapeHtml(formatPhonetic(card.phonetic))}`,
        `<button class="btn" data-route="home">退出会话</button>`
      )
      + `<div class="study-progress-wrap">${renderStageRail(card)}</div><div class="study-shell study-shell-single"><div class="study-depth-shell"><span class="study-stack-layer study-stack-layer-far" aria-hidden="true"></span><span class="study-stack-layer study-stack-layer-near" aria-hidden="true"></span><div class="card study-card study-card-focus">${renderStage(card)}</div></div></div>`
    );
  }

  function formatPhonetic(value){
    const raw=String(value||"").trim();
    if(!raw)return "暂无音标";
    if(
      (raw.startsWith("/")&&raw.endsWith("/")) ||
      (raw.startsWith("[")&&raw.endsWith("]"))
    ) return raw;
    return `/${raw}/`;
  }

  function wordIdentity(card,{size="large",showPos=true,center=false}={}){
    return `<div class="target-word-identity ${center?"center":""} ${size}">
      <div class="target-word-mainline">
        <strong class="target-word-text">${escapeHtml(card.word)}</strong>
        <button
          class="speaker target-word-speaker"
          data-action="speak"
          data-word="${escapeHtml(card.word)}"
          data-audio="${escapeHtml(card.audioUrl||"")}"
          data-audios="${escapeHtml(JSON.stringify(card.audioUrls||[]))}"
          title="播放美式发音"
          aria-label="播放 ${escapeHtml(card.word)} 的美式发音"
        >🔊</button>
      </div>
      <div class="target-word-meta">
        <span class="target-phonetic">${escapeHtml(formatPhonetic(card.phonetic))}</span>
        ${showPos?`<span class="target-pos">${escapeHtml(card.pos||"")}</span>`:""}
      </div>
    </div>`;
  }

  function renderStageRail(card){
    return `<div class="study-stepper" data-study-stepper-v3-host="${escapeHtml(card.id)}"></div>`;
  }

  function renderStage(card){
    return `<div data-study-stage-host-v3="${escapeHtml(card.id)}"></div>`;
  }

  function reviewPage(){
    const plan=currentDailyPlan();
    const due=planCards("review");
    const stableTotal=stableCount();
    const recent=Math.max(0,Number(plan?.reviewCriticalCount||0));
    const longTerm=Math.max(0,Number(plan?.reviewStableScheduledCount||0));
    return shell(
      header("","复习中心","系统会自动安排今天真正需要巩固的词。",due.length?`<button class="btn primary" data-action="start-review">开始复习 (${due.length})</button>`:"")
      + `<div class="grid cols-3">
        <div class="card stat"><div class="stat-label">今日复习</div><div class="stat-value">${due.length}</div><div class="stat-hint">${recent} 个近期巩固 · ${longTerm} 个长期巩固</div></div>
        <div class="card stat"><div class="stat-label">累计主动回忆</div><div class="stat-value">${state.data.activities.filter(a=>a.type==="review").length}</div><div class="stat-hint">所有已完成的复习记录</div></div>
        <div class="card stat"><div class="stat-label">已掌握</div><div class="stat-value">${stableTotal}</div><div class="stat-hint">进入长期巩固的词</div></div>
      </div>
      <div class="section card pad">${due.length?`<div class="table-wrap"><table class="table"><thead><tr><th>单词</th><th>中文释义</th><th>已复习</th><th>安排日期</th></tr></thead><tbody>${due.map(c=>`<tr><td><strong>${escapeHtml(c.word)}</strong><div class="phonetic">${escapeHtml(formatPhonetic(c.phonetic))}</div></td><td>${escapeHtml(c.meaningZh)}</td><td>${c.reviewCount||0} 次</td><td>${c.nextReviewAt?new Date(c.nextReviewAt).toLocaleDateString():"—"}</td></tr>`).join("")}</tbody></table></div>`
      :`<div class="empty"><div class="empty-icon">✓</div><strong>今天没有需要复习的内容</strong><span>需要巩固时会自动出现在这里，你不需要手动管理复习日期。</span></div>`}</div>`
    );
  }
  function libraryPage(){
    const q=state.librarySearch.trim().toLowerCase();
    const list=state.data.cards.filter(c=>!q||c.word.toLowerCase().includes(q)||c.meaningZh.includes(q));
    return shell(
      header("","单词库","点击任意单词卡可以查看并修改内容。",`<button class="btn primary" data-route="add">＋ 添加单词</button>`)
      + `<div class="search-row"><input class="input" id="library-search" placeholder="搜索单词或中文释义" value="${escapeHtml(state.librarySearch)}" /><span class="pill">${list.length} 张卡片</span></div>
      <div class="table-wrap"><table class="table library-table"><thead><tr><th>联想图</th><th>单词</th><th>词性</th><th>中文释义</th><th>阶段</th><th>下次复习</th><th></th></tr></thead>
      <tbody>${list.length?list.map(c=>`<tr class="library-row" data-library-card="${c.id}" tabindex="0" aria-label="编辑 ${escapeHtml(c.word)}">
        <td><div class="library-thumb">${(c.imageData||c.imageUrl)?`<img src="${c.imageData||c.imageUrl}" alt="${escapeHtml(c.word)} 联想图" loading="lazy" />`:`<span>—</span>`}</div></td>
        <td><strong>${escapeHtml(c.word)}</strong><div class="phonetic">${escapeHtml(formatPhonetic(c.phonetic||""))}</div></td>
        <td><span class="pill blue">${escapeHtml(c.pos)}</span></td>
        <td>${escapeHtml(c.meaningZh)}</td>
        <td>${stageLabelOf(c)}</td>
        <td>${c.nextReviewAt?new Date(c.nextReviewAt).toLocaleDateString():"—"}</td>
        <td><div class="library-actions"><button class="btn small" data-action="open-library-editor" data-card-id="${c.id}">编辑</button><button class="btn small danger" data-delete-card="${c.id}">删除</button></div></td>
      </tr>`).join(""):`<tr><td colspan="7"><div class="empty"><strong>没有匹配的单词</strong></div></td></tr>`}</tbody></table></div>`
    );
  }

  function libraryEditorBaseDraft(card){
    return {
      word:card.word||"",
      phonetic:card.phonetic||"",
      pos:card.pos||"",
      meaningZh:card.meaningZh||"",
      exampleEn:card.exampleEn||"",
      exampleZh:card.exampleZh||"",
      visualNote:card.visualNote||card.visualSceneSuggestion?.scene||"",
      imageData:card.imageData||"",
      imageUrl:card.imageUrl||"",
      generatedVisualScene:card.generatedVisualScene||"",
      imageGeneration:card.imageGeneration?{...card.imageGeneration}:null,
      userSentence:card.userSentence||""
    };
  }

  function openLibraryEditor(cardId){
    const card=getCard(cardId);
    if(!card)return;
    state.libraryEditor={
      cardId:card.id,
      originalWord:card.word||"",
      originalPhonetic:card.phonetic||"",
      originalMeaningZh:card.meaningZh||"",
      imageGenerating:false,
      draft:libraryEditorBaseDraft(card)
    };
    state.route="library-edit";
    render();
  }

  function captureLibraryEditorDraft(){
    const editor=state.libraryEditor;
    const card=editor&&getCard(editor.cardId);
    if(!editor||!card)return null;
    const current=editor.draft||libraryEditorBaseDraft(card);
    const read=(id,fallback)=>document.getElementById(id)?.value??fallback;
    editor.draft={
      ...current,
      // Lexical identity is intentionally read-only in the library editor.
      word:card.word||"",
      phonetic:card.phonetic||"",
      pos:card.pos||"",
      meaningZh:card.meaningZh||"",
      exampleEn:card.exampleEn||"",
      exampleZh:card.exampleZh||"",
      userSentence:String(read("library-edit-user-sentence",current.userSentence)||"").trim(),
      visualNote:String(read("library-edit-visual-note",current.visualNote)||"").trim()
    };
    return editor.draft;
  }

  function libraryEditPage(){
    const editor=state.libraryEditor;
    const card=editor&&getCard(editor.cardId);
    if(!editor||!card)return libraryPage();
    const d=editor.draft||libraryEditorBaseDraft(card);
    const image=d.imageData||d.imageUrl||"";
    const activeGeneration=d.imageGeneration||card.imageGeneration||null;
    const generating=Boolean(editor.imageGenerating||activeGeneration?.status==="generating");
    const phonetic=formatPhonetic(d.phonetic||"")||"暂无音标";
    return shell(
      header("","编辑单词卡","只调整你的造句和视觉联想；词条、释义与参考例句保持原样，复习进度不会改变。",`<button class="btn" data-action="library-edit-back">← 返回单词库</button>`)
      + `<div class="library-editor-grid library-editor-grid-refined">
        <section class="card library-editor-identity" aria-label="固定词条信息">
          <div class="library-editor-word-block">
            <div class="library-editor-word-line">
              <strong class="library-editor-word">${escapeHtml(d.word)}</strong>
              <button class="speaker library-editor-speaker" data-action="speak" data-word="${escapeHtml(d.word)}" data-audio="${escapeHtml(card.audioUrl||"")}" aria-label="播放 ${escapeHtml(d.word)} 的发音">🔊</button>
              <span class="pill blue library-editor-pos">${escapeHtml(d.pos||"word")}</span>
            </div>
            <div class="library-editor-phonetic">${escapeHtml(phonetic)}</div>
          </div>
          <div class="library-editor-meaning-block">
            <span>中文释义</span>
            <strong>${escapeHtml(d.meaningZh)}</strong>
          </div>
        </section>

        <section class="card pad library-editor-copy-card">
          <div class="library-editor-section-head">
            <div><span class="library-editor-section-kicker">学习内容</span><h2>参考例句</h2><p>参考例句来自制卡流程，在单词库中保持只读。</p></div>
          </div>
          <div class="answer-box library-editor-reference-example">
            ${sentenceExample(d.exampleEn,"example-en")}
            <p>${escapeHtml(d.exampleZh)}</p>
          </div>
          <div class="field library-editor-editable-field">
            <label>我的造句 <span>可编辑</span></label>
            <textarea class="textarea library-editor-textarea" id="library-edit-user-sentence" placeholder="这里会保存你在“造句应用”中写下的句子">${escapeHtml(d.userSentence||"")}</textarea>
            <small>修改的是你的造句，不会改动词典参考例句。</small>
          </div>
        </section>

        <aside class="card pad library-editor-image-panel">
          <div class="library-editor-section-head">
            <div><span class="library-editor-section-kicker">视觉记忆</span><h2>联想图</h2><p>可以重新生成，也可以换成你自己的图片。</p></div>
          </div>
          <div class="library-editor-image-frame ${image?"has-image":""}">
            ${image?`<img class="library-editor-image" src="${image}" alt="${escapeHtml(d.word)} 联想图" />`:`<div class="library-editor-image-empty"><span>✦</span><strong>暂无联想图</strong><small>AI 可根据词义和例句自动设计</small></div>`}
            ${generating?`<div class="library-editor-image-loading"><span class="mini-spinner"></span><strong>正在生成新图片</strong><small>生成期间场景已锁定，完成后可继续修改。</small></div>`:""}
          </div>
          <div class="library-editor-image-actions">
            <button class="btn primary" data-action="regenerate-library-image" ${generating?"disabled":""}>${generating?"生成中…":image?"✦ 重新生成":"✦ AI 生成图片"}</button>
            <label class="btn" for="library-image-file" ${generating?"aria-disabled=\"true\" style=\"pointer-events:none;opacity:.55\"":""}>上传图片</label>
            ${image?`<button class="btn ghost" data-action="clear-library-image" ${generating?"disabled":""}>移除</button>`:""}
          </div>
          <input id="library-image-file" type="file" accept="image/png,image/jpeg,image/webp" style="display:none" />

          <div class="field library-editor-scene-field">
            <label>联想场景 <span>可选</span></label>
            <textarea class="textarea library-editor-scene" id="library-edit-visual-note" ${generating?"readonly aria-readonly=\"true\"":""} placeholder="例如：傍晚的书房里，台灯照亮摊开的英语课本。留空也可以直接生成。">${escapeHtml(d.visualNote)}</textarea>
            <small>${generating?"图片生成中，当前场景暂时锁定。":"填写后优先按你的描述生成；留空时 AI 会自动设计画面。"}</small>
          </div>
          <div class="library-editor-tip">图片和场景只用于记忆辅助，不会改变学习阶段或复习时间。</div>
        </aside>

        <div class="library-editor-footer">
          <span>保存后只更新我的造句、联想场景和图片。</span>
          <div class="library-editor-footer-actions">
            <button class="btn" data-action="library-edit-back">取消</button>
            <button class="btn primary" data-action="save-library-card">保存修改</button>
          </div>
        </div>
      </div>`
    );
  }

  function statsPage(){
    const cards=Array.isArray(state.data.cards)?state.data.cards:[];
    const activities=Array.isArray(state.data.activities)?state.data.activities:[];
    const now=new Date();
    const cutoff30=new Date(now);cutoff30.setHours(0,0,0,0);cutoff30.setDate(cutoff30.getDate()-29);
    const recentReviews=activities
      .filter(item=>item?.type==="review"&&new Date(item.at)>=cutoff30)
      .sort((a,b)=>new Date(a.at)-new Date(b.at));
    const firstReviewByDay=new Map();
    for(const item of recentReviews){
      const key=`${String(item.cardId||"")}:${todayKey(new Date(item.at))}`;
      if(!firstReviewByDay.has(key))firstReviewByDay.set(key,item);
    }
    const firstReviews=[...firstReviewByDay.values()];
    const remembered=firstReviews.filter(item=>item.quality==="good").length;
    const recallRate=firstReviews.length?Math.round(remembered/firstReviews.length*100):null;
    const stableTotal=cards.filter(card=>card.memoryState==="stable").length;
    const applied=cards.filter(card=>card.memoryState==="stable"||card.stage==="review"||String(card.userSentence||"").trim()).length;

    const stageRows=[
      {key:"inbox",label:"待选入学习",count:cards.filter(card=>card.inboxPending).length},
      {key:"select",label:"确认词义",count:cards.filter(card=>!card.inboxPending&&card.stage==="select").length},
      {key:"memorize",label:"主动记忆",count:cards.filter(card=>card.stage==="memorize").length},
      {key:"visualize",label:"建立联想",count:cards.filter(card=>card.stage==="visualize").length},
      {key:"apply",label:"表达练习",count:cards.filter(card=>card.stage==="apply").length},
      {key:"review",label:"复习巩固",count:cards.filter(card=>card.stage==="review"&&card.memoryState!=="stable").length},
      {key:"stable",label:"已掌握",count:stableTotal},
    ].filter(item=>item.count>0||["select","memorize","visualize","apply","review","stable"].includes(item.key));
    const total=Math.max(1,cards.length);

    const days30=[];
    for(let i=29;i>=0;i--){
      const date=addDays(now,-i),key=todayKey(date);
      const events=activities.filter(item=>item?.at&&todayKey(new Date(item.at))===key);
      const count=new Set(events.map(item=>String(item.cardId||item.id||"")).filter(Boolean)).size;
      days30.push({key,label:`${date.getMonth()+1}/${date.getDate()}`,count});
    }
    const maxDay=Math.max(1,...days30.map(item=>item.count));
    const heatLevel=count=>count<=0?0:Math.max(1,Math.min(4,Math.ceil(count/maxDay*4)));
    const activeDays=days30.filter(day=>day.count>0).length;
    const newLast7=cards.filter(card=>card.createdAt&&new Date(card.createdAt)>=addDays(now,-6)).length;

    const forgottenByCard=new Map();
    for(const item of firstReviews.filter(event=>event.quality==="again")){
      const id=String(item.cardId||"");if(!id)continue;
      const current=forgottenByCard.get(id)||{count:0,lastAt:""};
      current.count+=1;current.lastAt=String(item.at||current.lastAt);forgottenByCard.set(id,current);
    }
    const struggles=[...forgottenByCard.entries()]
      .map(([id,meta])=>({card:cards.find(card=>String(card.id)===id),...meta}))
      .filter(item=>item.card)
      .sort((a,b)=>b.count-a.count||new Date(b.lastAt)-new Date(a.lastAt))
      .slice(0,5);

    return shell(
      header("","学习统计","看长期趋势，不被某一天的状态影响。")
      + `<div class="grid cols-4 stats-kpis">
        <div class="card stat"><div class="stat-label">词库</div><div class="stat-value">${cards.length}</div><div class="stat-hint">已保存的单词与短语</div></div>
        <div class="card stat"><div class="stat-label">完成应用</div><div class="stat-value">${applied}</div><div class="stat-hint">至少完成过一次表达练习</div></div>
        <div class="card stat"><div class="stat-label">已掌握</div><div class="stat-value">${stableTotal}</div><div class="stat-hint">进入长期巩固</div></div>
        <div class="card stat"><div class="stat-label">30 天回忆成功率</div><div class="stat-value">${recallRate===null?"—":`${recallRate}<span class="stats-unit">%</span>`}</div><div class="stat-hint">每天每词只计第一次回忆</div></div>
      </div>
      <div class="stats-layout section">
        <section class="card pad stats-progress-card">
          <div class="section-title"><div><h2>词汇进度</h2><p>看词汇从确认词义走到真正掌握，而不是只看“背了多少”。</p></div></div>
          <div class="stats-stage-list">${stageRows.map(item=>`<div class="stats-stage-row"><div class="stats-stage-meta"><span>${escapeHtml(item.label)}</span><strong>${item.count}</strong></div><div class="stats-stage-track"><span style="width:${Math.max(item.count?4:0,Math.round(item.count/total*100))}%"></span></div></div>`).join("")}</div>
        </section>
        <section class="card pad stats-recall-card">
          <div class="section-title"><div><h2>回忆质量</h2><p>只看每天第一次主动回忆，避免当天重复练习把结果“刷高”。</p></div></div>
          <div class="stats-recall-number">${recallRate===null?"暂无数据":`${recallRate}%`}</div>
          <div class="stats-recall-copy">${firstReviews.length?`近 30 天共记录 ${firstReviews.length} 次首次回忆，其中 ${remembered} 次成功。`:"完成几次复习后，这里会显示更有意义的长期趋势。"}</div>
        </section>
      </div>
      <section class="section card pad">
        <div class="section-title"><div><h2>最近 30 天学习节奏</h2><p>${activeDays} 个有学习记录的日子 · 最近 7 天新增 ${newLast7} 个学习对象</p></div></div>
        <div class="stats-heatmap">${days30.map(day=>`<div class="stats-heat-day level-${heatLevel(day.count)}" title="${escapeHtml(day.label)} · ${day.count} 个学习/复习记录"><span>${day.label}</span></div>`).join("")}</div>
        <div class="stats-heat-legend"><span>少</span><i class="level-1"></i><i class="level-2"></i><i class="level-3"></i><i class="level-4"></i><span>多</span></div>
      </section>
      <section class="section card pad">
        <div class="section-title"><div><h2>需要加强</h2><p>根据最近 30 天第一次回忆失败次数排序，优先看看真正反复忘记的词。</p></div></div>
        ${struggles.length?`<div class="stats-struggle-list">${struggles.map(item=>`<button class="stats-struggle-row" type="button" data-route="library"><span><strong>${escapeHtml(item.card.word)}</strong><small>${escapeHtml(item.card.meaningZh||"")}</small></span><em>${item.count} 次没想起来</em></button>`).join("")}</div>`:`<div class="stats-empty-note">最近没有反复忘记的词。继续按计划学习即可。</div>`}
      </section>`
    );
  }
  function settingsPage(){
    const status=state.providerStatus;
    const dict=status?.dictionary||{};
    const codex=status?.codex||{};
    const tts=status?.tts||{};
    const selectedModel=codex.selectedModel||"";
    const selectedEffort=codex.selectedReasoningEffort||"";
    const dictionaryCheck=state.providerChecks?.dictionary||null;
    const aiCheck=state.providerChecks?.ai||null;
    const dictLocalReady=Boolean(dict.localAvailable);
    const dictKeySaved=Boolean(dict.fallbackConfigured);
    const dictMaskedKey=String(dict.maskedKey||"");
    const runtimeState=codex.runtimeTest||{};
    const dictionaryChecking=dictionaryCheck?.status==="checking";
    const dictionaryPassed=dictionaryCheck?.status==="passed";
    const dictionaryFailed=dictionaryCheck?.status==="failed";
    const aiChecking=aiCheck?.status==="checking";
    const aiPassed=!aiChecking&&(aiCheck?.status==="passed"||runtimeState.status==="passed");
    const aiFailed=!aiChecking&&(aiCheck?.status==="failed"||runtimeState.status==="failed");
    const aiCanConnect=Boolean(codex.cliAvailable&&codex.authFound);
    const lastAiAt=aiCheck?.at||runtimeState.at||"";
    const formatTime=value=>{if(!value)return"";try{return new Date(value).toLocaleString();}catch{return"";}};
    const ttsReady=tts.status==="ready";
    const ttsBusy=tts.status==="downloading"||tts.status==="loading";

    return shell(
      header("","设置","")
      + `<div class="settings-security-banner"><span class="settings-security-icon">⌁</span><div><strong>连接信息只保存在当前设备</strong><span>LexiFlow 启动后会自动确认词典和 AI 的连接状态。</span></div></div>
      <div class="settings-list">
        <div class="setting-row settings-provider-row">
          <div class="settings-provider-copy">
            <h3>词典</h3>
            <p>本地词典负责快速查词；配置在线词典后，会自动补充真人发音和例句。</p>
            <div class="settings-status-line">
              <span class="pill ${dictLocalReady?"green":"red"}">${dictLocalReady?"本地词典可用":"本地词典未就绪"}</span>
              <span class="pill ${dictKeySaved?"green":"amber"}">${dictKeySaved?`密钥已保存${dictMaskedKey?` · ${escapeHtml(dictMaskedKey)}`:""}`:"未启用在线增强"}</span>
              ${dictKeySaved?`<span class="pill ${dictionaryChecking?"amber":dictionaryPassed?"green":dictionaryFailed?"red":"amber"}">${dictionaryChecking?"正在连接在线词典…":dictionaryPassed?"在线词典已连接":dictionaryFailed?"在线词典连接失败":"等待自动连接"}</span>`:""}
            </div>
          </div>
          <div class="settings-provider-actions">
            <input class="input" id="mw-api-key" type="password" placeholder="${dictKeySaved?"输入新密钥可替换已保存密钥":"输入在线词典密钥"}" />
            <button class="btn primary" data-action="save-dictionary-key">${dictKeySaved?"更新密钥":"保存密钥"}</button>
            ${dictionaryFailed?`<button class="btn" data-action="test-dictionary">重新连接</button>`:""}
          </div>
        </div>

        <div class="setting-row settings-provider-row">
          <div class="settings-provider-copy">
            <h3>AI 辅助</h3>
            <p>用于短语理解、例句翻译、造句反馈、联想场景和图片生成；启动后自动连接。</p>
            <div class="settings-status-line">
              <span class="pill ${aiChecking?"amber":aiPassed?"green":aiFailed?"red":aiCanConnect?"amber":"red"}">${aiChecking?"正在连接 AI…":aiPassed?"AI 已连接":aiFailed?"AI 连接失败":aiCanConnect?"等待自动连接":"需要登录 AI"}</span>
              ${aiPassed&&lastAiAt?`<span class="settings-last-connected">最近连接 ${escapeHtml(formatTime(lastAiAt))}</span>`:""}
            </div>
          </div>
          <div class="settings-provider-actions compact-actions">
            ${aiFailed&&aiCanConnect?`<button class="btn" data-action="test-codex-text">重新连接</button>`:""}
          </div>
        </div>

        <div class="setting-row">
          <div><h3>每日学习目标</h3><p>这是每天最多新加入学习流程的数量；复习较多时系统会自动减少新词。</p></div>
          <div class="daily-goal-editor" data-daily-goal-editor>
            <button type="button" class="goal-step" data-daily-goal-step="-1" aria-label="减少每日学习目标">−</button>
            <label><input id="daily-goal" class="daily-goal-number" type="number" min="1" max="100" step="1" value="${Math.max(1,Math.min(100,Math.round(Number(state.data.settings.dailyGoal||3))))}" aria-label="每日学习目标"><span>个 / 天</span></label>
            <button type="button" class="goal-step" data-daily-goal-step="1" aria-label="增加每日学习目标">＋</button>
          </div>
        </div>

        <div class="setting-row settings-provider-row">
          <div class="settings-provider-copy">
            <h3>自然发音</h3>
            <p>优先播放真人词典发音；没有真人音频时，使用你选择的自然合成音。</p>
          </div>
          <div class="setting-actions-inline settings-voice-actions">
            <div class="field settings-voice-field">
              <label>合成音色</label>
              <select class="select" id="tts-voice">
                ${[
                  ["af_bella","美式女声 · Bella"],
                  ["af_heart","美式女声 · Heart"],
                  ["af_nicole","美式女声 · Nicole"],
                  ["am_michael","美式男声 · Michael"],
                  ["bf_emma","英式女声 · Emma"],
                  ["bm_george","英式男声 · George"]
                ].map(([id,label])=>`<option value="${id}" ${state.data.settings.ttsVoice===id?"selected":""}>${label}</option>`).join("")}
              </select>
            </div>
            <span class="pill ${ttsReady?"green":tts.status==="error"?"red":"amber"}">${ttsReady?"语音已准备":ttsBusy?"正在准备语音":"首次使用时自动准备"}</span>
            ${ttsReady?"":`<button class="btn" data-action="prepare-kokoro-tts" ${ttsBusy?"disabled":""}>${ttsBusy?"准备中…":"准备语音"}</button>`}
          </div>
        </div>

        <details class="settings-advanced" data-settings-advanced="1">
          <summary><span><strong>高级设置</strong><small>一般无需调整</small></span><span class="settings-advanced-toggle">展开</span></summary>
          <div data-settings-advanced-body>
            <div class="setting-row settings-advanced-row">
              <div class="settings-provider-copy"><h3>AI 模型</h3><p>只有在你明确知道需要切换模型时再修改。</p></div>
              <div class="codex-runtime-grid">
                <div class="field">
                  <label>模型</label>
                  <select class="select" id="codex-model-select">
                    <option value="" ${selectedModel===""?"selected":""}>应用默认 · gpt-5.6-luna</option>
                    ${(codex.modelOptions||[]).map(model=>`<option value="${escapeHtml(model)}" ${selectedModel===model?"selected":""}>${escapeHtml(model)}</option>`).join("")}
                    <option value="__custom__">自定义模型…</option>
                  </select>
                  <input class="input" id="codex-model-custom" style="display:none;margin-top:7px" placeholder="输入模型名称" />
                </div>
                <div class="field">
                  <label>思考强度</label>
                  <select class="select" id="codex-effort">
                    <option value="" ${selectedEffort===""?"selected":""}>应用默认</option>
                    <option value="low" ${selectedEffort==="low"?"selected":""}>低</option>
                    <option value="medium" ${selectedEffort==="medium"?"selected":""}>中</option>
                    <option value="high" ${selectedEffort==="high"?"selected":""}>高</option>
                    <option value="xhigh" ${selectedEffort==="xhigh"?"selected":""}>超高</option>
                    <option value="max" ${selectedEffort==="max"?"selected":""}>最高</option>
                  </select>
                </div>
                <button class="btn primary" data-action="save-codex-runtime">保存设置</button>
              </div>
            </div>
          </div>
        </details>

        <div class="setting-row"><div><h3>导出学习数据</h3><p>备份单词卡、学习进度和复习记录。</p></div><button class="btn" data-action="export-data">导出 JSON</button></div>
        <div class="setting-row"><div><h3>导入学习数据</h3><p>从此前导出的备份恢复学习数据。</p></div><label class="btn">选择 JSON<input id="import-file" type="file" accept="application/json" style="display:none"></label></div>
        <div class="setting-row"><div><h3>清空学习数据</h3><p>删除全部单词与学习记录。</p></div><button class="btn danger" data-action="confirm-reset">清空数据</button></div>
      </div>`
    );
  }
  function renderModal(){
    if(state.modal==="reset") return `<div class="modal-backdrop"><div class="modal"><h2>确认清空全部数据？</h2><p>这会删除当前浏览器里的全部单词卡、学习进度和统计记录，而且无法撤销。</p><div class="modal-actions"><button class="btn" data-action="close-modal">取消</button><button class="btn danger" data-action="reset-data">确认清空</button></div></div></div>`;
    return "";
  }

  let lastStudyMotionSnapshot=null;
  let studyMotionCleanupTimer=null;

  function studyMotionSnapshot(){
    if(state.route==="study"&&state.study?.cardId){
      const card=getCard(state.study.cardId);
      if(!card)return null;
      const canonical=window.LexiFlowLearningCore?.canonicalStage?.(card)||String(card.stage||"");
      const stages=window.LexiFlowStudyStageSurfaceV3?.stages||[];
      return {
        key:`study:${card.id}:${canonical}`,
        cardId:card.id,
        order:Math.max(0,stages.indexOf(canonical))
      };
    }
    return null;
  }

  function animateStudySurface(previous,current){
    const shell=document.querySelector(".study-depth-shell");
    if(!shell||!current||previous?.key===current.key)return;
    if(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches)return;

    const direction=previous&&previous.cardId===current.cardId&&current.order<previous.order?-1:1;
    shell.classList.add("study-depth-motion",direction<0?"study-depth-backward":"study-depth-forward");
    const stepper=document.querySelector(".study-stepper");
    if(stepper)stepper.classList.add("study-stepper-motion");

    if(studyMotionCleanupTimer)clearTimeout(studyMotionCleanupTimer);
    studyMotionCleanupTimer=setTimeout(()=>{
      shell.classList.remove("study-depth-motion","study-depth-forward","study-depth-backward");
      stepper?.classList.remove("study-stepper-motion");
    },360);
  }

  function render(){
    const app=document.getElementById("app");
    let html;
    if(state.route==="home") html=homePage();
    else if(state.route==="add") html=addPage();
    else if(state.route==="study") html=studyPage();
    else if(state.route==="review") html=reviewPage();
    else if(state.route==="library") html=libraryPage();
    else if(state.route==="library-edit") html=libraryEditPage();
    else if(state.route==="stats") html=statsPage();
    else if(state.route==="settings") html=settingsPage();
    else html=homePage();
    const nextStudyMotionSnapshot=studyMotionSnapshot();
    const previousStudyMotionSnapshot=lastStudyMotionSnapshot;
    const motionChanged=nextStudyMotionSnapshot?.key!==previousStudyMotionSnapshot?.key;
    const reducedMotion=Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    const motionDirection=previousStudyMotionSnapshot&&nextStudyMotionSnapshot&&previousStudyMotionSnapshot.cardId===nextStudyMotionSnapshot.cardId&&nextStudyMotionSnapshot.order<previousStudyMotionSnapshot.order?-1:1;
    const commitDom=()=>{document.documentElement.dataset.lexiflowTtsVoice=state.data.settings.ttsVoice||"af_bella";app.innerHTML=html;bind();};

    if(motionChanged&&!reducedMotion&&nextStudyMotionSnapshot&&typeof document.startViewTransition==="function"){
      document.documentElement.dataset.studyMotion=motionDirection<0?"backward":"forward";
      const transition=document.startViewTransition(commitDom);
      transition.finished.finally(()=>{delete document.documentElement.dataset.studyMotion;});
    }else{
      commitDom();
      if(motionChanged&&nextStudyMotionSnapshot){
        requestAnimationFrame(()=>animateStudySurface(previousStudyMotionSnapshot,nextStudyMotionSnapshot));
      }
    }
    lastStudyMotionSnapshot=nextStudyMotionSnapshot;
  }

  function bind(){
    document.querySelectorAll("[data-route]").forEach(el=>el.addEventListener("click",()=>{
      state.addToTodayIntent=null;
      state.route=el.dataset.route;
      if(state.route!=="library-edit") state.libraryEditor=null;
      if(state.route!=="study") state.study=null;
      render();
    }));

    const lookupForm=document.getElementById("lookup-form");
    if(lookupForm) lookupForm.addEventListener("submit",async e=>{
      e.preventDefault();
      if(state.lookupStatus==="loading")return;
      const input=document.getElementById("word-input");
      const q=input.value.trim();
      if(!q){showNotice("请输入单词或中文词义","例如 keyboard、键盘、wrok 或少量中文错别字。","warn");return;}

      state.notice=null;
      state.lookup={query:q,result:null};
      state.lookupAlternativesOpen=false;
      state.lookupStatus="loading";
      state.selectedSenseId=null;
      state.addDraft=null;
      render();

      try{
        // 已经学过的词优先本地直接返回，不再让用户二次选择。
        const local=localSearchCandidates(q);
        const qNormalized=normalizeSearchText(q);
        const saved=local.length
          ? state.data.cards.find(c=>c.word.toLowerCase()===String(local[0].word).toLowerCase())
          : null;
        // Exact English headwords can safely reuse an existing learning card.
        // Chinese queries must be resolved again: an older card may contain a
        // previously mis-resolved translation and must not shadow the verified resolver.
        const exactLocal=Boolean(saved&&!containsChinese(q)&&!/\s/.test(qNormalized)&&normalizeSearchText(saved.word)===qNormalized);
        if(exactLocal){
          if(saved){
            state.lookup={query:q,result:{
              word:saved.word,
              phonetic:saved.phonetic||"",
              audioUrl:saved.audioUrl||"",
              mode:"primary",
              hasMore:false,
              cacheHit:true,
              sourceQuery:q,
              autoResolved:normalizeSearchText(q)!==normalizeSearchText(saved.word),
              senses:[{
                id:`local-${saved.id}`,
                pos:saved.pos,
                meaningZh:saved.meaningZh,
                exampleEn:saved.exampleEn,
                exampleZh:saved.exampleZh,
                senseIntentEn:saved.senseIntentEn||"",
                avoidVisualEn:saved.avoidVisualEn||[]
              }]
            }};
            state.selectedSenseId=state.lookup.result.senses[0].id;
            state.lookupStatus="idle";
            render();
            return;
          }
        }

        const payload=await api("/api/search/smart",{method:"POST",body:{query:q}});
        state.lookup={query:q,result:payload.result};
        state.selectedSenseId=payload.result?.senses?.[0]?.id||null;
        state.lookupStatus="idle";
        render();
      }catch(err){
        state.lookupStatus="idle";
        state.lookup={query:q,result:null};
        if(err.code==="DICTIONARY_KEY_MISSING"){
          state.route="settings";
          showErrorNotice(err,"需要配置词典");
        }else{
          showErrorNotice(err,"暂时没有找到合适的单词");
        }
      }
    });

    document.querySelectorAll("[data-sense-id]").forEach(el=>{
      el.addEventListener("click",e=>{
        if(e.target.closest("[data-action]"))return;
        state.selectedSenseId=el.dataset.senseId;state.addDraft=null;render();
      });
      el.addEventListener("keydown",e=>{
        if(e.key==="Enter"||e.key===" "){e.preventDefault();el.click();}
      });
    });

    document.querySelectorAll("[data-suggestion]").forEach(el=>el.addEventListener("click",async ()=>{
      const q=el.dataset.suggestion;
      state.lookup={query:q,result:null};state.lookupStatus="loading";render();
      try{
        const payload=await api("/api/dictionary/lookup",{method:"POST",body:{word:q,mode:"primary"}});
        state.lookup={query:q,result:payload.result};state.selectedSenseId=payload.result?.senses?.[0]?.id||null;state.lookupStatus="idle";render();
      }catch(err){state.lookupStatus="idle";showErrorNotice(err,"暂时没有查到这个词");render();}
    }));

    document.querySelectorAll("[data-search-alternative]").forEach(el=>el.addEventListener("click",async ()=>{
      const preferredWord=String(el.dataset.searchAlternative||"").trim();
      const sourceQuery=String(state.lookup?.result?.sourceQuery||state.lookup?.query||"").trim();
      if(!preferredWord||!sourceQuery)return;
      state.lookupStatus="loading";state.lookupAlternativesOpen=false;render();
      try{
        const payload=await api("/api/search/smart",{method:"POST",body:{query:sourceQuery,preferredWord}});
        state.lookup={query:sourceQuery,result:payload.result};state.selectedSenseId=payload.result?.senses?.[0]?.id||null;state.lookupStatus="idle";render();
      }catch(err){state.lookupStatus="idle";showErrorNotice(err,"这个表达暂时没有可靠结果");render();}
    }));

    document.querySelectorAll("[data-action]").forEach(el=>el.addEventListener("click",()=>void handleAction(el.dataset.action,el)));

    const search=document.getElementById("library-search");
    if(search) search.addEventListener("input",e=>{
      const start=e.target.selectionStart;
      const end=e.target.selectionEnd;
      state.librarySearch=e.target.value;
      render();
      requestAnimationFrame(()=>{
        const next=document.getElementById("library-search");
        if(next){
          next.focus();
          if(typeof start==="number") next.setSelectionRange(start,end??start);
        }
      });
    });

    const modelSelect=document.getElementById("codex-model-select");
    if(modelSelect) modelSelect.addEventListener("change",e=>{
      const custom=document.getElementById("codex-model-custom");
      if(custom) custom.style.display=e.target.value==="__custom__"?"block":"none";
    });

    const goal=document.getElementById("daily-goal");
    if(goal){
      const commitGoal=()=>{
        let value=Math.round(Number(goal.value||state.data.settings.dailyGoal||3));
        value=Math.max(1,Math.min(100,Number.isFinite(value)?value:3));
        goal.value=String(value);
        state.data.settings.dailyGoal=value;
        saveData();
        persistenceQueue.then(()=>{
          try{window.dispatchEvent(new CustomEvent("lexiflow:today-plan-data",{detail:{reason:"daily-goal-changed"}}));}catch{}
        }).catch(()=>{});
        toast("每日目标已更新");
      };
      goal.addEventListener("change",commitGoal);
      goal.addEventListener("keydown",event=>{
        if(event.key!=="Enter")return;
        event.preventDefault();
        commitGoal();
      });
      document.querySelectorAll("[data-daily-goal-step]").forEach(button=>button.addEventListener("click",()=>{
        const step=Number(button.dataset.dailyGoalStep||0);
        const current=Number(goal.value||state.data.settings.dailyGoal||3);
        goal.value=String(Math.max(1,Math.min(100,Math.round((Number.isFinite(current)?current:3)+step))));
        commitGoal();
      }));
    }

    const ttsVoice=document.getElementById("tts-voice");
    if(ttsVoice) ttsVoice.addEventListener("change",e=>{
      state.data.settings.ttsVoice=String(e.target.value||"af_bella");
      document.documentElement.dataset.lexiflowTtsVoice=state.data.settings.ttsVoice;
      try{localStorage.setItem("lexiflow-tts-voice",state.data.settings.ttsVoice);}catch{}
      saveData();toast("发音音色已更新");
    });

    const importFile=document.getElementById("import-file");
    if(importFile) importFile.addEventListener("change",async e=>{
      const file=e.target.files?.[0];if(!file)return;
      try{
        const parsed=JSON.parse(await file.text());
        if(!parsed||!Array.isArray(parsed.cards)||!Array.isArray(parsed.activities))throw new Error();
        state.data={...defaultData(),...parsed,settings:{dailyGoal:3,ttsVoice:"af_bella",...(parsed.settings||{})}};
        saveData();toast("数据已导入");state.route="home";render();
      }catch{toast("导入失败：文件格式不正确");}
    });

    document.querySelectorAll("[data-delete-card]").forEach(el=>el.addEventListener("click",()=>{
      const id=el.dataset.deleteCard;
      if(confirm("确认删除这张单词卡？")){state.data.cards=state.data.cards.filter(c=>c.id!==id);state.data.activities=state.data.activities.filter(a=>a.cardId!==id);saveData();toast("已删除");render();}
    }));
  }

  async function handleAction(action,el){
    if(action==="dismiss-notice"){state.notice=null;render();return;}
    if(action==="toggle-lookup-alternatives"){state.lookupAlternativesOpen=!state.lookupAlternativesOpen;render();return;}
    if(action==="refresh-lookup"){
      const q=String(state.lookup?.result?.sourceQuery||state.lookup?.query||"").trim();
      if(!q||state.lookupStatus==="loading")return;
      state.lookupStatus="loading";state.lookupAlternativesOpen=false;render();
      try{
        const payload=await api("/api/search/smart",{method:"POST",body:{query:q,forceRefresh:true}});
        state.lookup={query:q,result:payload.result};state.selectedSenseId=payload.result?.senses?.[0]?.id||null;state.lookupStatus="idle";render();
      }catch(err){state.lookupStatus="idle";showErrorNotice(err,"重新识别没有完成");render();}
      return;
    }
    if(action==="open-library-editor"){openLibraryEditor(el.dataset.cardId);return;}
    if(action==="library-edit-back"){state.libraryEditor=null;state.route="library";render();return;}
    if(action==="clear-library-image"){
      const draft=captureLibraryEditorDraft();
      if(state.libraryEditor&&draft){
        state.libraryEditor.draft={...draft,imageData:"",imageUrl:"",generatedVisualScene:"",imageGeneration:null};
        render();
      }
      return;
    }
    if(action==="save-library-card"){
      const editor=state.libraryEditor;
      const card=editor&&getCard(editor.cardId);
      const draft=card&&captureLibraryEditorDraft();
      if(!editor||!card||!draft)return;
      // Fixed lexical identity and reference example: only the learner's own
      // sentence plus visual-memory content can be changed in the library.
      card.userSentence=draft.userSentence||"";
      card.visualNote=draft.visualNote;
      card.imageData=draft.imageData||"";
      card.imageUrl=draft.imageUrl||"";
      card.generatedVisualScene=draft.generatedVisualScene||"";
      card.imageGeneration=draft.imageGeneration||null;
      card.updatedAt=new Date().toISOString();
      saveData();
      state.libraryEditor=null;
      state.route="library";
      toast("单词卡已更新");
      return;
    }
    if(action==="regenerate-library-image"){
      const editor=state.libraryEditor;
      const card=editor&&getCard(editor.cardId);
      if(!editor||!card||editor.imageGenerating)return;
      const draft=captureLibraryEditorDraft();
      if(!draft?.word||!draft.meaningZh){showNotice("先补全单词和释义","图片生成至少需要单词和中文释义。","warn");return;}
      const cardId=card.id;
      const scene=draft.visualNote||`围绕“${draft.meaningZh}”设计一个具体、清晰、生活化的记忆场景，突出 ${draft.word} 的当前含义。`;
      editor.imageGenerating=true;
      card.visualNote=scene;
      card.imageGeneration={status:"generating",phase:"preparing",message:"正在生成联想图。",code:"",startedAt:new Date().toISOString()};
      card.updatedAt=new Date().toISOString();
      editor.draft={...draft,visualNote:scene,imageGeneration:{...card.imageGeneration}};
      saveData();
      render();
      try{
        const payload=await api("/api/ai/image",{method:"POST",body:{
          word:draft.word,
          meaningZh:draft.meaningZh,
          exampleEn:draft.exampleEn,
          visualNote:scene,
          suggestedScene:"",
          sourceQuery:draft.word,
          senseIntentEn:normalizeSearchText(draft.meaningZh)===normalizeSearchText(card.meaningZh)?card.senseIntentEn||"":"",
          avoidVisualEn:normalizeSearchText(draft.meaningZh)===normalizeSearchText(card.meaningZh)?card.avoidVisualEn||[]:[]
        }});
        const latest=getCard(cardId);
        if(!latest)return;
        latest.imageData="";
        latest.imageUrl=payload.image.url;
        latest.generatedVisualScene=String(payload.image.visualNote||scene||"").trim();
        latest.imageGeneration={status:"success",phase:"done",message:"联想图已重新生成。",code:"",finishedAt:new Date().toISOString()};
        latest.updatedAt=new Date().toISOString();
        saveData();
        if(state.libraryEditor?.cardId===cardId){
          state.libraryEditor.imageGenerating=false;
          state.libraryEditor.draft=libraryEditorBaseDraft(latest);
          render();
        }
      }catch(err){
        const latest=getCard(cardId);
        if(latest){
          latest.imageGeneration={status:"error",phase:"error",message:"图片没有生成成功，可以稍后重试。",code:err.code||"IMAGE_GENERATION_FAILED",finishedAt:new Date().toISOString()};
          latest.updatedAt=new Date().toISOString();
          saveData();
        }
        if(state.libraryEditor?.cardId===cardId){
          state.libraryEditor.imageGenerating=false;
          if(latest)state.libraryEditor.draft=libraryEditorBaseDraft(latest);
          showErrorNotice(err,"图片没有生成成功");
        }
      }
      return;
    }
    if(action==="clear-lookup"){state.lookup=null;state.lookupStatus="idle";state.lookupAlternativesOpen=false;state.loadingMoreSenses=false;state.selectedSenseId=null;state.addDraft=null;render();return;}
    if(action==="lookup-again"){state.lookup=null;state.lookupStatus="idle";state.loadingMoreSenses=false;state.selectedSenseId=null;state.addDraft=null;render();return;}
    if(action==="speak"){let segments=[];try{segments=JSON.parse(el.dataset.audios||"[]");}catch{}speak(el.dataset.word,el.dataset.audio||"",segments);return;}
    if(action==="speak-sentence"){speakSentence(el.dataset.sentence||"");return;}
    if(action==="load-more-senses"){
      const q=state.lookup?.result?.word||state.lookup?.query?.trim()||"";
      if(!q || state.loadingMoreSenses)return;

      state.loadingMoreSenses=true;
      render();

      try{
        const payload=await api("/api/dictionary/lookup",{
          method:"POST",
          body:{word:q,mode:"expanded"}
        });
        state.lookup={query:q,result:payload.result};
        state.selectedSenseId=payload.result?.senses?.[0]?.id||null;
        state.addDraft=null;
      }catch(err){
        toast(err.message||"加载其它词义失败");
      }finally{
        state.loadingMoreSenses=false;
        render();
      }
      return;
    }

    if(action==="edit-sense"){
      const r=state.lookup?.result,s=r?.senses.find(x=>x.id===state.selectedSenseId);
      if(s){state.addDraft=JSON.parse(JSON.stringify(s));render();}return;
    }
    if(action==="cancel-edit"){state.addDraft=null;render();return;}
    if(action==="apply-edit"){
      const r=state.lookup?.result;if(!r||!state.addDraft)return;
      const d={...state.addDraft,pos:document.getElementById("edit-pos").value.trim()||"word",meaningZh:document.getElementById("edit-meaning").value.trim(),exampleEn:document.getElementById("edit-en").value.trim(),exampleZh:document.getElementById("edit-zh").value.trim()};
      if(!d.meaningZh||!d.exampleEn||!d.exampleZh){toast("中文释义和中英文例句不能为空");return;}
      r.senses=r.senses.map(s=>s.id===d.id?d:s);state.addDraft=null;toast("已应用修改");render();return;
    }
    if(action==="save-card"){
      const r=state.lookup?.result,s=r?.senses.find(x=>x.id===state.selectedSenseId);if(!r||!s)return;
      if(!s.meaningZh?.trim()||!s.exampleEn?.trim()){state.addDraft=JSON.parse(JSON.stringify(s));toast("保存前请补全中文释义和英文例句");render();return;}
      if(!learningExampleUsesTarget(s.exampleEn,r.word)){
        showNotice("这张卡片还不能保存",`例句没有使用当前目标词“${r.word}”。请重新识别结果，或修改例句后再保存。`,"warn");
        return;
      }
      const exists=state.data.cards.find(c=>c.word.toLowerCase()===r.word.toLowerCase()&&c.meaningZh===s.meaningZh);
      if(exists){toast("这张义项卡已经存在");return;}
      const nowDate=new Date(),now=nowDate.toISOString();
      const core=window.LexiFlowLearningCore;
      const requestedToday=state.addToTodayIntent===todayKey(nowDate);
      const currentPlan=state.data.dailyPlan;
      const addToToday=requestedToday&&Number(currentPlan?.remainingSelectSlots||0)>0;
      const card={id:uid(),word:r.word,phonetic:r.phonetic,audioUrl:r.audioUrl||"",audioUrls:Array.isArray(r.audioUrls)?r.audioUrls:[],pronunciationSource:r.pronunciationSource||"",pos:s.pos,meaningZh:s.meaningZh,exampleEn:s.exampleEn,exampleZh:s.exampleZh||"",exampleTranslationPending:!s.exampleZh?.trim(),senseIntentEn:s.senseIntentEn||"",avoidVisualEn:Array.isArray(s.avoidVisualEn)?s.avoidVisualEn:[],sourceQuery:r.sourceQuery||state.lookup?.query||r.word,stage:"select",learningStage:"select",inboxPending:!addToToday,createdAt:now,updatedAt:now,reviewCount:0,nextReviewAt:null,memoryHistory:[],visualNote:"",imageData:null,userSentence:""};
      if(addToToday){
        card.inboxPending=false;
        card.todaySelectedOn=todayKey(nowDate);
        card.selectedOn=todayKey(nowDate);
        card.inboxSelectedAt=now;
        const prev={...card,learningStage:"select"};
        card.stage="memorize";
        card.learningStage="memorize";
        Object.assign(card,core?.crossDayPatch?.(prev,{stage:"memorize",learningStage:"memorize"},nowDate)||{});
      }
      state.data.cards.unshift(card);
      state.data.activities.push({id:uid(),type:"card-created",cardId:card.id,at:now,authority:"app-shell-v1"});
      if(addToToday)state.data.activities.push({id:uid(),type:"stage-complete",cardId:card.id,stage:"select",nextStage:"memorize",at:now,authority:"add-to-today-v1"});
      saveData();
      toast(addToToday?"已加入今天的新词 · 明天开始记忆":"已保存到单词库 · 待学习");
      state.addToTodayIntent=null;state.lookup=null;state.selectedSenseId=null;state.route="home";render();return;
    }
    if(action==="continue-learning"){
      if(window.LexiFlowStudySessionV3?.open){window.LexiFlowStudySessionV3.open();return;}
      showNotice("学习会话还没有准备好","系统会按今天的学习安排选择下一张卡片，请稍后重试。","warn");
      return;
    }
    if(action==="start-review"){
      if(window.LexiFlowReviewSessionV3?.open){void window.LexiFlowReviewSessionV3.open();return;}
      showNotice("复习会话还没有准备好","系统会按今天的复习安排打开内容，请稍后重试。","warn");
      return;
    }
    if(action==="save-dictionary-key"){
      const key=document.getElementById("mw-api-key")?.value.trim()||"";
      if(!key){toast("请输入词典服务密钥");return;}
      try{
        await api("/api/settings/dictionary",{method:"POST",body:{apiKey:key}});
        toast("词典设置已保存");
        await refreshProviderStatus(true);
        void verifyProviderConnectionsOnStartup({force:true});
      }catch(err){showErrorNotice(err,"保存没有完成");}
      return;
    }
    if(action==="test-dictionary"){
      state.providerChecks.dictionary={status:"checking",at:""};
      render();
      try{
        const payload=await api("/api/dictionary/test",{method:"POST",body:{}});
        state.providerChecks.dictionary={status:"passed",message:payload.message||"在线词典增强可用",at:new Date().toISOString()};
      }catch(err){
        state.providerChecks.dictionary={status:"failed",message:err?.userError?.message||err?.message||"在线词典增强连接没有成功",at:new Date().toISOString()};
      }finally{
        await refreshProviderStatus(true);
        render();
      }
      return;
    }

    if(action==="save-codex-runtime"){
      const selected=document.getElementById("codex-model-select")?.value||"";
      const model=selected==="__custom__"
        ? (document.getElementById("codex-model-custom")?.value.trim()||"")
        : selected;
      const reasoningEffort=document.getElementById("codex-effort")?.value||"";
      try{
        await api("/api/settings/codex",{method:"POST",body:{model,reasoningEffort}});
        toast("Codex 模型与思考强度已保存");
        await refreshProviderStatus(true);
      }catch(err){
        showErrorNotice(err,"AI 设置保存失败");
      }
      return;
    }
    if(action==="test-codex-text"){
      state.providerChecks.ai={status:"checking",at:""};
      render();
      try{
        const payload=await api("/api/ai/test",{method:"POST",body:{}});
        state.providerChecks.ai={status:payload.test?.status==="passed"?"passed":"failed",message:payload.test?.message||"AI 连接正常",at:payload.test?.at||new Date().toISOString()};
      }catch(err){
        state.providerChecks.ai={status:"failed",message:err?.userError?.message||err?.message||"AI 连接检查失败",at:new Date().toISOString()};
      }finally{
        await refreshProviderStatus(true);
        render();
      }
      return;
    }
    if(action==="prepare-kokoro-tts"){
      toast("正在准备本地自然语音，首次下载可能需要一点时间…");
      try{
        await api("/api/tts/kokoro/prepare",{method:"POST",body:{}});
        toast("本地自然语音已准备完成");
        await refreshProviderStatus(true);
      }catch(err){showErrorNotice(err,"自然语音没有准备完成");}
      return;
    }
    if(action==="export-data"){
      const blob=new Blob([JSON.stringify(state.data,null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`lexiflow-data-${todayKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);return;
    }
    if(action==="confirm-reset"){state.modal="reset";render();return;}
    if(action==="close-modal"){state.modal=null;render();return;}
    if(action==="reset-data"){state.data=defaultData();saveData();state.modal=null;state.route="home";toast("本地数据已清空");render();return;}
  }

  window.addEventListener("lexiflow:examples-hydrated", event => {
    const detail=event.detail||{};
    const word=String(detail.word||"").trim().toLowerCase();
    const senses=Array.isArray(detail.senses)?detail.senses:[];
    if(!word||!senses.length)return;
    let changed=false;
    for(const card of state.data.cards){
      if(String(card.word||"").trim().toLowerCase()!==word)continue;
      const hit=senses.find(s=>
        String(s.exampleEn||"").trim()===String(card.exampleEn||"").trim() &&
        (!card.meaningZh || String(s.meaningZh||"").trim()===String(card.meaningZh||"").trim())
      );
      if(!hit||!String(hit.exampleZh||"").trim())continue;
      if(!String(card.exampleZh||"").trim()){
        card.exampleZh=String(hit.exampleZh).trim();
        card.exampleTranslationPending=false;
        card.updatedAt=new Date().toISOString();
        changed=true;
      }
    }
    if(changed){saveData();render();}
  });

  window.addEventListener("beforeunload",()=>{
    if(!persistenceReady)return;
    try{
      const body=JSON.stringify({data:state.data,appShellAuthority:"v1",reason:"beforeunload"});
      void fetch("/api/learning-data",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body,
        keepalive:true,
      }).catch(()=>{});
    }catch{}
  });

  async function initializeApp(){
    try{
      if(location.protocol === "file:"){
        await api("/api/health");
        location.replace("http://127.0.0.1:4177/");
        return;
      }
      await hydrateLearningData();
      render();
      setTimeout(()=>{void verifyProviderConnectionsOnStartup();},0);
    }catch(err){
      state.providerStatus={ok:false,serviceUnavailable:true,error:err.message};
      showErrorNotice(err,"LexiFlow 暂时无法启动");
      render();
    }
  }

  initializeApp();
})();
