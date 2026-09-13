from pathlib import Path
import json
import re

ROOT=Path(__file__).resolve().parents[1]

def read(path): return (ROOT/path).read_text(encoding='utf-8')
def write(path,text): (ROOT/path).write_text(text,encoding='utf-8')

def replace_top_function(text,name,new_code):
    marker=f'  function {name}('
    start=text.find(marker)
    if start<0: raise SystemExit(f'{name}: function start not found')
    next_pos=text.find('\n  function ',start+len(marker))
    if next_pos<0: raise SystemExit(f'{name}: next top-level function not found')
    return text[:start]+new_code.rstrip()+text[next_pos:]

def replace_once(text,old,new,label):
    count=text.count(old)
    if count!=1: raise SystemExit(f'{label}: expected 1 match, got {count}')
    return text.replace(old,new,1)

# ---------------------------------------------------------------------
# app.js: auto connection verification, cleaner Settings, actionable stats,
# and user-facing language only.
# ---------------------------------------------------------------------
app=read(Path('public/app.js'))

stats_fn=r'''  function statsPage(){
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
    const mastered=cards.filter(card=>card.memoryState==="stable").length;
    const applied=cards.filter(card=>card.memoryState==="stable"||card.stage==="review"||String(card.userSentence||"").trim()).length;

    const stageRows=[
      {key:"inbox",label:"待选入学习",count:cards.filter(card=>card.inboxPending).length},
      {key:"select",label:"确认词义",count:cards.filter(card=>!card.inboxPending&&card.stage==="select").length},
      {key:"memorize",label:"主动记忆",count:cards.filter(card=>card.stage==="memorize").length},
      {key:"visualize",label:"建立联想",count:cards.filter(card=>card.stage==="visualize").length},
      {key:"apply",label:"表达练习",count:cards.filter(card=>card.stage==="apply").length},
      {key:"review",label:"复习巩固",count:cards.filter(card=>card.stage==="review"&&card.memoryState!=="stable").length},
      {key:"stable",label:"已掌握",count:mastered},
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
        <div class="card stat"><div class="stat-label">已掌握</div><div class="stat-value">${mastered}</div><div class="stat-hint">进入长期巩固</div></div>
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
  }'''
app=replace_top_function(app,'statsPage',stats_fn)

settings_fn=r'''  function settingsPage(){
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
  }'''
app=replace_top_function(app,'settingsPage',settings_fn)

# Connection verification runs automatically after the main surface is available.
if 'async function verifyProviderConnectionsOnStartup' not in app:
    marker='''  async function ensureCardPronunciation(card){'''
    helper=r'''  let providerVerificationPromise=null;
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

'''
    app=replace_once(app,marker,helper+marker,'insert provider auto verification')

app=replace_once(app,'      await hydrateLearningData();\n      render();','      await hydrateLearningData();\n      render();\n      setTimeout(()=>{void verifyProviderConnectionsOnStartup();},0);','startup auto verification')

# After changing a provider configuration, immediately refresh the automatic connection state.
app=app.replace('toast("词典增强配置已保存");\n        await refreshProviderStatus(true);','toast("词典设置已保存");\n        await refreshProviderStatus(true);\n        void verifyProviderConnectionsOnStartup({force:true});')
app=app.replace('showErrorNotice(err,"AI 配置保存失败");','showErrorNotice(err,"AI 设置保存失败");')
# The handler remains available as a recovery action, but user-facing copy no longer calls it a test.
app=app.replace('state.providerChecks.dictionary={status:"checking",message:"正在验证在线词典…",at:""};','state.providerChecks.dictionary={status:"checking",at:""};')
app=app.replace('state.providerChecks.ai={status:"checking",message:"正在发起真实 AI 请求…",at:""};','state.providerChecks.ai={status:"checking",at:""};')

# Remove engineering vocabulary from Home / Review / fallback notices.
replacements={
  'Today Plan 已安排':'系统今天已安排',
  'Today Plan 安排了 ${review} 个复习词，完成后再进入新学习。':'今天安排了 ${review} 个复习词，完成后再继续新学习。',
  '按 Memorize → Visualize → Apply → Select 推进。':'按记忆 → 联想 → 应用 → 选词推进。',
  'Today Plan 会决定下一张学习卡。请稍后重试，不会自动打开旧队列。':'系统会按今天的学习安排选择下一张卡片，请稍后重试。',
  'Today Plan 会决定本次 Review 队列。请稍后重试，不会自动退回旧复习算法。':'系统会按今天的复习安排打开内容，请稍后重试。',
}
for old,new in replacements.items(): app=app.replace(old,new)

# Replace the whole Review page to avoid leaking internal scheduling terms.
review_fn=r'''  function reviewPage(){
    const plan=currentDailyPlan();
    const due=planCards("review");
    const mastered=stableCount();
    const recent=Math.max(0,Number(plan?.reviewCriticalCount||0));
    const longTerm=Math.max(0,Number(plan?.reviewStableScheduledCount||0));
    return shell(
      header("","复习中心","系统会自动安排今天真正需要巩固的词。",due.length?`<button class="btn primary" data-action="start-review">开始复习 (${due.length})</button>`:"")
      + `<div class="grid cols-3">
        <div class="card stat"><div class="stat-label">今日复习</div><div class="stat-value">${due.length}</div><div class="stat-hint">${recent} 个近期巩固 · ${longTerm} 个长期巩固</div></div>
        <div class="card stat"><div class="stat-label">累计主动回忆</div><div class="stat-value">${state.data.activities.filter(a=>a.type==="review").length}</div><div class="stat-hint">所有已完成的复习记录</div></div>
        <div class="card stat"><div class="stat-label">已掌握</div><div class="stat-value">${mastered}</div><div class="stat-hint">进入长期巩固的词</div></div>
      </div>
      <div class="section card pad">${due.length?`<div class="table-wrap"><table class="table"><thead><tr><th>单词</th><th>中文释义</th><th>已复习</th><th>安排日期</th></tr></thead><tbody>${due.map(c=>`<tr><td><strong>${escapeHtml(c.word)}</strong><div class="phonetic">${escapeHtml(formatPhonetic(c.phonetic))}</div></td><td>${escapeHtml(c.meaningZh)}</td><td>${c.reviewCount||0} 次</td><td>${c.nextReviewAt?new Date(c.nextReviewAt).toLocaleDateString():"—"}</td></tr>`).join("")}</tbody></table></div>`
      :`<div class="empty"><div class="empty-icon">✓</div><strong>今天没有需要复习的内容</strong><span>需要巩固时会自动出现在这里，你不需要手动管理复习日期。</span></div>`}</div>`
    );
  }'''
app=replace_top_function(app,'reviewPage',review_fn)

write(Path('public/app.js'),app)

# ---------------------------------------------------------------------
# Review policy: scheduling stays automatic, but Settings no longer exposes
# a read-only policy panel. Only contextual Today hints remain.
# ---------------------------------------------------------------------
review_policy=r'''(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before review-policy-v3.js");

  let latestData=null;
  let scheduled=false;

  function syncFromGateway(){
    try{
      const current=window.LexiFlowLearningDataGatewayV3?.current?.();
      if(!current?.cards)return false;
      latestData=core.normalizeData(current);
      return true;
    }catch{return false;}
  }

  async function refresh(force=false){
    if(!force&&syncFromGateway())return latestData;
    try{
      const response=await fetch("/api/learning-data",{cache:"no-store"});
      if(response.ok){
        const payload=await response.json();
        if(payload?.data)latestData=core.normalizeData(payload.data);
      }
    }catch{}
    return latestData;
  }

  function planOf(){return latestData?.dailyPlan||null;}
  function numberOr(value,fallback=0){const n=Number(value);return Number.isFinite(n)?n:fallback;}
  function goalText(plan){
    const base=Math.max(0,numberOr(plan?.selectMaxGoal,latestData?.settings?.dailyGoal||3));
    const goal=Math.max(0,numberOr(plan?.selectGoal,base));
    const reviewCount=Math.max(0,numberOr(plan?.reviewCriticalCount,0))+Math.max(0,numberOr(plan?.reviewStableScheduledCount,0));
    if(reviewCount===0)return `今天没有复习任务，新词最多 ${goal} 个。`;
    if(goal===0)return `今天安排 ${reviewCount} 个复习，先巩固旧词，暂不增加新词。`;
    if(goal<base)return `今天安排 ${reviewCount} 个复习，新词自动调整为最多 ${goal} 个。`;
    return `今天安排 ${reviewCount} 个复习，新词最多 ${goal} 个。`;
  }

  function decorateToday(){
    const plan=planOf();if(!plan)return;
    const reviewRow=document.querySelector('#lexi-today-plan [data-plan-key="review"]');
    const recent=Math.max(0,numberOr(plan.reviewCriticalCount,0));
    const longTerm=Math.max(0,numberOr(plan.reviewStableScheduledCount,0));
    if(reviewRow){
      const count=reviewRow.querySelector(".lexi-plan-count");
      if(count)count.title=`今天需要复习 ${recent+longTerm} 个词，其中 ${recent} 个近期巩固、${longTerm} 个长期巩固。`;
    }
    const goalRow=document.querySelector('#lexi-today-plan [data-plan-key="select-goal"]');
    if(goalRow)goalRow.title=goalText(plan);
  }

  function decorate(){decorateToday();}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;syncFromGateway();decorate();});}
  function start(){
    const app=document.getElementById("app");if(!app)return;
    syncFromGateway();
    if(latestData)decorate();else void refresh(true).then(decorate);
    new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
    window.addEventListener("lexiflow:today-plan-data",schedule);
    window.addEventListener("focus",()=>void refresh(true).then(decorate));
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();
'''
write(Path('public/review-policy-v3.js'),review_policy)

# ---------------------------------------------------------------------
# Review session: keep all scheduling semantics but remove internal product
# vocabulary from the visible learning surface.
# ---------------------------------------------------------------------
review_session=read(Path('public/review-session-v3.js'))
review_session=review_session.replace('const p=progress(session),phase=session.phase==="repair"?"当天修复复测":"本轮主动回忆";','const p=progress(session),phase=session.phase==="repair"?"再巩固一次":"今日复习";')
review_session=review_session.replace('只处理 Today Plan 已安排的词','今天安排的复习')
review_session=review_session.replace('没记住，明天再验证','没记住，明天再练')
review_session=review_session.replace('今天没有已安排的复习','今天没有需要复习的内容')
review_session=review_session.replace('只会进入 Today Plan 中已经冻结的 Review 队列，不会把计划外到期词临时塞进来。','需要巩固的词会由系统自动安排，你不需要手动管理复习日期。')
write(Path('public/review-session-v3.js'),review_session)

# ---------------------------------------------------------------------
# Source context and Settings typography: make injected controls follow V7.
# ---------------------------------------------------------------------
source=read(Path('public/source-context-v3.js'))
source=source.replace('.lexi-source-box-head strong{font-size:14px}.lexi-source-box-head span{font-size:12px;', '.lexi-source-box-head strong{font-size:13px;font-weight:650}.lexi-source-box-head span{font-size:11px;')
source=source.replace('.lexi-source-box textarea{min-height:84px}', '.lexi-source-box .field label{font-size:11px}.lexi-source-box .input,.lexi-source-box .textarea{font-size:12.5px}.lexi-source-box textarea{min-height:84px}')
write(Path('public/source-context-v3.js'),source)

theme=read(Path('public/theme-v7.css'))
marker='/* --- V7 user surface consistency ------------------------------------ */'
if marker not in theme:
    theme += r'''

/* --- V7 user surface consistency ------------------------------------ */
.settings-list .setting-row h3{font-size:13.5px;font-weight:650;letter-spacing:-.01em}
.settings-list .setting-row p{font-size:11.5px;line-height:1.6}
.settings-list .field label{font-size:11px;font-weight:650;color:#747e76}
.settings-list .input,.settings-list .select{height:42px;font-size:12.5px;border-radius:12px}
.settings-provider-row{align-items:flex-start;gap:24px}
.settings-provider-copy{min-width:280px;flex:1}
.settings-status-line{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-top:10px}
.settings-last-connected{font-size:10.5px;color:var(--muted)}
.settings-provider-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;justify-content:flex-end;max-width:520px}
.settings-provider-actions .input{width:250px}
.compact-actions{min-height:42px}
.setting-actions-inline{display:flex;gap:9px;align-items:center;justify-content:flex-end}
.settings-voice-actions{flex-wrap:wrap;align-items:flex-end}
.settings-voice-field{min-width:220px}
.settings-advanced{border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.72);overflow:hidden}
.settings-advanced>summary{cursor:pointer;padding:15px 17px;list-style:none;display:flex;justify-content:space-between;gap:16px;align-items:center}
.settings-advanced>summary strong{font-size:13.5px;font-weight:650}.settings-advanced>summary small{display:block;margin-top:4px;color:var(--muted);font-size:10.5px}.settings-advanced-toggle{color:var(--muted);font-size:11px}
.settings-advanced-row{align-items:flex-start!important;border:0!important;border-top:1px solid var(--line-soft)!important;border-radius:0!important;box-shadow:none!important;background:transparent!important}
.codex-runtime-grid{display:grid;grid-template-columns:minmax(210px,1.15fr) minmax(170px,.85fr) auto;gap:10px;align-items:end;min-width:min(620px,58vw)}

.stats-unit{font-size:13px;color:var(--muted);margin-left:2px}.stats-layout{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(260px,.75fr);gap:14px}.stats-stage-list{display:grid;gap:12px}.stats-stage-row{display:grid;gap:6px}.stats-stage-meta{display:flex;justify-content:space-between;align-items:center;font-size:11.5px;color:#657068}.stats-stage-meta strong{font-size:12px;color:#414a43}.stats-stage-track{height:7px;border-radius:999px;background:rgba(89,108,94,.07);overflow:hidden}.stats-stage-track span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#9bb5a4,#91adba,#c6ad91)}.stats-recall-card{display:flex;flex-direction:column}.stats-recall-number{margin-top:auto;font-family:var(--display-serif);font-size:46px;line-height:1;color:#334039}.stats-recall-copy{margin-top:10px;font-size:11.5px;line-height:1.65;color:var(--muted)}
.stats-heatmap{display:grid;grid-template-columns:repeat(15,minmax(18px,1fr));gap:7px}.stats-heat-day{position:relative;aspect-ratio:1;border-radius:7px;background:rgba(90,111,95,.05);border:1px solid rgba(80,98,84,.045)}.stats-heat-day span{position:absolute;inset:auto 2px 2px;text-align:center;font-size:8px;color:transparent;pointer-events:none}.stats-heat-day.level-1{background:rgba(157,184,164,.20)}.stats-heat-day.level-2{background:rgba(139,174,151,.34)}.stats-heat-day.level-3{background:rgba(119,158,134,.52)}.stats-heat-day.level-4{background:rgba(94,137,110,.72)}.stats-heat-legend{display:flex;gap:5px;align-items:center;justify-content:flex-end;margin-top:10px;font-size:9.5px;color:var(--muted)}.stats-heat-legend i{width:11px;height:11px;border-radius:4px;background:rgba(157,184,164,.20)}.stats-heat-legend i.level-2{background:rgba(139,174,151,.34)}.stats-heat-legend i.level-3{background:rgba(119,158,134,.52)}.stats-heat-legend i.level-4{background:rgba(94,137,110,.72)}
.stats-struggle-list{display:grid;gap:8px}.stats-struggle-row{width:100%;border:1px solid var(--line);border-radius:13px;background:rgba(255,255,255,.62);padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:14px;text-align:left;color:inherit}.stats-struggle-row span{display:grid;gap:3px}.stats-struggle-row strong{font-family:var(--display-serif);font-size:17px;font-weight:600}.stats-struggle-row small{font-size:10.5px;color:var(--muted)}.stats-struggle-row em{font-style:normal;font-size:10.5px;color:#936b64}.stats-empty-note{padding:18px;border-radius:13px;background:rgba(120,140,132,.045);font-size:11.5px;color:var(--muted)}
@media(max-width:900px){.settings-provider-row{flex-direction:column}.settings-provider-actions{justify-content:flex-start;max-width:none;width:100%}.codex-runtime-grid{grid-template-columns:1fr;min-width:0;width:100%}.stats-layout{grid-template-columns:1fr}.stats-heatmap{grid-template-columns:repeat(10,minmax(18px,1fr))}}
'''
write(Path('public/theme-v7.css'),theme)

# ---------------------------------------------------------------------
# Example hydration: every successful dictionary/expression payload can receive
# missing Chinese example translations; do not restrict this to local sources.
# ---------------------------------------------------------------------
hydration=read(Path('public/example-hydration.js'))
hydration=hydration.replace('function isLocalDictionaryPayload(payload) {\n    const result = payload?.result;\n    return Boolean(payload?.ok && result && (result.localLookup === true || result.dictionarySource === "ECDICT" || result.dictionarySource === "LexiFlow Core") && Array.isArray(result.senses));\n  }','function isDictionaryPayload(payload) {\n    const result = payload?.result;\n    return Boolean(payload?.ok && result && Array.isArray(result.senses));\n  }')
hydration=hydration.replace('if (isLocalDictionaryPayload(payload)) {','if (isDictionaryPayload(payload)) {')
hydration=hydration.replace('if (zh && !clean(firstSense?.exampleZh)) zh.textContent = clean(firstSense?.exampleEn) ? "中文翻译正在后台准备…" : "";','if (zh && !clean(firstSense?.exampleZh)) zh.textContent = clean(firstSense?.exampleEn) ? "正在补充中文翻译…" : "";')
write(Path('public/example-hydration.js'),hydration)

enrich=read(Path('lib/example-enrichment.js'))
enrich=enrich.replace('for (const raw of Array.isArray(parsed?.senses) ? parsed.senses : []) {','const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.senses) ? parsed.senses : Array.isArray(parsed?.translations) ? parsed.translations : [];\n  for (const raw of rows) {',1)
# second normalization function receives the same robust row handling
idx=enrich.find('function normalizeTranslations')
if idx>=0:
    tail=enrich[idx:]
    tail=tail.replace('for (const raw of Array.isArray(parsed?.senses) ? parsed.senses : []) {','const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.senses) ? parsed.senses : Array.isArray(parsed?.translations) ? parsed.translations : [];\n  for (const raw of rows) {',1)
    enrich=enrich[:idx]+tail
enrich=enrich.replace('const stdout = await runCodex(prompt, 14000);','const stdout = await runCodex(prompt, 28000);')
write(Path('lib/example-enrichment.js'),enrich)

# ---------------------------------------------------------------------
# Desktop icon: stop embedding a stale icon inside electron-main.js.
# public/icon.png becomes the runtime source of truth; build/icon.ico remains
# the Windows packaging source and is updated in the final verified commit.
# ---------------------------------------------------------------------
electron=read(Path('electron-main.js'))
electron=re.sub(r'\nconst APP_ICON_DATA_URL = "data:image/png;base64,[^"]+";\n','\n',electron,count=1)
electron=re.sub(r'function getAppIcon\(\) \{.*?\n\}','''function getAppIcon() {\n  const candidates = [\n    path.join(__dirname, "public", "icon.png"),\n    path.join(__dirname, "build", "icon.ico"),\n  ];\n  for (const candidate of candidates) {\n    try {\n      if (!fs.existsSync(candidate)) continue;\n      const image = nativeImage.createFromPath(candidate);\n      if (!image.isEmpty()) return image;\n    } catch {}\n  }\n  return undefined;\n}''',electron,count=1,flags=re.S)
write(Path('electron-main.js'),electron)

# ---------------------------------------------------------------------
# Contract checks: Review policy is no longer a Settings surface; add a single
# user-surface regression covering auto-connect, copy, stats and translation.
# ---------------------------------------------------------------------
review_test=read(Path('scripts/check-review-policy-v3.js'))
review_test=re.sub(r'const policyUi=.*?assert\(policyUi\.includes\(\'requestAnimationFrame.*?\);\n','''const policyUi=fs.readFileSync(path.join(root,"public","review-policy-v3.js"),"utf8");\nassert(!policyUi.includes("复习与学习负荷"),"automatic review workload must not be exposed as a Settings panel");\nassert(!policyUi.includes("settingsHtml")&&!policyUi.includes("decorateSettings"),"Review scheduling must stay out of Settings");\nassert(!policyUi.includes("Review V4")&&!policyUi.includes("Stable 今日"),"internal scheduling labels must not reach users");\nassert(policyUi.includes("function syncFromGateway"),"Review hint surface must reuse the shared Learning Data Gateway snapshot");\nassert(policyUi.includes("LexiFlowLearningDataGatewayV3?.current?.()"),"Review hint surface must prefer the gateway snapshot");\nassert(policyUi.includes("今天没有复习任务"),"Today hint must use user-facing review language");\n''',review_test,count=1,flags=re.S)
write(Path('scripts/check-review-policy-v3.js'),review_test)

surface_test=r'''"use strict";
const fs=require("fs");
const path=require("path");
function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const app=fs.readFileSync(path.join(root,"public","app.js"),"utf8");
const policy=fs.readFileSync(path.join(root,"public","review-policy-v3.js"),"utf8");
const review=fs.readFileSync(path.join(root,"public","review-session-v3.js"),"utf8");
const source=fs.readFileSync(path.join(root,"public","source-context-v3.js"),"utf8");
const theme=fs.readFileSync(path.join(root,"public","theme-v7.css"),"utf8");
const hydration=fs.readFileSync(path.join(root,"public","example-hydration.js"),"utf8");
const enrichment=fs.readFileSync(path.join(root,"lib","example-enrichment.js"),"utf8");
const electron=fs.readFileSync(path.join(root,"electron-main.js"),"utf8");

assert(app.includes("verifyProviderConnectionsOnStartup"),"app must verify provider connections automatically");
assert(app.includes("setTimeout(()=>{void verifyProviderConnectionsOnStartup();},0)"),"automatic provider verification must start after initial render");
assert(app.includes("词汇进度")&&app.includes("最近 30 天学习节奏")&&app.includes("需要加强")&&app.includes("30 天回忆成功率"),"stats page must expose actionable progress metrics");
for(const banned of ["CLI 已检测","CLI 未检测","真实 AI 请求验证","Fast transport","运行连接已验证","Today Plan"]){
  assert(!app.includes(banned),`user-facing app copy must not expose internal label: ${banned}`);
}
assert(!policy.includes("复习与学习负荷")&&!policy.includes("settingsHtml"),"read-only review workload must not appear in Settings");
assert(!review.includes("Today Plan"),"review session must not expose planning internals");
assert(source.includes(".lexi-source-box .input,.lexi-source-box .textarea{font-size:12.5px}"),"source context typography must follow the V7 scale");
assert(theme.includes("V7 user surface consistency")&&theme.includes(".settings-list .input,.settings-list .select"),"Settings typography must have a consistent V7 surface contract");
assert(hydration.includes("function isDictionaryPayload")&&!hydration.includes("function isLocalDictionaryPayload"),"example translation hydration must cover remote/expression dictionary payloads too");
assert(enrichment.includes("runCodex(prompt, 28000)"),"example translation must allow a realistic AI response window");
assert(electron.includes('path.join(__dirname, "public", "icon.png")')&&electron.includes("nativeImage.createFromPath"),"desktop window must use the same source icon as the app UI");
assert(!electron.includes("APP_ICON_DATA_URL"),"stale embedded desktop icon must not return");
console.log("User surface V4 checks passed.");
'''
write(Path('scripts/check-user-surface-v4.js'),surface_test)

package_path=Path('package.json')
package=json.loads(read(package_path))
check=package['scripts']['check']
if 'node --check scripts/check-user-surface-v4.js' not in check:
    check=check.replace('node --check scripts/check-learning-engine-v3.js','node --check scripts/check-user-surface-v4.js && node --check scripts/check-learning-engine-v3.js',1)
if 'node scripts/check-user-surface-v4.js' not in check:
    check=check.replace(' && npm run check:learning',' && node scripts/check-user-surface-v4.js && npm run check:learning')
package['scripts']['check']=check
write(package_path,json.dumps(package,ensure_ascii=False,indent=2)+"\n")

print('V7 user surface polish migration applied')
