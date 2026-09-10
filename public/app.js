
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
    lookupStatus: "idle",
    providerStatus: null,
    loadingMoreSenses: false,
    pronunciationHydration: {},
    notice: null,
    searchResolution: null,
    visualSceneExpanded: false
  };

  function defaultData(){
    return {
      version: APP_VERSION,
      cards: [],
      activities: [],
      settings: { dailyGoal: 5 },
      createdAt: new Date().toISOString()
    };
  }

  function normalizeLearningData(parsed){
    return { ...defaultData(), ...(parsed||{}), settings:{dailyGoal:5,...(parsed?.settings||{})} };
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
    if(!card || card.phonetic || state.pronunciationHydration[card.id]) return;
    state.pronunciationHydration[card.id]="loading";
    try{
      const payload=await api("/api/dictionary/pronunciation",{method:"POST",body:{word:card.word}});
      const phonetic=String(payload.result?.phonetic||"").trim();
      const audioUrl=String(payload.result?.audioUrl||"").trim();
      if(phonetic) card.phonetic=phonetic;
      if(audioUrl && !card.audioUrl) card.audioUrl=audioUrl;
      if(phonetic || audioUrl){card.updatedAt=new Date().toISOString();saveData();}
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
    return `<button class="nav-btn ${state.route===route?"active":""}" data-route="${route}">
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
      header("","今日学习","先学少量高质量单词，再用主动回忆和复习巩固。",`<button class="btn" data-route="add">＋ 添加单词</button>`)
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
      : `<button class="btn small" data-route="settings">配置词典</button>`;
    const shouldShowResult=state.lookupStatus==="loading"||Boolean(state.lookup?.result);
    return shell(
      header("","选词制卡","输入英文或中文，LexiFlow 会自动识别、纠错并整理成适合学习的单词卡。",badge)
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
    const resolvedNote = r.sourceQuery && (r.autoResolved || r.autoCorrectedFrom || r.normalizedQuery)
      ? `<div class="auto-resolved-note"><span>已自动识别</span><strong>${escapeHtml(r.sourceQuery)} → ${escapeHtml(r.word)}</strong>${r.normalizedQuery && r.normalizedQuery!==r.sourceQuery?`<small>识别为“${escapeHtml(r.normalizedQuery)}”</small>`:""}</div>`
      : "";

    const primaryView=primarySense?`
      <div class="primary-sense-card">
        <div class="primary-sense-meta"><span class="pill blue">${escapeHtml(primarySense.pos||"word")}</span><span>核心学习词义</span></div>
        <div class="primary-meaning">${escapeHtml(primarySense.meaningZh||"请手动编辑")}</div>
        <div class="example-pair">
          <div class="example-label">例句</div>
          <div class="example-en">${escapeHtml(primarySense.exampleEn||"暂无例句，请手动编辑")}</div>
          <div class="example-zh">${escapeHtml(primarySense.exampleZh||"暂无翻译，请手动编辑")}</div>
        </div>
      </div>`:"";

    const expandedView=r.mode==="expanded"?`
      <div class="expanded-senses-head"><strong>其它常用词义</strong><span>一个中文学习词义对应一张卡片</span></div>
      <div class="sense-list">${senses.map(s=>`<button class="sense ${s.id===state.selectedSenseId?"selected":""}" data-sense-id="${s.id}">
        <div class="sense-head"><span class="pill blue">${escapeHtml(s.pos)}</span>${s.id===state.selectedSenseId?`<span class="sense-selected-mark">✓</span>`:""}</div>
        <div class="sense-meaning">${escapeHtml(s.meaningZh||"请手动编辑")}</div>
        <div class="sense-example">${escapeHtml(s.exampleEn||"暂无例句")}</div>
        <div class="sense-example-zh">${escapeHtml(s.exampleZh||"")}</div>
      </button>`).join("")}</div>`:"";

    return `${resolvedNote}
      <div class="word-top learning-card-wordtop">
        <div><div class="word-line"><h2>${escapeHtml(r.word)}</h2><button class="speaker" data-action="speak" data-word="${escapeHtml(r.word)}" data-audio="${escapeHtml(r.audioUrl||"")}" title="播放美式发音">🔊</button></div><div class="phonetic">${escapeHtml(formatPhonetic(r.phonetic||""))}</div></div>
        <div class="result-meta">${r.cacheHit?`<span class="pill green">⚡ 快速结果</span>`:""}</div>
      </div>
      ${r.aiEnriched===false?`<div class="feedback warn"><h4>中文释义暂未整理完成</h4><ul><li>英文词典结果已经找到，你可以稍后重试，或直接手动补充中文释义与例句。</li></ul></div>`:""}
      ${r.translationNeedsReview?`<div class="feedback warn"><h4>建议检查中文释义</h4><ul><li>当前释义置信度较低，保存前建议快速确认或手动编辑。</li></ul></div>`:""}
      ${r.mode==="expanded"?expandedView:primaryView}
      ${state.addDraft?renderSenseEditor(state.addDraft):""}
      <div class="action-row learning-card-actions">
        <div class="left-actions">
          ${r.hasMore && r.mode!=="expanded"?`<button class="btn" data-action="load-more-senses" ${state.loadingMoreSenses?"disabled":""}>${state.loadingMoreSenses?"加载中…":"查看其它常用词义"}</button>`:""}
          <button class="btn ghost" data-action="edit-sense">手动编辑</button>
          <button class="btn ghost" data-action="lookup-again">重新查询</button>
        </div>
        <button class="btn primary save-learning-card" data-action="save-card">保存并开始学习</button>
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

  function speak(word,audioUrl=""){
    if(audioUrl){
      const audio=new Audio(audioUrl);
      audio.play().catch(()=>speak(word,""));
      return;
    }
    if(!("speechSynthesis" in window)){ toast("当前设备无法播放发音"); return; }
    const u=new SpeechSynthesisUtterance(word); u.lang="en-US";u.rate=.88;
    const vs=speechSynthesis.getVoices();
    u.voice=vs.find(v=>v.lang.toLowerCase()==="en-us")||vs.find(v=>v.lang.toLowerCase().startsWith("en"))||null;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }

  function startStudy(cardId){
    const card=cardId?getCard(cardId):activeLearningCards()[0];
    if(!card){toast("当前没有首次学习任务");state.route="home";render();return;}
    state.study={
      cardId:card.id,
      revealed:false,
      feedback:null,
      applyText:card.userSentence||"",
      originalApplyText:"",
      aiSuggestionApplied:false,
      visualNote:card.visualNote||""
    };
    state.route="study";
    state.visualSceneExpanded=Boolean(card.visualNote);
    render();
    void ensureCardPronunciation(card);
  }

  function studyPage(){
    const s=state.study, card=s&&getCard(s.cardId);
    if(card && !card.phonetic && !state.pronunciationHydration[card.id]){setTimeout(()=>void ensureCardPronunciation(card),0);}
    if(!card) return shell(header("","学习会话","当前没有可执行学习任务。")+`<div class="card empty"><div class="empty-icon">✓</div><strong>暂无学习任务</strong><span>返回今日学习或添加新词。</span></div>`);
    return shell(
      header(
        "",
        "学习会话",
        `正在学习：${escapeHtml(card.word)} · ${escapeHtml(formatPhonetic(card.phonetic))}`,
        `<button class="btn" data-route="home">退出会话</button>`
      )
      + `<div class="study-shell"><div class="card study-card">${renderStage(card)}</div><aside class="card stage-rail"><div class="section-title"><div><h2>首次学习流程</h2><p></p></div></div><div class="stages">${renderStageRail(card)}</div></aside></div>`
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
    return STAGES.map(([k,label],i)=>`<div class="stage-step ${i<idx?"done":i===idx?"active":""}"><span class="stage-dot">${i<idx?"✓":i+1}</span><span>${label}</span></div>`).join("");
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
        <div class="answer-box"><strong>${escapeHtml(card.meaningZh)}</strong><p>${escapeHtml(card.exampleEn)}</p><p>${escapeHtml(card.exampleZh)}</p></div>
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
              <div class="memory-example-en">${escapeHtml(card.exampleEn)}</div>
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
              <div class="memory-example-en">${escapeHtml(card.exampleEn)}</div>
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

  function stageVisual(card){
    const currentScene=String(state.study.visualNote||"").trim();
    const generation=card.imageGeneration||{status:"idle",message:"",code:"",startedAt:""};
    const customOpen=Boolean(state.visualSceneExpanded||currentScene);

    return `${stageKicker("视觉联想")}
      <div class="study-center visualize-stage" style="align-items:stretch;text-align:left">
        <div class="visual-context-line">
          <span>当前词义</span>
          <strong>${escapeHtml(card.meaningZh)}</strong>
        </div>

        <div class="auto-visual-card ${customOpen?"compact":""}">
          <div class="auto-visual-icon">✦</div>
          <div class="auto-visual-copy">
            <strong>直接生成记忆画面</strong>
            <p>不需要填写任何场景。系统会根据当前词义和例句自动设计一张容易记住的画面；只有你想指定人物、地点或动作时，才需要展开自定义场景。</p>
          </div>
          <button class="btn primary" data-action="generate-visual" ${state.study.imageGenerating?"disabled":""}>
            ${state.study.imageGenerating?"正在生成…":"直接生成"}
          </button>
        </div>

        <button class="visual-custom-toggle" data-action="toggle-visual-scene">
          <span>${customOpen?"收起自定义场景":"我想自己描述场景"}</span><b>${customOpen?"−":"＋"}</b>
        </button>

        ${customOpen?`<div class="visual-custom-panel">
          <div class="field">
            <label>描述你希望看到的画面（可选）</label>
            <textarea class="textarea visual-scene-input" id="visual-note" placeholder="例如：一双手正在电脑桌前使用机械键盘，屏幕在背景中">${escapeHtml(state.study.visualNote||"")}</textarea>
            <div class="visual-scene-help"></div>
          </div>
          <button class="btn" data-action="generate-visual" ${state.study.imageGenerating?"disabled":""}>按我的描述生成</button>
        </div>`:""}

        ${generation.status!=="idle"?`
          <div class="image-generation-state ${escapeHtml(generation.status)}">
            <div class="image-generation-state-head">
              <strong>${generation.status==="generating"?"正在生成联想图":generation.status==="success"?"联想图已生成":"这次没有生成成功"}</strong>
              <span>${generation.status==="generating"?"可以稍等片刻":generation.status==="error"&&generation.code==="TIMEOUT"?"等待时间较长":""}</span>
            </div>
            <div class="image-generation-message">${escapeHtml(generation.message||"")}</div>
            ${generation.status==="error"?`<div class="image-generation-actions"><button class="btn primary" data-action="generate-visual">再试一次</button><span>也可以上传本地图或直接跳过。</span></div>`:""}
          </div>`:""}

        <div class="upload-zone visual-upload-zone">
          <div class="visual-upload-copy"><strong>已有记忆图片？</strong></div>
          <label class="file-picker-button">选择图片<input id="visual-file" type="file" accept="image/png,image/jpeg,image/webp" /></label>
        </div>

        ${(card.imageData||card.imageUrl)?`<div class="visual-preview"><img src="${card.imageData||card.imageUrl}" alt="${escapeHtml(card.word)} 的视觉联想图片" /></div>`:""}

        <div class="rating-row visual-actions">
          <button class="btn" data-action="skip-visual">暂时跳过</button>
          <button class="btn primary" data-action="finish-visual">完成视觉联想</button>
        </div>
      </div>`;
  }

  function stageInitialReview(card){
    return `${stageKicker("首次复习 · 主动回忆")}
      <div class="study-center">
        ${wordIdentity(card,{size:"hero",showPos:true,center:true})}
        <div class="prompt-small">先回忆中文释义，再查看答案。完成这一步后才会真正进入后续复习计划。</div>
        ${state.study?.revealed?`
          <div class="memory-answer-card">
            <div class="memory-answer-meaning">${escapeHtml(card.meaningZh)}</div>
            <div class="memory-example-section compact-example">
              <div class="memory-example-label">例句</div>
              <div class="memory-example-en">${escapeHtml(card.exampleEn)}</div>
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
    const suggested=String(fb?.suggestedSentence||"").trim();
    const applied=Boolean(state.study.aiSuggestionApplied);
    const canRestore=Boolean(state.study.originalApplyText && state.study.originalApplyText!==state.study.applyText);

    return `${stageKicker("造句应用")}
      <div class="study-center" style="align-items:stretch;text-align:left">
        <div class="apply-target-word">
          ${wordIdentity(card,{size:"medium",showPos:true,center:true})}
        </div>
        <div class="field">
          <label>请用目标词写一个与你自己相关的句子</label>
          <textarea class="textarea" id="apply-text" placeholder="写一个真实、完整的英文句子">${escapeHtml(state.study.applyText||"")}</textarea>
        </div>

        ${applied?`
          <div class="apply-status success">
            ✓ 已应用 AI 建议。请检查最终句子；满意后可以直接确认通过。
          </div>
          <div class="apply-after-ai-actions">
            ${canRestore?`<button class="btn" data-action="restore-original-apply">恢复原句</button>`:""}
            <button class="btn" data-action="revise-apply">继续修改</button>
            <button class="btn primary" data-action="pass-apply">确认通过，进入首次复习</button>
          </div>
        `:`
          <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:11px">
            ${canRestore?`<button class="btn" data-action="restore-original-apply">恢复原句</button>`:""}
            <button class="btn primary" data-action="submit-apply" ${state.study.applySubmitting?"disabled":""}>${state.study.applySubmitting?"正在获取建议…":"获取 AI 建议"}</button>
          </div>
        `}

        ${fb && !applied?`<div class="feedback ${fb.level}">
          <h4>${escapeHtml(fb.title)}</h4>
          <ul>${(fb.tips||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>
          ${suggested?`
            <div class="ai-suggestion-box">
              <div class="ai-suggestion-label">AI 建议句</div>
              <div class="ai-suggestion-text">${escapeHtml(suggested)}</div>
              <button class="btn primary full" data-action="apply-ai-suggestion">一键应用 AI 建议</button>
            </div>
          `:""}
        </div>

        <div class="rating-row">
          <button class="btn" data-action="revise-apply">继续修改</button>
          <button class="btn primary" data-action="pass-apply">确认通过，进入首次复习</button>
        </div>`:""}
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
      header("LEXIFLOW · REVIEW","复习中心","只显示已经到期的卡片；复习结果会决定下一次到期时间。",due.length?`<button class="btn primary" data-action="start-review">开始复习 (${due.length})</button>`:"")
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
      + `<div class="card study-card"><div class="study-kicker">主动回忆</div><div class="study-center">
        ${wordIdentity(card,{size:"hero",showPos:true,center:true})}<div class="prompt-small">先回忆中文释义，再查看答案。</div>
        ${state.study?.revealed?`<div class="answer-box"><strong>${escapeHtml(card.meaningZh)}</strong><p>${escapeHtml(card.exampleEn)}</p><p>${escapeHtml(card.exampleZh)}</p></div>
        <div class="rating-row"><button class="btn" data-action="review-rate" data-quality="again">没记住 · 明天再复习</button><button class="btn primary" data-action="review-rate" data-quality="good">记住了 · 3 天后复习</button></div>`
        :`<button class="btn primary" style="margin-top:22px" data-action="review-reveal">查看答案</button>`}
      </div></div>`
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
      header("","单词库","查看、搜索和管理已经保存的学习卡片。",`<button class="btn primary" data-route="add">＋ 添加单词</button>`)
      + `<div class="search-row"><input class="input" id="library-search" placeholder="搜索单词或中文释义" value="${escapeHtml(state.librarySearch)}" /><span class="pill">${list.length} 张卡片</span></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>单词</th><th>词性</th><th>中文释义</th><th>阶段</th><th>下次复习</th><th></th></tr></thead>
      <tbody>${list.length?list.map(c=>`<tr><td><strong>${escapeHtml(c.word)}</strong><div class="phonetic">${escapeHtml(formatPhonetic(c.phonetic||""))}</div></td><td><span class="pill blue">${escapeHtml(c.pos)}</span></td><td>${escapeHtml(c.meaningZh)}</td><td>${stageLabelOf(c.stage)}</td><td>${c.nextReviewAt?new Date(c.nextReviewAt).toLocaleDateString():"—"}</td><td><button class="btn small danger" data-delete-card="${c.id}">删除</button></td></tr>`).join(""):`<tr><td colspan="6"><div class="empty"><strong>没有匹配的单词</strong></div></td></tr>`}</tbody></table></div>`
    );
  }

  function statsPage(){
    const last7=[];
    for(let i=6;i>=0;i--){const d=addDays(new Date(),-i),key=todayKey(d);last7.push({key,label:`${d.getMonth()+1}/${d.getDate()}`,count:new Set(state.data.activities.filter(a=>todayKey(new Date(a.at))===key).map(a=>a.cardId)).size});}
    const max=Math.max(1,...last7.map(x=>x.count));
    const reviews=state.data.activities.filter(a=>a.type==="review").length;
    const remembered=state.data.activities.filter(a=>a.type==="review"&&a.quality==="good").length;
    return shell(
      header("","学习统计","只统计本地浏览器里的真实操作记录。")
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
        "词典与 AI 服务只需配置一次。",
        `<button class="btn" data-action="refresh-provider">刷新状态</button>`
      )
      + `<div class="settings-list">
        <div class="setting-row">
          <div>
            <h3>英语词典</h3>
            <p>提供英文词条、词性、例句、音标和美式发音。由 Merriam-Webster Learner's Dictionary 提供数据。当前：${dict?.configured?`已连接 ${escapeHtml(dict.maskedKey||"")}`:"未连接"}</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input class="input" id="mw-api-key" type="password" style="width:250px" placeholder="粘贴 Learner's Dictionary API Key" />
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
            <p>默认使用 GPT-5.6 Luna，中等思考强度。</p>
            <p></p>
          </div>
          <div class="codex-runtime-grid">
            <div class="field">
              <label>模型</label>
              <select class="select" id="codex-model-select">
                <option value="" ${selectedModel===""?"selected":""}>跟随 Codex 默认${codex?.model?` · ${escapeHtml(codex.model)}`:""}</option>
                ${(codex?.modelOptions||[]).map(model=>`<option value="${escapeHtml(model)}" ${selectedModel===model?"selected":""}>${escapeHtml(model)}</option>`).join("")}
                <option value="__custom__">自定义模型 ID…</option>
              </select>
              <input class="input" id="codex-model-custom" style="display:none;margin-top:7px" placeholder="输入自定义模型 ID" />
            </div>
            <div class="field">
              <label>思考强度</label>
              <select class="select" id="codex-effort">
                <option value="" ${selectedEffort===""?"selected":""}>跟随模型 / Codex 默认</option>
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

        <div class="setting-row"><div><h3>导出学习数据</h3><p>不会导出词典 Key 或 Codex 凭据。</p></div><button class="btn" data-action="export-data">导出 JSON</button></div>
        <div class="setting-row"><div><h3>导入学习数据</h3><p>从 LexiFlow 导出的 JSON 恢复学习数据。</p></div><label class="btn">选择 JSON<input id="import-file" type="file" accept="application/json" style="display:none"></label></div>
        <div class="setting-row"><div><h3>清空学习数据</h3><p>删除浏览器里的学习数据；不会删除 Codex 配置。</p></div><button class="btn danger" data-action="confirm-reset">清空数据</button></div>
      </div>`
    );
  }

  function renderModal(){
    if(state.modal==="reset") return `<div class="modal-backdrop"><div class="modal"><h2>确认清空全部数据？</h2><p>这会删除当前浏览器里的全部单词卡、学习进度和统计记录，而且无法撤销。</p><div class="modal-actions"><button class="btn" data-action="close-modal">取消</button><button class="btn danger" data-action="reset-data">确认清空</button></div></div></div>`;
    return "";
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
    else if(state.route==="stats") html=statsPage();
    else if(state.route==="settings") html=settingsPage();
    else html=homePage();
    app.innerHTML=html;
    bind();
  }

  function bind(){
    document.querySelectorAll("[data-route]").forEach(el=>el.addEventListener("click",()=>{
      state.route=el.dataset.route;
      if(state.route!=="study"&&state.route!=="review-session") state.study=null;
      render();
      if(state.route==="settings"||state.route==="add") refreshProviderStatus(true);
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
        const exactLocal=Boolean(saved&&(
          normalizeSearchText(saved.word)===qNormalized ||
          String(saved.meaningZh||"").split(/[；;、，,/]/).some(part=>normalizeSearchText(part)===qNormalized)
        ));
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

    document.querySelectorAll("[data-sense-id]").forEach(el=>el.addEventListener("click",()=>{
      state.selectedSenseId=el.dataset.senseId;state.addDraft=null;render();
    }));

    document.querySelectorAll("[data-suggestion]").forEach(el=>el.addEventListener("click",async ()=>{
      const q=el.dataset.suggestion;
      state.lookup={query:q,result:null};state.lookupStatus="loading";render();
      try{
        const payload=await api("/api/dictionary/lookup",{method:"POST",body:{word:q,mode:"primary"}});
        state.lookup={query:q,result:payload.result};state.selectedSenseId=payload.result?.senses?.[0]?.id||null;state.lookupStatus="idle";render();
      }catch(err){state.lookupStatus="idle";showErrorNotice(err,"暂时没有查到这个词");render();}
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

    const importFile=document.getElementById("import-file");
    if(importFile) importFile.addEventListener("change",async e=>{
      const file=e.target.files?.[0];if(!file)return;
      try{
        const parsed=JSON.parse(await file.text());
        if(!parsed||!Array.isArray(parsed.cards)||!Array.isArray(parsed.activities))throw new Error();
        state.data={...defaultData(),...parsed,settings:{dailyGoal:5,...(parsed.settings||{})}};
        saveData();toast("数据已导入");state.route="home";render();
      }catch{toast("导入失败：文件格式不正确");}
    });

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
    if(action==="clear-lookup"){state.lookup=null;state.lookupStatus="idle";state.loadingMoreSenses=false;state.selectedSenseId=null;state.addDraft=null;render();return;}
    if(action==="lookup-again"){state.lookup=null;state.lookupStatus="idle";state.loadingMoreSenses=false;state.selectedSenseId=null;state.addDraft=null;render();return;}
    if(action==="speak"){speak(el.dataset.word,el.dataset.audio||"");return;}
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
      if(!s.meaningZh?.trim()||!s.exampleEn?.trim()||!s.exampleZh?.trim()){state.addDraft=JSON.parse(JSON.stringify(s));toast("保存前请补全中文释义和中英文例句");render();return;}
      const exists=state.data.cards.find(c=>c.word.toLowerCase()===r.word.toLowerCase()&&c.meaningZh===s.meaningZh);
      if(exists){toast("这张义项卡已经存在");return;}
      const now=new Date().toISOString();
      const card={id:uid(),word:r.word,phonetic:r.phonetic,audioUrl:r.audioUrl||"",pos:s.pos,meaningZh:s.meaningZh,exampleEn:s.exampleEn,exampleZh:s.exampleZh,senseIntentEn:s.senseIntentEn||"",avoidVisualEn:Array.isArray(s.avoidVisualEn)?s.avoidVisualEn:[],sourceQuery:r.sourceQuery||state.lookup?.query||r.word,stage:"select",createdAt:now,updatedAt:now,reviewCount:0,nextReviewAt:null,memoryHistory:[],visualNote:"",imageData:null,userSentence:""};
      state.data.cards.unshift(card);recordActivity("card-created",card.id);saveData();toast("卡片已保存，已进入学习流程");state.lookup=null;state.selectedSenseId=null;state.route="home";render();return;
    }
    if(action==="continue-learning"){startStudy();return;}
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

      const note=document.getElementById("visual-note")?.value.trim()??String(state.study.visualNote||"").trim();
      state.study.visualNote=note;
      state.study.imageGenerating=true;
      c.visualNote=note;
      c.imageGeneration={status:"generating",message:"正在生成联想图，这一步可能需要一些时间。",code:"",startedAt:new Date().toISOString()};
      c.updatedAt=new Date().toISOString();
      saveData();
      render();

      try{
        const payload=await api("/api/ai/image",{
          method:"POST",
          body:{word:c.word,meaningZh:c.meaningZh,exampleEn:c.exampleEn,visualNote:note,sourceQuery:c.sourceQuery||c.word,senseIntentEn:c.senseIntentEn||"",avoidVisualEn:c.avoidVisualEn||[]}
        });
        c.imageUrl=payload.image.url;
        c.imageData="";
        c.generatedVisualScene=String(payload.image.visualNote||note||"").trim();
        c.imageGeneration={status:"success",message:note?"已按你提供的场景描述生成图片。":"已根据当前词义生成图片。",code:"",startedAt:c.imageGeneration?.startedAt||"",finishedAt:new Date().toISOString()};
        c.updatedAt=new Date().toISOString();
        saveData();
        if(state.study?.cardId===cardId) toast("联想图生成成功");
      }catch(err){
        const user=err?.userError||err?.payload?.userError;
        c.imageGeneration={status:"error",message:user?.message||"这次没有生成成功。你可以重试、上传本地图或暂时跳过。",code:err.code||"IMAGE_GENERATION_FAILED",startedAt:c.imageGeneration?.startedAt||"",finishedAt:new Date().toISOString()};
        c.updatedAt=new Date().toISOString();
        saveData();
        if(state.study?.cardId===cardId) toast("图片没有生成成功，处理建议已保留在页面");
      }finally{
        if(state.study?.cardId===cardId){
          state.study.imageGenerating=false;
          render();
        }
      }
      return;
    }
    if(action==="skip-visual"||action==="finish-visual"){
      const c=getCard(state.study.cardId);
      const note=document.getElementById("visual-note")?.value.trim()??String(state.study.visualNote||"").trim();
      c.visualNote=note;
      if(action==="skip-visual") c.visualSkipped=true;
      else c.visualSkipped=false;
      advanceStage(c,"apply");return;
    }
    if(action==="submit-apply"){
      if(!state.study||state.study.applySubmitting)return;
      const cardId=state.study.cardId;
      const sentence=document.getElementById("apply-text")?.value||"";
      const c=getCard(cardId);
      if(!c)return;

      state.study.applyText=sentence;
      state.study.aiSuggestionApplied=false;
      if(sentence.trim() && !state.study.originalApplyText) state.study.originalApplyText=sentence;

      if(!sentence.trim()){
        state.study.feedback=localFeedback(sentence,c.word);
        render();
        return;
      }

      state.study.applySubmitting=true;
      state.study.feedback={level:"warn",title:"AI 正在分析…",tips:["正在整理这句话的用法建议。"],suggestedSentence:""};
      render();

      try{
        const payload=await api("/api/ai/text",{method:"POST",body:{word:c.word,meaningZh:c.meaningZh,sentence}});
        if(state.study?.cardId!==cardId)return;
        const fb=payload.feedback||{};
        state.study.feedback={
          level:fb.level||"warn",
          title:fb.title||"AI 反馈",
          tips:Array.isArray(fb.tips)?fb.tips:[],
          suggestedSentence:String(fb.suggestion||"").trim()
        };
      }catch(err){
        if(state.study?.cardId!==cardId)return;
        const fallback=localFeedback(sentence,c.word);
        state.study.feedback={...fallback,title:"AI 暂时没有返回，已完成基础检查",suggestedSentence:""};
      }finally{
        if(state.study?.cardId===cardId){
          state.study.applySubmitting=false;
          render();
        }
      }
      return;
    }
    if(action==="apply-ai-suggestion"){
      const suggested=String(state.study.feedback?.suggestedSentence||"").trim();
      if(!suggested){
        toast("当前没有可应用的 AI 建议句");
        return;
      }

      const current=document.getElementById("apply-text")?.value ?? state.study.applyText ?? "";
      if(current.trim() && !state.study.originalApplyText){
        state.study.originalApplyText=current;
      }

      state.study.applyText=suggested;
      state.study.aiSuggestionApplied=true;
      state.study.feedback=null;
      toast("已应用 AI 建议，你可以继续修改或重新获取反馈");
      render();

      // Put focus back into the sentence editor for a natural editing loop.
      setTimeout(()=>{
        const textarea=document.getElementById("apply-text");
        if(textarea){
          textarea.focus();
          const end=textarea.value.length;
          textarea.setSelectionRange(end,end);
        }
      },0);
      return;
    }

    if(action==="restore-original-apply"){
      const original=String(state.study.originalApplyText||"");
      if(!original){
        toast("没有可恢复的原句");
        return;
      }
      state.study.applyText=original;
      state.study.aiSuggestionApplied=false;
      state.study.feedback=null;
      toast("已恢复原句");
      render();

      setTimeout(()=>{
        const textarea=document.getElementById("apply-text");
        if(textarea){
          textarea.focus();
          const end=textarea.value.length;
          textarea.setSelectionRange(end,end);
        }
      },0);
      return;
    }

    if(action==="revise-apply"){
      const current=document.getElementById("apply-text")?.value;
      if(current!==undefined) state.study.applyText=current;
      state.study.feedback=null;
      state.study.aiSuggestionApplied=false;
      render();
      setTimeout(()=>{
        const textarea=document.getElementById("apply-text");
        if(textarea){
          textarea.focus();
          const end=textarea.value.length;
          textarea.setSelectionRange(end,end);
        }
      },0);
      return;
    }
    if(action==="pass-apply"){
      const c=getCard(state.study.cardId);
      const latest=document.getElementById("apply-text")?.value ?? state.study.applyText ?? "";
      const text=String(latest).trim();

      if(!text){
        toast("请先写一个句子");
        return;
      }

      state.study.applyText=text;
      c.userSentence=text;
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
    if(action==="export-data"){
      const blob=new Blob([JSON.stringify(state.data,null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`lexiflow-data-${todayKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);return;
    }
    if(action==="confirm-reset"){state.modal="reset";render();return;}
    if(action==="close-modal"){state.modal=null;render();return;}
    if(action==="reset-data"){state.data=defaultData();saveData();state.modal=null;state.route="home";toast("本地数据已清空");render();return;}
  }

  async function initializeApp(){
    try{
      if(location.protocol === "file:"){
        await api("/api/health");
        location.replace("http://127.0.0.1:4177/");
        return;
      }
      await hydrateLearningData();
      render();
      await refreshProviderStatus(true);
    }catch(err){
      state.providerStatus={ok:false,serviceUnavailable:true,error:err.message};
      showErrorNotice(err,"LexiFlow 暂时无法启动");
      render();
    }
  }

  initializeApp();
})();
