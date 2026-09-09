from pathlib import Path
import re


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    Path(path).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)


def replace_regex(text, pattern, repl, label):
    new, count = re.subn(pattern, repl, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 regex match, found {count}')
    return new

app = read('public/app.js')

app = replace_once(
    app,
    '''  function header(eyebrow,title,subtitle,actions=""){
    return `<div class="page-head">
      <div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${subtitle}</p></div>
      <div class="head-actions">${actions}</div>
    </div>`;
  }''',
    '''  function header(eyebrow,title,subtitle,actions=""){
    return `<div class="page-head">
      <div>${eyebrow?`<div class="eyebrow">${eyebrow}</div>`:""}<h1>${title}</h1><p>${subtitle}</p></div>
      <div class="head-actions">${actions}</div>
    </div>`;
  }''',
    'conditional eyebrow'
)

# Remove product-internal English labels from normal navigation surfaces.
for old, new in {
    'header("LEXIFLOW · TODAY","今日学习"': 'header("","今日学习"',
    'header("LEXIFLOW · SELECT","选词制卡"': 'header("","选词制卡"',
    'header("LEXIFLOW · REVIEW","复习会话"': 'header("","复习会话"',
    'header("LEXIFLOW · LIBRARY","单词库"': 'header("","单词库"',
    'header("LEXIFLOW · STATS","学习统计"': 'header("","学习统计"',
    'header("LEXIFLOW · LEARNING","学习会话"': 'header("","学习会话"',
    '"LEXIFLOW · LEARNING",\n        "学习会话"': '"",\n        "学习会话"',
    '<div class="eyebrow">DAILY FLOW</div>': '<div class="eyebrow">今日进度</div>',
    'SELECT · 选词确认': '选词确认',
    'MEMORIZE · 英 → 中': '英 → 中',
    'MEMORIZE · 中 → 英': '中 → 英',
    'VISUALIZE · 视觉联想': '视觉联想',
    'APPLY · 造句应用': '造句应用',
    'ACTIVE RECALL · 主动回忆': '主动回忆',
    '所有 Review 记录': '所有复习记录',
    'Review 次数': '复习次数',
    '当前 streak': '按连续学习天数计算',
}.items():
    app = app.replace(old, new)

add_page = r'''  function addPage\(\)\{[\s\S]*?\n  \}\n\n  function renderLookupResult\(\)\{'''
add_repl = '''  function addPage(){
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

  function renderLookupResult(){'''
app = replace_regex(app, add_page, add_repl, 'rewrite add page')

result_pattern = r'''  function renderLookupResult\(\)\{[\s\S]*?\n  \}\n\n  function renderSenseEditor\(s\)\{'''
result_repl = '''  function renderLookupResult(){
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

  function renderSenseEditor(s){'''
app = replace_regex(app, result_pattern, result_repl, 'rewrite lookup result')

# Make visual generation's zero-input path explicit and calmer.
app = app.replace('让 AI 自动设计记忆画面', '直接生成记忆画面')
app = app.replace('无需填写场景。系统会结合当前词义、例句和具体语义自动构图，并主动避开容易混淆的其它含义。', '不需要填写任何场景。系统会根据当前词义和例句自动设计一张容易记住的画面；只有你想指定人物、地点或动作时，才需要展开自定义场景。')
app = app.replace('${state.study.imageGenerating?"正在生成…":"智能生成"}', '${state.study.imageGenerating?"正在生成…":"直接生成"}')

# Productize normal settings copy while retaining optional diagnostics.
app = app.replace('<h3>Merriam-Webster Learner\'s Dictionary</h3>', '<h3>英语词典</h3>')
app = app.replace('用于英文词条、词性、定义、例句和美式发音。当前：${dict?.configured?`已配置 ${escapeHtml(dict.maskedKey||"")}`:"未配置"}', '提供英文词条、词性、例句、音标和美式发音。由 Merriam-Webster Learner\'s Dictionary 提供数据。当前：${dict?.configured?`已连接 ${escapeHtml(dict.maskedKey||"")}`:"未连接"}')
app = app.replace('保存 Key', '保存')
app = app.replace('验证</button>', '检查连接</button>')
app = app.replace('Low · 低', '低')
app = app.replace('Medium · 中', '中')
app = app.replace('High · 高', '高')
app = app.replace('Extra High · 超高', '超高')
app = app.replace('Max · 最高', '最高')
app = app.replace('不会改写你的 auth.json，也不会修改全局 Codex 登录状态。', '只影响 LexiFlow 的 AI 调用，不会修改你本机 Codex 的全局配置。')
app = app.replace('“跟随默认”使用 Codex 当前模型。列表始终保留常用模型，并合并 config.toml 中检测到的模型。</p><p>为提高响应速度：查词整理、中文搜索纠错和图片任务使用快速推理；造句反馈使用你选择的思考强度。', '“跟随默认”使用当前 Codex 默认模型。查词、中文纠错和图片任务会自动优先使用快速推理，造句反馈使用你选择的思考强度。')

# Replace the AI-service status block with user-facing summary + collapsed diagnostics.
ai_block_pattern = r'''        <div class="setting-row" style="align-items:flex-start">\n          <div style="min-width:310px;flex:1">\n            <h3>AI 服务</h3>[\s\S]*?        </div>\n\n        <div class="setting-row" style="align-items:flex-start">\n          <div style="min-width:260px">'''
ai_block_repl = '''        <div class="setting-row" style="align-items:flex-start">
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
          <div style="min-width:260px">'''
app = replace_regex(app, ai_block_pattern, ai_block_repl, 'productize AI settings')

write('public/app.js', app)

styles = read('public/styles.css')
styles += r'''

/* UI polish round 2 — learning-first, quieter, less dashboard-like */
:root{
  --bg:#f7f8fb;
  --panel:#ffffff;
  --panel-solid:#ffffff;
  --text:#152033;
  --muted:#738096;
  --line:#e3e8ef;
  --shadow:0 8px 28px rgba(29,45,70,.055);
  --radius:16px;
}
body{background:var(--bg)}
body:before{display:none}
.sidebar{background:#fbfcfe;backdrop-filter:none;box-shadow:none;border-right:1px solid #e7ebf1}
.logo{background:#315fcb;box-shadow:none}
.logo:after{display:none}
.nav-btn{transition:background .16s ease,color .16s ease}
.nav-btn:hover{transform:none;background:#f1f4f8}
.nav-btn.active{background:#edf3ff;box-shadow:none}
.main{padding-top:32px}
.content{max-width:1100px}
.page-head{margin-bottom:20px}.page-head h1{font-size:32px;letter-spacing:-.035em}.page-head p{max-width:720px;margin-top:7px}
.eyebrow{letter-spacing:.08em;color:#74859b;font-size:10px}
.card{background:#fff;backdrop-filter:none;box-shadow:var(--shadow);border-color:var(--line);transition:border-color .16s ease,box-shadow .16s ease}
.card:hover{border-color:var(--line);box-shadow:var(--shadow)}
.btn{overflow:visible;transition:background .16s ease,border-color .16s ease,color .16s ease,box-shadow .16s ease}
.btn:hover:not(:disabled){transform:none}.btn:active:not(:disabled){transform:none}.btn.primary{background:#3468df;box-shadow:none}.btn.primary:after{display:none}
.btn.ghost{background:transparent;color:#66758a}.btn.ghost:hover:not(:disabled){background:#f5f7fa}
.search-hero-card{padding:14px!important;background:#fff}
.search-command-bar{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:9px;align-items:center}
.search-command-bar .search-input-wrap .input{height:52px;border:0;background:#f7f9fc;box-shadow:none;padding-left:44px;font-size:15px}
.search-command-bar .search-input-wrap .input:focus{background:#fff;box-shadow:0 0 0 2px #dfe8fb}
.search-helper{display:flex;gap:7px;flex-wrap:wrap;margin:9px 4px 0;color:#8794a7;font-size:11px}
.search-helper span{padding-right:8px;border-right:1px solid #e2e7ee}.search-helper span:last-child{border-right:0}
.lookup-surface{margin-top:14px;padding:24px!important}
.learning-card-wordtop{align-items:center;padding-bottom:17px;border-bottom:1px solid #eef1f5}.learning-card-wordtop .word-line h2{font-size:36px}.learning-card-wordtop .phonetic{font-size:13px}
.result-meta{display:flex;gap:7px;align-items:center}
.primary-sense-card{margin-top:18px;padding:0 2px}
.primary-sense-meta{display:flex;align-items:center;gap:9px;color:#8490a2;font-size:11px}
.primary-meaning{margin-top:12px;font-size:27px;font-weight:850;letter-spacing:-.025em;color:#18243a}
.example-pair{margin-top:20px;padding:16px 18px;border-radius:13px;background:#f7f9fc;border:1px solid #edf1f5}
.example-label{color:#8d99aa;font-size:11px;font-weight:800}.example-en{margin-top:7px;color:#35445b;font-size:15px;line-height:1.7}.example-zh{margin-top:5px;color:#7a8799;font-size:12px;line-height:1.65}
.expanded-senses-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:18px 0 8px}.expanded-senses-head strong{font-size:14px}.expanded-senses-head span{font-size:11px;color:#8a96a7}
.sense{padding:15px 16px;border-radius:13px;box-shadow:none}.sense:hover{transform:none;box-shadow:none;border-color:#bdccec}.sense.selected{background:#f5f8ff;border-color:#8faef0;box-shadow:0 0 0 1px #dbe6fd}
.sense-selected-mark{color:#3468df;font-weight:900}.sense-meaning{font-size:17px;font-weight:850}.sense-example{margin-top:9px;color:#5b6a80;font-size:13px;line-height:1.6}.sense-example-zh{margin-top:4px;color:#8a96a7;font-size:11px;line-height:1.55}
.learning-card-actions{margin-top:22px}.save-learning-card{min-width:150px}
.lookup-loader{padding:46px 20px}.lookup-loader-orb{box-shadow:none;background:#f2f6ff}.auto-resolved-note{background:#f7f9fc;border-color:#e8edf3}
.study-card,.stage-rail{border-radius:18px}.study-card{padding:30px}.stage-rail{background:#fff}
.study-kicker{color:#7a8ba3;letter-spacing:.04em;font-size:11px}
.auto-visual-card{background:#f7f9fc;border-color:#e5eaf1;box-shadow:none}.auto-visual-icon{box-shadow:none;background:#eef3ff}
.visual-custom-panel{animation:none}
.setting-row{border-radius:13px;box-shadow:none}.setting-actions-inline{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.advanced-diagnostics{margin-top:10px}.advanced-diagnostics summary{cursor:pointer;color:#75849a;font-size:11px;font-weight:750}.advanced-diagnostics-body{margin-top:8px;padding:10px 12px;border-radius:10px;background:#f7f9fc}.advanced-diagnostics-body p{margin:3px 0!important}
.progress-bar,.bar{background:#4a73d4}
@media(max-width:760px){.search-command-bar{grid-template-columns:1fr}.search-command-bar .btn{width:100%}.lookup-surface{padding:18px!important}.primary-meaning{font-size:24px}.expanded-senses-head{align-items:flex-start;flex-direction:column}.setting-actions-inline{justify-content:flex-start}}
'''
write('public/styles.css', styles)

readme = read('README.md')
readme += '''\n\n## UI Polish Round 2\n\n- Normal product surfaces now use Chinese-first labels; internal English workflow labels were removed from navigation and learning stages.\n- The add-word page no longer renders an empty result panel before search. The default result is a single learning-card preview; multiple senses only appear after the user asks for other common meanings.\n- The lookup result hierarchy is now word + pronunciation + core Chinese meaning + labeled example, with secondary actions visually de-emphasized.\n- Visual association makes the zero-input generation path explicit; custom scene description remains optional.\n- Settings show user-facing service status by default and move Codex implementation details into collapsed advanced diagnostics.\n- Visual styling was reduced from glass/dashboard effects to calmer solid surfaces, fewer hover motions, and a stronger study-first hierarchy.\n'''
write('README.md', readme)
