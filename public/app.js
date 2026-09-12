
(() => {
  "use strict";

  const STORAGE_KEY = "lexiflow-standalone-mvp-v1";
  const APP_VERSION = 1;

  const DICTIONARY = {
    address: {
      word: "address", phonetic: "/əˈdres/",
      senses: [
        { id:"address-n", pos:"noun", meaningZh:"地址；住址", exampleEn:"Please write your address on the form.", exampleZh:"请把你的地址写在表格上。" },
        { id:"address-v", pos:"verb", meaningZh:"向……讲话；称呼；处理", exampleEn:"She addressed the audience calmly.", exampleZh:"她平静地向听众讲话。" }
      ]
    },
    apple: {
      word:"apple", phonetic:"/ˈæpəl/",
      senses:[{id:"apple-n",pos:"noun",meaningZh:"苹果",exampleEn:"He ate an apple after lunch.",exampleZh:"午饭后他吃了一个苹果。"}]
    },
    book: {
      word:"book", phonetic:"/bʊk/",
      senses:[
        {id:"book-n",pos:"noun",meaningZh:"书；书籍",exampleEn:"I borrowed this book from the library.",exampleZh:"我从图书馆借了这本书。"},
        {id:"book-v",pos:"verb",meaningZh:"预订",exampleEn:"We booked a room for two nights.",exampleZh:"我们预订了一个住两晚的房间。"}
      ]
    },
    improve:{
      word:"improve",phonetic:"/ɪmˈpruv/",
      senses:[{id:"improve-v",pos:"verb",meaningZh:"改善；提高",exampleEn:"Daily practice can improve your English.",exampleZh:"每天练习可以提高你的英语水平。"}]
    },
    benefit:{
      word:"benefit",phonetic:"/ˈbenəfɪt/",
      senses:[
        {id:"benefit-n",pos:"noun",meaningZh:"好处；益处",exampleEn:"Exercise has many health benefits.",exampleZh:"锻炼对健康有很多好处。"},
        {id:"benefit-v",pos:"verb",meaningZh:"使受益；得益于",exampleEn:"Students benefit from regular review.",exampleZh:"学生能从定期复习中受益。"}
      ]
    },
    challenge:{
      word:"challenge",phonetic:"/ˈtʃælɪndʒ/",
      senses:[{id:"challenge-n",pos:"noun",meaningZh:"挑战；难题",exampleEn:"Learning a language is a long-term challenge.",exampleZh:"学习一门语言是一项长期挑战。"}]
    },
    approach:{
      word:"approach",phonetic:"/əˈproʊtʃ/",
      senses:[
        {id:"approach-n",pos:"noun",meaningZh:"方法；方式",exampleEn:"We need a different approach to this problem.",exampleZh:"我们需要用不同的方法解决这个问题。"},
        {id:"approach-v",pos:"verb",meaningZh:"接近；靠近",exampleEn:"The train is approaching the station.",exampleZh:"火车正在接近车站。"}
      ]
    },
    maintain:{
      word:"maintain",phonetic:"/meɪnˈteɪn/",
      senses:[{id:"maintain-v",pos:"verb",meaningZh:"维持；保持；维护",exampleEn:"It is important to maintain a regular study routine.",exampleZh:"保持规律的学习习惯很重要。"}]
    },
    issue:{
      word:"issue",phonetic:"/ˈɪʃuː/",
      senses:[{id:"issue-n",pos:"noun",meaningZh:"问题；议题",exampleEn:"We need to discuss this issue carefully.",exampleZh:"我们需要认真讨论这个问题。"}]
    },
    support:{
      word:"support",phonetic:"/səˈpɔːrt/",
      senses:[
        {id:"support-v",pos:"verb",meaningZh:"支持；支撑",exampleEn:"Good habits support long-term learning.",exampleZh:"良好的习惯有助于长期学习。"},
        {id:"support-n",pos:"noun",meaningZh:"支持；帮助",exampleEn:"Thank you for your support.",exampleZh:"感谢你的支持。"}
      ]
    }
  };

  const STAGES = [
    ["select","选词确认"],
    ["memorize1","英 → 中"],
    ["memorize2","中 → 英"],
    ["visualize","视觉联想"],
    ["apply","造句应用"],
    ["review","首次复习"]
  ];

  const state = {
    route: "home",
    data: defaultData(),
    toast: "",
    modal: null,
    lookup: null,
    selectedSenseId: null,
    addDraft: null,
    study: null,
    reviewQueue: [],
    reviewIndex: 0,
    librarySearch: "",
    libraryEditor: null,
    lookupStatus: "idle",
    providerStatus: null,
    loadingMoreSenses: false,
    pronunciationHydration: {},
    notice: null,
    searchResolution: null,
    lookupAlternativesOpen: false,
    visualSceneExpanded: false
  };

  function defaultData(){
    return {
      version: APP_VERSION,
      cards: [],
      activities: [],
      settings: { dailyGoal: 5, ttsVoice: "af_bella" },
      createdAt: new Date().toISOString()
    };
  }

  function normalizeLearningData(parsed){
    return { ...defaultData(), ...(parsed||{}), settings:{dailyGoal:5,ttsVoice:"af_bella",...(parsed?.settings||{})} };
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

  function saveData(){
    if(!persistenceReady)return;
    const snapshot=JSON.parse(JSON.stringify(state.data));
    persistenceQueue=persistenceQueue
      .catch(()=>{})
      .then(()=>api("/api/learning-data",{method:"POST",body:{data:snapshot}}))
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
      await api("/api/learning-data",{method:"POST",body:{data:state.data}});
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

  async function ensureCardPronunciation(card){
    const existingAudios=Array.isArray(card?.audioUrls)?card.audioUrls.filter(Boolean):[];
    if(!card || card.audioUrl || existingAudios.length || state.pronunciationHydration[card.id]) return;
    state.pronunciationHydration[card.id]="loading";
    try{
      const payload=await api("/api/dictionary/pronunciation",{method:"POST",body:{word:card.word}});
      const phonetic=String(payload.result?.phonetic||"").trim();
      const audioUrl=String(payload.result?.audioUrl||"").trim();
      const audioUrls=Array.isArray(payload.result?.audioUrls)?payload.result.audioUrls.map(String).filter(Boolean):[];
      if(phonetic) card.phonetic=phonetic;
      if(audioUrl && !card.audioUrl) card.audioUrl=audioUrl;
      if(audioUrls.length) card.audioUrls=audioUrls;
      if(payload.result?.pronunciationSource) card.pronunciationSource=String(payload.result.pronunciationSource);
      if(phonetic || audioUrl || audioUrls.length){card.updatedAt=new Date().toISOString();saveData();}
      state.pronunciationHydration[card.id]="done";
      render();
    }catch{
      state.pronunciationHydration[card.id]="failed";
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
        <div class="brand"><div class="logo">L</div><div><strong>LexiFlow</strong><span>词义 · 语境 · 主动回忆</span></div></div>
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

  function dueCards(){
    const now=Date.now();
    return state.data.cards.filter(c => c.stage==="review" && c.nextReviewAt && new Date(c.nextReviewAt).getTime()<=now);
  }

  function activeLearningCards(){
    return state.data.cards.filter(c=>c.initialReviewPending || (c.stage!=="review" && c.stage!=="mastered"));
  }

  function todayActivities(){
    const key=todayKey();
    return state.data.activities.filter(a=>todayKey(new Date(a.at))===key);
  }

  function uniqueLearnedToday(){
    return new Set(todayActivities().filter(a=>["stage-complete","review"].includes(a.type)).map(a=>a.cardId)).size;
  }

  function streak(){
    const days = new Set(state.data.activities.map(a=>todayKey(new Date(a.at))));
    let count=0, d=new Date();
    while(days.has(todayKey(d))){count++; d=addDays(d,-1);}
    return count;
  }

  function progressPercent(){
    const goal=state.data.settings.dailyGoal||5;
    return Math.min(100,Math.round((uniqueLearnedToday()/goal)*100));
  }

  function homePage(){
    const due=dueCards().length;
    const active=activeLearningCards().length;
    const cards=state.data.cards.length;
    const learned=state.data.cards.filter(c=>c.stage==="review"||c.stage==="mastered").length;
    const today=uniqueLearnedToday();
    const goal=state.data.settings.dailyGoal||5;
    const primary = active ? `<button class="btn primary" data-action="continue-learning">继续学习</button>`
      : due ? `<button class="btn primary" data-action="start-review">开始复习</button>`
      : `<button class="btn primary" data-route="add">添加第一个单词</button>`;
    return shell(
      header("","今日学习","",`<button class="btn" data-route="add">＋ 添加单词</button>`)
      + `<div class="grid cols-4">
        <div class="card stat"><div class="stat-label">今日完成</div><div class="stat-value">${today}<span style="font-size:14px;color:var(--muted)"> / ${goal}</span></div><div class="stat-hint">目标词数</div></div>
        <div class="card stat"><div class="stat-label">待复习</div><div class="stat-value">${due}</div><div class="stat-hint">到期卡片</div></div>
        <div class="card stat"><div class="stat-label">学习中</div><div class="stat-value">${active}</div><div class="stat-hint">尚未完成首次学习</div></div>
        <div class="card stat"><div class="stat-label">连续学习</div><div class="stat-value">${streak()}<span style="font-size:14px;color:var(--muted)"> 天</span></div><div class="stat-hint">按本地日期计算</div></div>
      </div>
      <div class="section card today-card">
        <div>
          <div class="eyebrow">今日进度</div>
          <h2>${cards===0?"从一个单词开始":active?"继续今天的学习":"今天的学习已准备好"}</h2>
          <p>${cards===0?"先添加一个真正想记住的词，再通过主动回忆、视觉联想、造句和复习逐步巩固。":active?`还有 ${active} 个单词处于首次学习流程中。`:(due?`有 ${due} 个单词已经到期，建议现在复习。`:"当前没有到期任务，可以继续添加新词。")}</p>
          <div style="margin-top:16px"><div class="progress-track"><div class="progress-bar" style="width:${progressPercent()}%"></div></div><div class="stat-hint" style="margin-top:7px">今日进度 ${today}/${goal}</div></div>
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
    const stageLabel = stageLabelOf(c.stage);
    return `<div class="card pad">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
        <div><strong style="font-size:18px">${escapeHtml(c.word)}</strong><div class="phonetic">${escapeHtml(formatPhonetic(c.phonetic||""))}</div></div>
        <span class="pill ${c.stage==="review"?"green":"blue"}">${stageLabel}</span>
      </div>
      <p style="margin:13px 0 0;color:var(--muted);font-size:12px;line-height:1.6">${escapeHtml(c.meaningZh)}</p>
    </div>`;
  }

  function stageLabelOf(stage){
    return ({select:"选词确认",memorize1:"英→中",memorize2:"中→英",visualize:"视觉联想",apply:"造句",review:"复习中",mastered:"已掌握"})[stage]||stage;
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
    if(card.inboxPending||card.stage==="review"||card.stage==="mastered"){
      toast("这张卡片当前不能进入首次学习");
      state.route="home";
      render();
      return false;
    }
    state.study={
      cardId:card.id,
      revealed:false,
      feedback:null,
      applyText:card.userSentence||"",
      originalApplyText:"",
      aiSuggestionApplied:false,
      applyApproved:false,
      applyLastCheckedText:"",
      applyReviewedText:"",
      applyDetectedLanguage:"",
      visualNote:card.visualNote||"",
      visualSceneLoading:false,
      visualSceneRefreshing:false,
      visualSceneDirty:Boolean(card.visualNote),
      practicePromptLoading:false
    };
    state.route="study";
    state.visualSceneExpanded=Boolean(card.visualNote);
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

  function stageKicker(label){
    return `<div class="study-kicker">${label}</div>`;
  }

  function stageIndex(stage){ return STAGES.findIndex(([key])=>key===stage); }

  function renderStageRail(card){
    const idx=stageIndex(card.stage);
    return `<div class="study-stepper">${STAGES.map(([k,label],i)=>`<div class="study-stepper-item ${i<idx?"done":i===idx?"active":""}"><span class="study-stepper-dot">${i<idx?"✓":i+1}</span><span>${label}</span></div>${i<STAGES.length-1?`<i class="study-stepper-line ${i<idx?"done":""}"></i>`:""}`).join("")}</div>`;
  }

  function renderStage(card){
    const stage=card.stage;
    if(stage==="select") return stageSelect(card);
    if(stage==="memorize1") return stageMem1(card);
    if(stage==="memorize2") return stageMem2(card);
    if(stage==="visualize") return stageVisual(card);
    if(stage==="apply") return stageApply(card);
    if(stage==="review" && card.initialReviewPending) return stageInitialReview(card);
    return `<div class="study-center"><strong class="prompt-big">首次学习已完成</strong><p class="prompt-small">这张卡片已经进入复习队列。</p><button class="btn primary" data-route="home">返回今日学习</button></div>`;
  }

  function stageTop(card,kicker){
    return `${stageKicker(kicker)}${wordIdentity(card,{size:"medium",showPos:true,center:false})}`;
  }

  function stageSelect(card){
    return `${stageTop(card,"选词确认")}
      <div class="study-center" style="align-items:stretch;text-align:left">
        <div class="answer-box"><strong>${escapeHtml(card.meaningZh)}</strong>${sentenceExample(card.exampleEn,"answer-example-en")}<p>${escapeHtml(card.exampleZh)}</p></div>
        <div class="rating-row"><button class="btn primary" data-action="complete-stage" data-next="memorize1">确认卡片，开始记忆</button></div>
      </div>`;
  }

  function stageMem1(card){
    return `${stageKicker("英 → 中")}
      <div class="study-center">
        ${wordIdentity(card,{size:"hero",showPos:true,center:true})}
        <div class="prompt-small">先在脑中回忆中文释义，再查看答案。</div>
        ${state.study.revealed?`
          <div class="memory-answer-card">
            <div class="memory-answer-meaning">${escapeHtml(card.meaningZh)}</div>
            <div class="memory-example-section compact-example">
              <div class="memory-example-label">例句</div>
              ${sentenceExample(card.exampleEn,"memory-example-en")}
              <div class="memory-example-zh">${escapeHtml(card.exampleZh)}</div>
            </div>
          </div>
          <div class="rating-row">
            <button class="btn" data-action="memory-rate" data-remembered="0">没记住</button>
            <button class="btn primary" data-action="memory-rate" data-remembered="1">记住了</button>
          </div>
        `:`
          <button class="btn primary" style="margin-top:22px" data-action="reveal">查看答案</button>
        `}
      </div>`;
  }

  function stageMem2(card){
    return `${stageKicker("中 → 英")}
      <div class="study-center">
        <div class="prompt-big chinese-memory-prompt">${escapeHtml(card.meaningZh)}</div>
        <div class="prompt-small">根据中文释义主动回忆英文单词。</div>

        ${state.study.revealed?`
          <div class="memory-answer-card word-answer">
            ${wordIdentity(card,{size:"large",showPos:true,center:false})}
            <div class="memory-example-section">
              <div class="memory-example-label">例句</div>
              ${sentenceExample(card.exampleEn,"memory-example-en")}
              <div class="memory-example-zh">${escapeHtml(card.exampleZh)}</div>
            </div>
          </div>
          <div class="rating-row">
            <button class="btn" data-action="memory-rate" data-remembered="0">没记住</button>
            <button class="btn primary" data-action="memory-rate" data-remembered="1">记住了</button>
          </div>
        `:`
          <button class="btn primary" style="margin-top:22px" data-action="reveal">查看答案</button>
        `}
      </div>`;
  }

const visualProgressTimers=new Map();

function stopVisualProgress(cardId){
  const timers=visualProgressTimers.get(cardId)||[];
  timers.forEach(timer=>clearTimeout(timer));
  visualProgressTimers.delete(cardId);
}

function visualProgressMeta(phase){
  const phases={
    preparing:{index:0,title:"正在准备画面",detail:"整理当前词义和联想场景。"},
    submitted:{index:1,title:"生成任务已提交",detail:"图片任务已经交给图像服务。"},
    waiting:{index:2,title:"等待图片返回",detail:"图像生成比文字更慢，可以直接进入下一步。"},
    long:{index:3,title:"仍在生成",detail:"任务仍在继续，不需要停留在这一页。"}
  };
  return phases[phase]||phases.waiting;
}

function startVisualProgress(cardId){
  stopVisualProgress(cardId);
  const setPhase=phase=>{
    const card=getCard(cardId);
    if(!card||card.imageGeneration?.status!=="generating")return;
    card.imageGeneration={...card.imageGeneration,phase};
    if(state.study?.cardId===cardId&&card.stage==="visualize")render();
  };
  const timers=[
    setTimeout(()=>setPhase("submitted"),450),
    setTimeout(()=>setPhase("waiting"),4200),
    setTimeout(()=>setPhase("long"),15000)
  ];
  visualProgressTimers.set(cardId,timers);
}

function visualSceneNeedsRefresh(scene,word){
  const value=String(scene||"").trim();
  if(!value)return false;
  const target=String(word||"").trim();
  if(target&&value.toLowerCase().includes(target.toLowerCase()))return true;
  if(/[A-Za-z0-9]{2,}/.test(value))return true;
  return /(写着|标着|印着|标签|招牌|logo|LOGO|屏幕文字|文字为|字样)/.test(value);
}

async function ensureVisualSceneSuggestion(card,refresh=false){
  if(!card||!state.study||state.study.cardId!==card.id)return;
  if(!refresh&&card.visualSceneSuggestion?.scene&&card.practicePrompt?.question)return;
  if(state.study.visualSceneLoading)return;
  const cardId=card.id;
  const previousSuggestedScene=String(card.visualSceneSuggestion?.scene||"");
  const previous=String(state.study.visualNote||previousSuggestedScene||"");
  const draftFollowedSuggestion=!state.study.visualSceneDirty||normalizeSearchText(state.study.visualNote)===normalizeSearchText(previousSuggestedScene);
  state.study.visualSceneLoading=true;
  state.study.visualSceneRefreshing=Boolean(refresh);
  render();
  try{
    const payload=await api("/api/ai/visual-scene",{method:"POST",body:{word:card.word,meaningZh:card.meaningZh,exampleEn:card.exampleEn,senseIntentEn:card.senseIntentEn||"",previousScene:refresh?previous:""}});
    const latest=getCard(cardId);
    if(!latest)return;
    const nextScene=String(payload.assist?.scene||"").trim();
    latest.visualSceneSuggestion={scene:nextScene,cue:String(payload.assist?.cue||"").trim()};
    if(payload.assist?.practiceQuestion)latest.practicePrompt={question:String(payload.assist.practiceQuestion).trim()};
    if(state.study?.cardId===cardId&&nextScene&&draftFollowedSuggestion){
      state.study.visualNote=nextScene;
      state.study.visualSceneDirty=false;
      if(refresh&&visualSceneNeedsRefresh(previous,card.word)) latest.visualNote=nextScene;
    }
    latest.updatedAt=new Date().toISOString();
    saveData();
  }catch{
    const latest=getCard(cardId);
    if(latest&&!latest.visualSceneSuggestion?.scene)latest.visualSceneSuggestion={scene:`把“${latest.meaningZh}”放进一个你熟悉、具体的生活场景。`,cue:`${latest.word} → ${latest.meaningZh}`};
    if(latest&&!latest.practicePrompt?.question)latest.practicePrompt={question:`你在什么情况下会用到“${latest.meaningZh}”？`};
    if(state.study?.cardId===cardId&&!state.study.visualSceneDirty&&!state.study.visualNote&&latest?.visualSceneSuggestion?.scene){
      state.study.visualNote=latest.visualSceneSuggestion.scene;
    }
  }finally{
    if(state.study?.cardId===cardId){
      state.study.visualSceneLoading=false;
      state.study.visualSceneRefreshing=false;
      render();
    }
  }
}

  async function ensurePracticePrompt(card,refresh=false){
    if(!card||!state.study||state.study.cardId!==card.id)return;
    if(!refresh&&card.practicePrompt?.question)return;
    if(state.study.practicePromptLoading)return;
    const cardId=card.id;
    const previous=String(card.practicePrompt?.question||"");
    state.study.practicePromptLoading=true;
    render();
    try{
      const payload=await api("/api/ai/practice-prompt",{method:"POST",body:{word:card.word,meaningZh:card.meaningZh,exampleEn:card.exampleEn,previousQuestion:refresh?previous:""}});
      const latest=getCard(cardId);
      if(!latest)return;
      latest.practicePrompt={question:String(payload.prompt?.question||"").trim()};
      latest.updatedAt=new Date().toISOString();
      saveData();
    }catch{
      const latest=getCard(cardId);
      if(latest&&!latest.practicePrompt?.question)latest.practicePrompt={question:`你在什么情况下会用到“${latest.meaningZh}”？`};
    }finally{
      if(state.study?.cardId===cardId){state.study.practicePromptLoading=false;render();}
    }
  }

  function stageVisual(card){
  const currentScene=String(state.study.visualNote||"").trim();
  const generation=card.imageGeneration||{status:"idle",message:"",code:"",startedAt:"",phase:""};
  const hasImage=Boolean(card.imageData||card.imageUrl);
  const generating=Boolean(state.study.imageGenerating||generation.status==="generating");
  const scene=String(card.visualSceneSuggestion?.scene||"").trim();
  const cue=String(card.visualSceneSuggestion?.cue||"").trim();
  const sceneLoading=Boolean(state.study.visualSceneLoading);
  const sceneRefreshing=Boolean(state.study.visualSceneRefreshing);
  const sceneDraft=String(currentScene||scene||"").trim();
  const progress=visualProgressMeta(generation.phase||"waiting");

  const riskyStoredScene=visualSceneNeedsRefresh(scene,card.word);
  const riskyDraftScene=scene&&normalizeSearchText(sceneDraft)===normalizeSearchText(scene)&&visualSceneNeedsRefresh(sceneDraft,card.word);
  if((!scene||!card.practicePrompt?.question||riskyStoredScene||riskyDraftScene)&&!sceneLoading){setTimeout(()=>void ensureVisualSceneSuggestion(card,riskyStoredScene||riskyDraftScene),0);}

  const imageArea=hasImage
    ? `<img class="visual-memory-image" data-card-id="${escapeHtml(card.id)}" src="${card.imageData||card.imageUrl}" alt="${escapeHtml(card.word)} 的联想图" />`
    : `<div class="visual-canvas-empty"><strong>${generating?progress.title:"联想图会显示在这里"}</strong><span>${generating?"生成完成后会自动更新":"先确认右侧场景，再生成图片"}</span></div>`;

  const progressSteps=["准备","提交","等待","持续生成"];
  const progressStrip=generating?`<div class="visual-progress-strip">${progressSteps.map((label,index)=>`<span class="${index<progress.index?"done":index===progress.index?"active":""}">${index<progress.index?"✓":index+1}<em>${label}</em></span>`).join("")}</div>`:"";

  return `${stageKicker("视觉联想")}
    <div class="visual-learning-stage">
      <div class="learning-stage-heading">
        <div><span class="learning-stage-index">04 / 06</span><h2>用画面记住 ${escapeHtml(card.word)}</h2></div>
        <div class="learning-stage-meta">${escapeHtml(card.meaningZh)} · ${escapeHtml(card.pos||"")}</div>
      </div>

      <div class="visual-workspace">
        <div class="visual-image-canvas ${hasImage?"has-image":""} ${generating?"is-generating":""}">
          ${imageArea}
          ${generating?`<div class="visual-generating-overlay"><span class="mini-spinner"></span><strong>${escapeHtml(progress.title)}</strong><small>${escapeHtml(progress.detail)}</small>${progressStrip}</div>`:""}
        </div>
        <aside class="scene-panel ${sceneLoading?"is-loading":""}">
          <div class="scene-panel-label"><span>联想场景</span><small>${generating?"生成中已锁定":"可编辑"}</small></div>
          ${sceneLoading&&!sceneDraft?`<div class="scene-loading"><span class="mini-spinner"></span><span>正在准备场景…</span></div>`:`<textarea class="scene-editor" id="visual-note" ${generating?"readonly aria-readonly=\"true\"":""} placeholder="修改这个场景，生成图片时会按这里的内容来。">${escapeHtml(sceneDraft)}</textarea>`}
          ${cue?`<div class="scene-cue">记忆提示 · ${escapeHtml(cue)}</div>`:""}
          <button class="text-action scene-refresh-action" data-action="refresh-visual-scene" ${sceneLoading||generating?"disabled":""}>${sceneLoading?`<span class="mini-spinner"></span>${sceneRefreshing?"正在更换…":"正在准备…"}`:"换一个场景"}</button>
        </aside>
      </div>

      ${generation.status==="error"?`<div class="visual-status-inline error"><span>这次没有生成成功，可以重试或上传自己的图片。</span></div>`:""}

      <div class="visual-command-bar">
        <button class="btn primary visual-primary-action" data-action="generate-visual" ${generating||!sceneDraft?"disabled":""}>${generating?"生成中…":hasImage?"重新生成":"生成联想图"}</button>
        <label class="text-action upload-text-action" for="visual-file" ${generating?"aria-disabled=\"true\" style=\"pointer-events:none;opacity:.5\"":""}>上传图片</label>
      </div>
      <input id="visual-file" type="file" accept="image/png,image/jpeg,image/webp" style="display:none" />

      <div class="learning-stage-footer single-action">
        <button class="btn primary" data-action="finish-visual">下一步</button>
      </div>
    </div>`;
}

  function stageInitialReview(card){
    return `${stageKicker("首次复习 · 主动回忆")}
      <div class="study-center">
        ${wordIdentity(card,{size:"hero",showPos:true,center:true})}
        <div class="prompt-small">先回忆中文释义，再查看答案。</div>
        ${state.study?.revealed?`
          <div class="memory-answer-card">
            <div class="memory-answer-meaning">${escapeHtml(card.meaningZh)}</div>
            <div class="memory-example-section compact-example">
              <div class="memory-example-label">例句</div>
              ${sentenceExample(card.exampleEn,"memory-example-en")}
              <div class="memory-example-zh">${escapeHtml(card.exampleZh)}</div>
            </div>
          </div>
          <div class="rating-row">
            <button class="btn" data-action="initial-review-rate" data-quality="again">没记住 · 明天再复习</button>
            <button class="btn primary" data-action="initial-review-rate" data-quality="good">记住了 · 3 天后复习</button>
          </div>
        `:`<button class="btn primary" style="margin-top:22px" data-action="initial-review-reveal">查看答案</button>`}
      </div>`;
  }

  function localFeedback(text,word){
    const t=text.trim();
    const tips=[];
    if(!t) return {level:"warn",title:"请先写一个完整句子",tips:["句子不能为空。"]};
    if(t.split(/\s+/).length<4) tips.push("句子偏短，建议补充更完整的语境。");
    const re=new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`,"i");
    if(!re.test(t)) tips.push(`句子里还没有出现目标词 “${word}”。`);
    if(!/[.!?]$/.test(t)) tips.push("建议在句末加入标点。");
    if(t[0] && t[0]!==t[0].toUpperCase()) tips.push("英文句子通常以大写字母开头。");
    return tips.length?{level:"warn",title:"本地反馈：可以再改一改",tips}:{level:"good",title:"本地反馈：句子结构基本完整",tips:["目标词已使用。","句子长度和基本格式完整。"]};
  }

  function stageApply(card){
    const fb=state.study.feedback;
    const current=String(state.study.applyText||"").trim();
    const checked=Boolean(state.study.applyApproved && state.study.applyLastCheckedText===current);
    const chinese=containsChinese(current);
    const missingKeyword=Boolean(current && !chinese && !sentenceUsesTargetWord(current,card.word));
    const corrected=Boolean(state.study.originalApplyText && state.study.originalApplyText.trim()!==current);
    const keyword=String(fb?.keyword||card.word||"").trim();
    const suggestion=String(fb?.suggestion||"").trim();
    const question=String(card.practicePrompt?.question||"").trim();
    const promptLoading=Boolean(state.study.practicePromptLoading);

    if(!question&&!promptLoading){setTimeout(()=>void ensurePracticePrompt(card,false),0);}

    let feedbackPanel="";
    if(state.study.applySubmitting){
      feedbackPanel=`<div class="ai-feedback-panel pending"><div class="ai-feedback-head"><div><small>正在检查</small><strong>${chinese?"正在把你的意思转成自然英文":"正在检查用词和表达"}</strong></div></div><div class="ai-feedback-progress"><i></i></div></div>`;
    }else if(fb&&suggestion){
      feedbackPanel=`<div class="ai-feedback-panel ${fb.suggestionApproved?"good":"warn"}"><div class="ai-feedback-head"><div><small>${fb.inputLanguage==="zh"?"英文表达":"修改建议"}</small><strong>${escapeHtml(fb.title||"可以这样表达")}</strong></div></div><div class="ai-suggestion-sentence">${sentenceExample(suggestion,"example-en",keyword)}</div>${(fb.tips||[]).length?`<div class="ai-feedback-notes">${(fb.tips||[]).map(x=>`<span>${escapeHtml(x)}</span>`).join("")}</div>`:""}<div class="ai-feedback-actions"><button class="btn primary" data-action="adopt-ai-sentence" ${fb.suggestionApproved?"":"disabled"}>采用建议</button><button class="btn" data-action="pass-apply">保留原句，继续首次复习</button><button class="text-action" data-action="edit-apply">继续修改</button></div></div>`;
    }else if(fb&&checked){
      feedbackPanel=`<div class="ai-feedback-panel good"><div class="ai-feedback-head"><div><small>检查结果</small><strong>${escapeHtml(fb.title||"表达自然，可以直接使用")}</strong></div><span class="ai-keyword-chip">${escapeHtml(keyword)}</span></div>${sentenceExample(current,"example-en",keyword)}<div class="ai-feedback-actions"><button class="btn primary" data-action="pass-apply">继续首次复习</button></div></div>`;
    }else if(fb){
      feedbackPanel=`<div class="ai-feedback-panel warn"><div class="ai-feedback-head"><div><small>检查结果</small><strong>${escapeHtml(fb.title||"这句话还需要调整")}</strong></div></div>${(fb.tips||[]).length?`<div class="ai-feedback-notes">${(fb.tips||[]).map(x=>`<span>${escapeHtml(x)}</span>`).join("")}</div>`:""}<div class="ai-feedback-actions"><button class="btn" data-action="pass-apply">保留原句，继续首次复习</button><button class="text-action" data-action="edit-apply">继续修改</button></div></div>`;
    }

    return `${stageKicker("造句应用")}
      <div class="apply-learning-stage">
        <div class="apply-word-hero">${wordIdentity(card,{size:"large",showPos:true,center:true})}<span>${escapeHtml(card.meaningZh)}</span></div>
        <div class="ai-practice-prompt"><span class="ai-spark">✦</span><div><small>AI 给你一个话题</small><strong>${escapeHtml(question||(promptLoading?"正在想一个更具体的问题…":`你在什么情况下会用到“${card.meaningZh}”？`))}</strong></div><button class="text-action scene-refresh-action" data-action="refresh-practice-prompt" ${promptLoading||state.study.applySubmitting?"disabled":""}>${promptLoading?`<span class="mini-spinner"></span>正在换一个…`:"换一个"}</button></div>
        <div class="apply-composer"><textarea class="textarea apply-composer-input" id="apply-text" placeholder="中文或英文都可以，写你真正想表达的话…">${escapeHtml(state.study.applyText||"")}</textarea><div class="apply-composer-bottom"><span>Enter 发送 · Shift + Enter 换行</span><button class="btn primary" data-action="submit-apply" ${state.study.applySubmitting||!current?"disabled":""}>${state.study.applySubmitting?"AI 正在处理…":"检查句子"}</button></div></div>
        <div id="apply-keyword-warning" class="apply-keyword-warning" ${missingKeyword?"":"hidden"}>还没有用到目标词 “${escapeHtml(card.word)}”，AI 会尝试帮你自然地放进句子里。</div>
        ${corrected?`<button class="text-action apply-undo" data-action="restore-original-apply">↶ 撤销 AI 修改</button>`:""}
        ${feedbackPanel}
      </div>`;
  }

  function advanceStage(card,next,meta={}){
    card.stage=next; card.updatedAt=new Date().toISOString();
    if(meta.remembered!==undefined){
      card.memoryHistory=card.memoryHistory||[];
      card.memoryHistory.push({stage:next==="memorize2"?"memorize1":"memorize2",remembered:meta.remembered,at:new Date().toISOString()});
    }
    recordActivity("stage-complete",card.id,{stage:next});
    saveData();
    state.study.revealed=false;state.study.feedback=null;
    render();
  }

  function enterInitialReview(card){
    card.stage="review";
    card.initialReviewPending=true;
    card.nextReviewAt=null;
    card.updatedAt=new Date().toISOString();
    recordActivity("stage-complete",card.id,{stage:"initial-review-ready"});
    saveData();
    state.study.revealed=false;
    state.study.feedback=null;
    render();
  }

  function finishInitialReview(card, quality){
    const now=new Date();
    card.stage="review";
    card.initialReviewPending=false;
    card.reviewCount=(card.reviewCount||0)+1;
    card.lastReviewedAt=now.toISOString();
    card.nextReviewAt=addDays(now, quality==="good"?3:1).toISOString();
    card.updatedAt=now.toISOString();
    recordActivity("review",card.id,{quality,kind:"initial"});
    saveData();
    toast("首次复习完成，已加入后续复习计划");
    state.study=null;state.route="home";render();
  }

  function reviewPage(){
    const due=dueCards();
    return shell(
      header("LEXIFLOW · REVIEW","复习中心","",due.length?`<button class="btn primary" data-action="start-review">开始复习 (${due.length})</button>`:"")
      + `<div class="grid cols-3">
        <div class="card stat"><div class="stat-label">今日到期</div><div class="stat-value">${due.length}</div><div class="stat-hint">现在可以复习</div></div>
        <div class="card stat"><div class="stat-label">累计复习</div><div class="stat-value">${state.data.activities.filter(a=>a.type==="review").length}</div><div class="stat-hint">所有复习记录</div></div>
        <div class="card stat"><div class="stat-label">已进入复习</div><div class="stat-value">${state.data.cards.filter(c=>c.stage==="review").length}</div><div class="stat-hint">首次学习已完成</div></div>
      </div>
      <div class="section card pad">${due.length?`<div class="table-wrap"><table class="table"><thead><tr><th>单词</th><th>中文释义</th><th>复习次数</th><th>到期时间</th></tr></thead><tbody>${due.map(c=>`<tr><td><strong>${escapeHtml(c.word)}</strong><div class="phonetic">${escapeHtml(formatPhonetic(c.phonetic))}</div></td><td>${escapeHtml(c.meaningZh)}</td><td>${c.reviewCount||0}</td><td>${new Date(c.nextReviewAt).toLocaleString()}</td></tr>`).join("")}</tbody></table></div>`
      :`<div class="empty"><div class="empty-icon">✓</div><strong>暂时没有到期复习</strong><span>完成首次学习后，卡片会自动进入复习队列。</span></div>`}</div>`
    );
  }

  function startReview(){
    const due=dueCards();
    if(!due.length){toast("当前没有到期复习");return;}
    state.reviewQueue=due.map(c=>c.id);state.reviewIndex=0;state.route="review-session";state.study={revealed:false};render();
  }

  function reviewSessionPage(){
    const id=state.reviewQueue[state.reviewIndex], card=getCard(id);
    if(!card){state.route="review";return render();}
    if(!card.phonetic && !state.pronunciationHydration[card.id]){setTimeout(()=>void ensureCardPronunciation(card),0);}
    return shell(
      header("","复习会话",`${state.reviewIndex+1} / ${state.reviewQueue.length}`,`<button class="btn" data-route="review">退出复习</button>`)
      + `<div class="review-depth-stage"><div class="study-depth-shell"><span class="study-stack-layer study-stack-layer-far" aria-hidden="true"></span><span class="study-stack-layer study-stack-layer-near" aria-hidden="true"></span><div class="card study-card"><div class="study-kicker">主动回忆</div><div class="study-center">
        ${wordIdentity(card,{size:"hero",showPos:true,center:true})}<div class="prompt-small">先回忆中文释义，再查看答案。</div>
        ${state.study?.revealed?`<div class="answer-box"><strong>${escapeHtml(card.meaningZh)}</strong>${sentenceExample(card.exampleEn,"answer-example-en")}<p>${escapeHtml(card.exampleZh)}</p></div>
        <div class="rating-row"><button class="btn" data-action="review-rate" data-quality="again">没记住 · 明天再复习</button><button class="btn primary" data-action="review-rate" data-quality="good">记住了 · 3 天后复习</button></div>`
        :`<button class="btn primary" style="margin-top:22px" data-action="review-reveal">查看答案</button>`}
      </div></div></div></div>`
    );
  }

  function rateReview(card,quality){
    const now=new Date();
    card.reviewCount=(card.reviewCount||0)+1;
    card.lastReviewedAt=now.toISOString();
    card.nextReviewAt=addDays(now,quality==="good"?3:1).toISOString();
    card.updatedAt=now.toISOString();
    recordActivity("review",card.id,{quality,kind:"scheduled"});
    saveData();
    state.reviewIndex++;
    if(state.reviewIndex>=state.reviewQueue.length){toast("本轮复习完成");state.route="review";state.study=null;}
    else state.study={revealed:false};
    render();
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
        <td>${stageLabelOf(c.stage)}</td>
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
    const last7=[];
    for(let i=6;i>=0;i--){const d=addDays(new Date(),-i),key=todayKey(d);last7.push({key,label:`${d.getMonth()+1}/${d.getDate()}`,count:new Set(state.data.activities.filter(a=>todayKey(new Date(a.at))===key).map(a=>a.cardId)).size});}
    const max=Math.max(1,...last7.map(x=>x.count));
    const reviews=state.data.activities.filter(a=>a.type==="review").length;
    const remembered=state.data.activities.filter(a=>a.type==="review"&&a.quality==="good").length;
    return shell(
      header("","学习统计","")
      + `<div class="grid cols-4">
        <div class="card stat"><div class="stat-label">总词数</div><div class="stat-value">${state.data.cards.length}</div><div class="stat-hint">已保存卡片</div></div>
        <div class="card stat"><div class="stat-label">累计复习</div><div class="stat-value">${reviews}</div><div class="stat-hint">复习次数</div></div>
        <div class="card stat"><div class="stat-label">复习记住率</div><div class="stat-value">${reviews?Math.round(remembered/reviews*100):0}<span style="font-size:14px;color:var(--muted)">%</span></div><div class="stat-hint">按自评结果计算</div></div>
        <div class="card stat"><div class="stat-label">连续学习</div><div class="stat-value">${streak()}<span style="font-size:14px;color:var(--muted)"> 天</span></div><div class="stat-hint">按连续学习天数计算</div></div>
      </div>
      <div class="section card pad"><div class="section-title"><div><h2>最近 7 天学习量</h2><p>按发生过学习或复习的不同单词数统计。</p></div></div><div class="chart">${last7.map(x=>`<div class="bar-wrap"><div class="bar-value">${x.count}</div><div class="bar" style="height:${Math.round(x.count/max*120)+4}px"></div><div class="bar-label">${x.label}</div></div>`).join("")}</div></div>`
    );
  }

  function settingsPage(){
    const status=state.providerStatus;
    const dict=status?.dictionary;
    const codex=status?.codex;
    const runtime=codex?.runtimeTest||{};
    const tts=status?.tts||{};
    const selectedModel=codex?.selectedModel||"";
    const selectedEffort=codex?.selectedReasoningEffort||"";

    const runtimePill =
      runtime.status==="passed"
        ? `<span class="pill green">✓ 连接正常</span>`
        : runtime.status==="failed"
          ? `<span class="pill red">× 连接异常</span>`
          : `<span class="pill amber">未检查</span>`;

    return shell(
      header(
        "",
        "设置",
        "",
        `<button class="btn" data-action="refresh-provider">刷新状态</button>`
      )
      + `<div class="settings-security-banner">🔒 API Key 仅保存在本机 settings.json；Windows 桌面版使用系统加密，仓库不会包含该文件。</div><div class="settings-list">
        <div class="setting-row">
          <div>
            <h3>英语词典</h3>
            <p>Merriam-Webster Learner's Dictionary · ${dict?.configured?`已连接 ${escapeHtml(dict.maskedKey||"")}`:"未连接"}</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input class="input" id="mw-api-key" type="password" style="width:250px" placeholder="粘贴 Dictionary API Key（仅本机）" />
            <button class="btn primary" data-action="save-dictionary-key">保存</button>
            <button class="btn" data-action="test-dictionary">检查连接</button>
          </div>
        </div>

        <div class="setting-row" style="align-items:flex-start">
          <div style="min-width:310px;flex:1">
            <h3>AI 服务</h3>
            <p>${status?.serviceUnavailable?"本地 AI 服务尚未连接，请通过启动脚本打开 LexiFlow。":codex?.cliAvailable?`已连接${codex?.effectiveModel?` · ${escapeHtml(codex.effectiveModel)}`:""}`:"当前未连接到可用的 AI 服务。"}</p>
            ${runtime.message?`<p>最近状态：${escapeHtml(runtime.message)}</p>`:""}
            <details class="advanced-diagnostics">
              <summary>高级诊断</summary>
              <div class="advanced-diagnostics-body">
                <p>本机 Codex：${codex?.cliAvailable?"可用":"不可用"}${codex?.version?` · ${escapeHtml(codex.version)}`:""}</p>
                <p>本机认证：${codex?.authFound?"已检测":"未检测"}</p>
                <p>默认模型：${escapeHtml(codex?.model||"跟随 Codex 配置")}</p>
              </div>
            </details>
          </div>
          <div class="setting-actions-inline">
            <span class="pill ${codex?.cliAvailable?"green":"red"}">${codex?.cliAvailable?"AI 已连接":"AI 未连接"}</span>
            ${runtimePill}
            <button class="btn" data-action="test-codex-text">检查连接</button>
          </div>
        </div>

        <div class="setting-row" style="align-items:flex-start">
          <div style="min-width:260px">
            <h3>模型与思考强度</h3>
            
          </div>
          <div class="codex-runtime-grid">
            <div class="field">
              <label>模型</label>
              <select class="select" id="codex-model-select">
                <option value="" ${selectedModel===""?"selected":""}>应用默认 · gpt-5.6-luna</option>
                ${(codex?.modelOptions||[]).map(model=>`<option value="${escapeHtml(model)}" ${selectedModel===model?"selected":""}>${escapeHtml(model)}</option>`).join("")}
                <option value="__custom__">自定义模型 ID…</option>
              </select>
              <input class="input" id="codex-model-custom" style="display:none;margin-top:7px" placeholder="输入自定义模型 ID" />
            </div>
            <div class="field">
              <label>思考强度</label>
              <select class="select" id="codex-effort">
                <option value="" ${selectedEffort===""?"selected":""}>应用默认 · 中</option>
                <option value="low" ${selectedEffort==="low"?"selected":""}>低</option>
                <option value="medium" ${selectedEffort==="medium"?"selected":""}>中</option>
                <option value="high" ${selectedEffort==="high"?"selected":""}>高</option>
                <option value="xhigh" ${selectedEffort==="xhigh"?"selected":""}>超高</option>
                <option value="max" ${selectedEffort==="max"?"selected":""}>最高</option>
              </select>
            </div>
            <button class="btn primary" data-action="save-codex-runtime">保存 AI 配置</button>
          </div>
        </div>

        <div class="setting-row">
          <div>
            <h3>图片生成</h3>
            <p>视觉联想阶段复用上面的模型/思考强度和同一套 Codex 认证。图片能力取决于当前 AI 环境和所选模型；生成失败时可以上传本地图或直接跳过。</p>
          </div>
          <span class="pill ${codex?.cliAvailable?"amber":"red"}">${codex?.cliAvailable?"可用":"当前不可用"}</span>
        </div>

        <div class="setting-row">
          <div><h3>每日学习目标</h3><p></p></div>
          <select class="select" id="daily-goal" style="width:130px">${[3,5,8,10,15].map(n=>`<option value="${n}" ${state.data.settings.dailyGoal===n?"selected":""}>${n} 个词</option>`).join("")}</select>
        </div>

        <div class="setting-row" style="align-items:flex-start">
          <div style="min-width:300px;flex:1">
            <h3>本地自然发音</h3>
            <p>Kokoro-82M 本地语音 · 真人词典/Wikimedia 发音仍优先。首次使用会自动下载模型，完成后可离线使用，不需要 Python 或 Windows 系统音色。</p>
            ${tts.status==="downloading"?`<p>模型下载中${Number.isFinite(Number(tts.progress))?` · ${Math.round(Number(tts.progress))}%`:""}</p>`:tts.status==="error"?`<p>最近错误：${escapeHtml(tts.error||"模型没有准备完成")}</p>`:""}
          </div>
          <div class="setting-actions-inline" style="align-items:flex-end;flex-wrap:wrap">
            <div class="field" style="min-width:210px">
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
            <span class="pill ${tts.status==="ready"?"green":tts.status==="error"?"red":"amber"}">${tts.status==="ready"?"本地模型已就绪":tts.status==="downloading"?"正在下载模型":"首次使用自动准备"}</span>
            <button class="btn" data-action="prepare-kokoro-tts" ${tts.status==="downloading"||tts.status==="loading"?"disabled":""}>${tts.status==="ready"?"重新检查":"准备语音模型"}</button>
          </div>
        </div>

        <div class="setting-row"><div><h3>导出学习数据</h3><p></p></div><button class="btn" data-action="export-data">导出 JSON</button></div>
        <div class="setting-row"><div><h3>导入学习数据</h3><p></p></div><label class="btn">选择 JSON<input id="import-file" type="file" accept="application/json" style="display:none"></label></div>
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
      return {
        key:`study:${card.id}:${card.stage}`,
        cardId:card.id,
        order:stageIndex(card.stage)
      };
    }
    if(state.route==="review-session"){
      const cardId=state.reviewQueue[state.reviewIndex];
      const card=cardId&&getCard(cardId);
      if(!card)return null;
      return {
        key:`review:${state.reviewIndex}:${card.id}`,
        cardId:card.id,
        order:state.reviewIndex
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
    else if(state.route==="review-session") html=reviewSessionPage();
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
      state.route=el.dataset.route;
      if(state.route!=="library-edit") state.libraryEditor=null;
      if(state.route!=="study"&&state.route!=="review-session") state.study=null;
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
        const exactLocal=Boolean(saved&&!containsChinese(q)&&normalizeSearchText(saved.word)===qNormalized);
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
    if(goal) goal.addEventListener("change",e=>{state.data.settings.dailyGoal=Number(e.target.value);saveData();toast("每日目标已更新");});

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
        state.data={...defaultData(),...parsed,settings:{dailyGoal:5,ttsVoice:"af_bella",...(parsed.settings||{})}};
        saveData();toast("数据已导入");state.route="home";render();
      }catch{toast("导入失败：文件格式不正确");}
    });

    document.querySelectorAll(".visual-memory-image").forEach(img=>img.addEventListener("error",()=>{
      const cardId=img.dataset.cardId;
      const c=getCard(cardId);
      if(!c)return;
      c.imageData="";
      c.imageUrl="";
      c.imageGeneration={
        status:"error",
        message:"原图片文件已不在本机，请重新生成或选择一张图片。",
        code:"IMAGE_MISSING",
        finishedAt:new Date().toISOString()
      };
      c.updatedAt=new Date().toISOString();
      saveData();
      if(state.study?.cardId===cardId) render();
    }));

    const applyText=document.getElementById("apply-text");
    if(applyText){
      const syncApplyUi=()=>{
        if(!state.study)return;
        const value=String(applyText.value||"");
        state.study.applyText=value;
        state.study.applyApproved=false;
        state.study.applyLastCheckedText="";
        state.study.applyReviewedText="";
        const warning=document.getElementById("apply-keyword-warning");
        const word=getCard(state.study.cardId)?.word||"";
        const missing=Boolean(value.trim()&&!containsChinese(value)&&!sentenceUsesTargetWord(value,word));
        if(warning) warning.hidden=!missing;
        const pass=document.querySelector('[data-action="pass-apply"]');
        if(pass) pass.disabled=true;
        const submit=document.querySelector('[data-action="submit-apply"]');
        if(submit&&!state.study.applySubmitting) submit.textContent="检查句子";
        if(submit) submit.disabled=!value.trim()||Boolean(state.study.applySubmitting);
        state.study.feedback=null;
        document.querySelector('.ai-feedback-panel')?.remove();
      };
      applyText.addEventListener("input",syncApplyUi);
      applyText.addEventListener("keydown",e=>{
        if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){
          e.preventDefault();
          syncApplyUi();
          document.querySelector('[data-action="submit-apply"]')?.click();
        }
      });
    }


    const visualNote=document.getElementById("visual-note");
    if(visualNote){
      visualNote.addEventListener("input",e=>{
        if(!state.study)return;
        state.study.visualNote=String(e.target.value||"");
        state.study.visualSceneDirty=true;
      });
    }

    const visualFile=document.getElementById("visual-file");
    if(visualFile) visualFile.addEventListener("change",e=>{
      const file=e.target.files?.[0];if(!file)return;
      if(file.size>900*1024){showNotice("图片太大","请选择小于 900KB 的 PNG、JPG 或 WebP 图片。","warn");return;}
      const cardId=state.study?.cardId;
      if(!cardId)return;
      const reader=new FileReader();
      reader.onload=async()=>{
        try{
          const payload=await api("/api/images/local",{method:"POST",body:{dataUrl:String(reader.result||"")}});
          const c=getCard(cardId);
          if(!c)return;
          c.imageData="";
          c.imageUrl=payload.image.url;
          c.generatedVisualScene="";
          c.imageGeneration={status:"success",message:"已使用本地上传图片。",code:"LOCAL_UPLOAD",finishedAt:new Date().toISOString()};
          c.updatedAt=new Date().toISOString();
          saveData();
          if(state.study?.cardId===cardId) render();
        }catch(err){
          if(state.study?.cardId===cardId) showErrorNotice(err,"图片没有保存成功");
        }
      };
      reader.readAsDataURL(file);
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
      const now=new Date().toISOString();
      const card={id:uid(),word:r.word,phonetic:r.phonetic,audioUrl:r.audioUrl||"",audioUrls:Array.isArray(r.audioUrls)?r.audioUrls:[],pronunciationSource:r.pronunciationSource||"",pos:s.pos,meaningZh:s.meaningZh,exampleEn:s.exampleEn,exampleZh:s.exampleZh||"",exampleTranslationPending:!s.exampleZh?.trim(),senseIntentEn:s.senseIntentEn||"",avoidVisualEn:Array.isArray(s.avoidVisualEn)?s.avoidVisualEn:[],sourceQuery:r.sourceQuery||state.lookup?.query||r.word,stage:"select",createdAt:now,updatedAt:now,reviewCount:0,nextReviewAt:null,memoryHistory:[],visualNote:"",imageData:null,userSentence:""};
      state.data.cards.unshift(card);recordActivity("card-created",card.id);saveData();toast("卡片已保存，已进入学习流程");state.lookup=null;state.selectedSenseId=null;state.route="home";render();return;
    }
    if(action==="continue-learning"){
      if(window.LexiFlowStudySessionV3?.open){window.LexiFlowStudySessionV3.open();return;}
      showNotice("学习会话还没有准备好","Today Plan 会决定下一张学习卡。请稍后重试，不会自动打开旧队列。","warn");
      return;
    }
    if(action==="complete-stage"){
      const c=getCard(state.study.cardId);advanceStage(c,el.dataset.next);return;
    }
    if(action==="reveal"){state.study.revealed=true;render();return;}
    if(action==="memory-rate"){
      const c=getCard(state.study.cardId), remembered=el.dataset.remembered==="1";
      if(c.stage==="memorize1") advanceStage(c,"memorize2",{remembered});
      else advanceStage(c,"visualize",{remembered});
      return;
    }
    if(action==="toggle-visual-scene"){
      const current=document.getElementById("visual-note")?.value;
      if(current!==undefined) state.study.visualNote=current;
      state.visualSceneExpanded=!state.visualSceneExpanded;
      render();
      return;
    }

    if(action==="generate-visual"){
    if(!state.study||state.study.imageGenerating)return;
    const cardId=state.study.cardId;
    const c=getCard(cardId);
    if(!c)return;

    const note=String(document.getElementById("visual-note")?.value??state.study.visualNote??c.visualSceneSuggestion?.scene??"").trim();
    if(!note){
      showNotice("还没有联想场景","等 AI 场景生成后再试，或者直接写一个你想看到的画面。","warn");
      return;
    }
    state.study.visualNote=note;
    state.study.visualSceneDirty=false;
    state.study.imageGenerating=true;
    c.visualNote=note;
    c.imageGeneration={status:"generating",phase:"preparing",message:"正在准备生成任务。",code:"",startedAt:new Date().toISOString()};
    c.updatedAt=new Date().toISOString();
    saveData();
    render();
    startVisualProgress(cardId);

    try{
      const payload=await api("/api/ai/image",{
        method:"POST",
        body:{word:c.word,meaningZh:c.meaningZh,exampleEn:c.exampleEn,visualNote:note,suggestedScene:"",sourceQuery:c.sourceQuery||c.word,senseIntentEn:c.senseIntentEn||"",avoidVisualEn:c.avoidVisualEn||[]}
      });
      c.imageUrl=payload.image.url;
      c.imageData="";
      c.generatedVisualScene=String(payload.image.visualNote||note||"").trim();
      c.imageGeneration={status:"success",phase:"done",message:"联想图已生成。",code:"",startedAt:c.imageGeneration?.startedAt||"",finishedAt:new Date().toISOString()};
      c.updatedAt=new Date().toISOString();
      saveData();
      if(state.libraryEditor?.cardId===cardId){
        state.libraryEditor.imageGenerating=false;
        state.libraryEditor.draft=libraryEditorBaseDraft(c);
        render();
      }
      if(state.study?.cardId===cardId&&c.stage==="visualize") toast("联想图已生成");
    }catch(err){
      const user=err?.userError||err?.payload?.userError;
      c.imageGeneration={status:"error",phase:"error",message:user?.message||"这次没有生成成功。可以重试或上传自己的图片。",code:err.code||"IMAGE_GENERATION_FAILED",startedAt:c.imageGeneration?.startedAt||"",finishedAt:new Date().toISOString()};
      c.updatedAt=new Date().toISOString();
      saveData();
      if(state.libraryEditor?.cardId===cardId){
        state.libraryEditor.imageGenerating=false;
        state.libraryEditor.draft=libraryEditorBaseDraft(c);
        render();
      }
      if(state.study?.cardId===cardId&&c.stage==="visualize") toast("图片没有生成成功");
    }finally{
      stopVisualProgress(cardId);
      if(state.study?.cardId===cardId){
        state.study.imageGenerating=false;
        if(c.stage==="visualize") render();
      }
    }
    return;
  }
  if(action==="finish-visual"){
    const c=getCard(state.study.cardId);
    const note=String(document.getElementById("visual-note")?.value??state.study.visualNote??"").trim();
    c.visualNote=note;
    c.visualSkipped=false;
    advanceStage(c,"apply");return;
  }
  if(action==="submit-apply"){
      if(!state.study||state.study.applySubmitting)return;
      const cardId=state.study.cardId;
      const sentence=String(document.getElementById("apply-text")?.value??state.study.applyText??"").trim();
      const c=getCard(cardId);
      if(!c)return;
      state.study.applyText=sentence;
      state.study.applyApproved=false;
      state.study.applyLastCheckedText="";
      state.study.applyReviewedText="";
      state.study.applyDetectedLanguage=containsChinese(sentence)?"zh":"en";
      if(!sentence){render();return;}
      state.study.applySubmitting=true;
      state.study.feedback=null;
      render();
      try{
        const payload=await api("/api/ai/text",{method:"POST",body:{word:c.word,meaningZh:c.meaningZh,sentence}});
        if(state.study?.cardId!==cardId)return;
        const fb=payload.feedback||{};
        const suggested=String(fb.suggestion||"").trim();
        const inputLanguage=fb.inputLanguage==="zh"?"zh":state.study.applyDetectedLanguage;
        const keyword=String(fb.keyword||c.word||"").trim()||c.word;
        const candidate=suggested||sentence;
        const keywordOk=textContainsKeyword(candidate,keyword)||sentenceUsesTargetWord(candidate,c.word);
        const candidateApproved=fb.approved!==false&&fb.level==="good"&&keywordOk&&!(inputLanguage==="zh"&&!suggested);
        const originalApproved=inputLanguage==="en"&&!suggested&&candidateApproved;
        state.study.applyApproved=originalApproved;
        state.study.applyLastCheckedText=originalApproved?sentence:"";
        state.study.applyReviewedText=sentence;
        state.study.feedback={level:candidateApproved?"good":"warn",title:inputLanguage==="zh"?(candidateApproved?"意思保留了，英文也自然":"这句话还需要调整"):suggested?(candidateApproved?"可以这样说得更自然":"这句话还需要调整"):(originalApproved?"表达自然，可以直接使用":String(fb.title||"这句话还需要调整")),tips:[...(Array.isArray(fb.tips)?fb.tips:[]),...(!keywordOk?[`需要自然使用 “${c.word}” 或它的常见词形。`]:[])].slice(0,2),suggestion:suggested,suggestionApproved:Boolean(suggested&&candidateApproved),keyword,inputLanguage};
      }catch(err){
        if(state.study?.cardId!==cardId)return;
        state.study.applyApproved=false;
        state.study.applyLastCheckedText="";
        state.study.feedback={level:"warn",title:"AI 暂时没有完成检查",tips:["你的句子还在，可以直接再试一次。"],suggestion:"",suggestionApproved:false,keyword:c.word,inputLanguage:state.study.applyDetectedLanguage};
      }finally{
        if(state.study?.cardId===cardId){state.study.applySubmitting=false;render();}
      }
      return;
    }
    if(action==="adopt-ai-sentence"){
      if(!state.study)return;
      const c=getCard(state.study.cardId);
      const fb=state.study.feedback||{};
      const suggestion=String(fb.suggestion||"").trim();
      if(!c||!suggestion||!fb.suggestionApproved)return;
      const current=String(document.getElementById("apply-text")?.value??state.study.applyText??"").trim();
      if(current&&!state.study.originalApplyText)state.study.originalApplyText=current;
      const keyword=String(fb.keyword||c.word||"").trim()||c.word;
      const keywordOk=textContainsKeyword(suggestion,keyword)||sentenceUsesTargetWord(suggestion,c.word);
      state.study.applyText=suggestion;
      state.study.applyApproved=keywordOk;
      state.study.applyLastCheckedText=keywordOk?suggestion:"";
      state.study.applyReviewedText=suggestion;
      state.study.feedback={...fb,title:"已采用修改建议",tips:[],suggestion:"",suggestionApproved:false,level:keywordOk?"good":"warn"};
      render();
      setTimeout(()=>document.getElementById("apply-text")?.focus(),0);
      return;
    }
    if(action==="edit-apply"){document.getElementById("apply-text")?.focus();return;}
    if(action==="refresh-visual-scene"){const c=state.study&&getCard(state.study.cardId);if(c){const edited=document.getElementById("visual-note")?.value;if(edited!==undefined)state.study.visualNote=edited;state.study.visualSceneDirty=false;void ensureVisualSceneSuggestion(c,true);}return;}
    if(action==="refresh-practice-prompt"){const c=state.study&&getCard(state.study.cardId);if(c)void ensurePracticePrompt(c,true);return;}
    if(action==="restore-original-apply"){
      const original=String(state.study?.originalApplyText||"");
      if(!original)return;
      state.study.applyText=original;
      state.study.originalApplyText="";
      state.study.applyApproved=false;
      state.study.applyLastCheckedText="";
      state.study.applyReviewedText="";
      state.study.feedback=null;
      render();
      setTimeout(()=>document.getElementById("apply-text")?.focus(),0);
      return;
    }

    if(action==="pass-apply"){
      const c=getCard(state.study.cardId);
      const latest=String(document.getElementById("apply-text")?.value??state.study.applyText??"").trim();
      const reviewed=Boolean(state.study.feedback && state.study.applyReviewedText===latest);

      if(!latest){toast("请先写一句话");return;}
      if(!reviewed){
        showNotice("请先检查句子","先让 AI 给出一次反馈，再决定采用建议、继续修改，或保留原句进入下一步。","warn");
        return;
      }

      state.study.applyText=latest;
      c.userSentence=latest;
      c.updatedAt=new Date().toISOString();
      saveData();
      enterInitialReview(c);
      return;
    }
    if(action==="initial-review-reveal"){
      if(state.study) state.study.revealed=true;
      render();
      return;
    }
    if(action==="initial-review-rate"){
      const c=state.study?.cardId?getCard(state.study.cardId):null;
      if(c&&c.initialReviewPending) finishInitialReview(c,el.dataset.quality);
      return;
    }
    if(action==="start-review"){startReview();return;}
    if(action==="review-reveal"){state.study={...(state.study||{}),revealed:true};render();return;}
    if(action==="review-rate"){
      const c=getCard(state.reviewQueue[state.reviewIndex]);rateReview(c,el.dataset.quality);return;
    }
    if(action==="refresh-provider"){refreshProviderStatus(false);return;}
    if(action==="save-dictionary-key"){
      const key=document.getElementById("mw-api-key")?.value.trim()||"";
      if(!key){toast("请输入 Learner's Dictionary API Key");return;}
      try{
        await api("/api/settings/dictionary",{method:"POST",body:{apiKey:key}});
        toast("词典 Key 已保存");
        await refreshProviderStatus(true);
      }catch(err){showErrorNotice(err,"保存没有完成");}
      return;
    }
    if(action==="test-dictionary"){
      try{
        const payload=await api("/api/dictionary/test",{method:"POST",body:{}});
        toast(payload.message||"词典 Key 可用");
      }catch(err){showErrorNotice(err,"词典连接没有成功");}
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
        showErrorNotice(err,"AI 配置保存失败");
      }
      return;
    }
    if(action==="test-codex-text"){
      toast("正在检查 AI 连接…");
      try{
        const payload=await api("/api/ai/test",{method:"POST",body:{}});
        toast(payload.test?.message||"AI 连接正常");
      }catch(err){
        showErrorNotice(err,"AI 连接检查失败");
      }finally{
        await refreshProviderStatus(true);
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
      const body=JSON.stringify({data:state.data});
      navigator.sendBeacon("/api/learning-data",new Blob([body],{type:"application/json"}));
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
    }catch(err){
      state.providerStatus={ok:false,serviceUnavailable:true,error:err.message};
      showErrorNotice(err,"LexiFlow 暂时无法启动");
      render();
    }
  }

  initializeApp();
})();
