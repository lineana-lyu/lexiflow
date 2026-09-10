from pathlib import Path
import json
import re
from PIL import Image, ImageDraw

root = Path('.')


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing exact patch target: {label}')
    return text.replace(old, new, 1)


def replace_region(text, start_marker, end_marker, replacement, label):
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f'missing start marker: {label}')
    end = text.find(end_marker, start + len(start_marker))
    if end < 0:
        raise SystemExit(f'missing end marker: {label}')
    return text[:start] + replacement + text[end:]


# ---------------- server.js ----------------
server_path = root / 'server.js'
server = server_path.read_text(encoding='utf-8')

if 'const sentenceFeedbackCache = new Map();' not in server:
    server = replace_once(
        server,
        'let lookupCache = null;\n',
        'let lookupCache = null;\nconst sentenceFeedbackCache = new Map();\n',
        'sentence feedback cache declaration',
    )

settings_block = r'''async function loadSettings() {
  const defaults = {
    merriamWebsterLearnersKey: "",
    codexModel: DEFAULT_CODEX_MODEL,
    codexReasoningEffort: DEFAULT_CODEX_REASONING_EFFORT,
  };
  try {
    const parsed = JSON.parse(await fsp.readFile(SETTINGS_FILE, "utf8"));
    const safeStorage = getElectronSafeStorage();
    let key = String(parsed.merriamWebsterLearnersKey || "");

    if (!key && parsed.merriamWebsterLearnersKeyEncrypted && safeStorage) {
      try {
        key = safeStorage.decryptString(Buffer.from(String(parsed.merriamWebsterLearnersKeyEncrypted), "base64"));
      } catch (err) {
        console.warn("dictionary key decrypt failed:", err.message);
      }
    }

    // One-way migration: old desktop settings that still contain a plaintext
    // dictionary key are rewritten with Electron safeStorage encryption.
    if (key && parsed.merriamWebsterLearnersKey && safeStorage) {
      try {
        const migrated = {
          ...parsed,
          merriamWebsterLearnersKeyEncrypted: safeStorage.encryptString(key).toString("base64"),
        };
        delete migrated.merriamWebsterLearnersKey;
        await writeJsonAtomic(SETTINGS_FILE, migrated);
      } catch (err) {
        console.warn("dictionary key encryption migration skipped:", err.message);
      }
    }

    return {
      ...defaults,
      ...parsed,
      merriamWebsterLearnersKey: key,
      codexModel: String(parsed.codexModel || "").trim() || DEFAULT_CODEX_MODEL,
      codexReasoningEffort: String(parsed.codexReasoningEffort || "").trim().toLowerCase() || DEFAULT_CODEX_REASONING_EFFORT,
    };
  } catch {
    return defaults;
  }
}

async function saveSettings(next) {
  const allowedEfforts = new Set(["", "low", "medium", "high", "xhigh", "max"]);
  const requestedEffort = String(next.codexReasoningEffort || "").trim().toLowerCase();

  const clean = {
    merriamWebsterLearnersKey: String(next.merriamWebsterLearnersKey || "").trim(),
    codexModel: String(next.codexModel || "").trim(),
    codexReasoningEffort: allowedEfforts.has(requestedEffort) ? requestedEffort : "",
  };

  try {
    const diskValue = {
      codexModel: clean.codexModel,
      codexReasoningEffort: clean.codexReasoningEffort,
    };
    const safeStorage = getElectronSafeStorage();
    if (clean.merriamWebsterLearnersKey) {
      if (safeStorage) {
        diskValue.merriamWebsterLearnersKeyEncrypted = safeStorage.encryptString(clean.merriamWebsterLearnersKey).toString("base64");
      } else {
        // Browser/dev fallback only. The runtime settings path is gitignored.
        diskValue.merriamWebsterLearnersKey = clean.merriamWebsterLearnersKey;
      }
    }
    await writeJsonAtomic(SETTINGS_FILE, diskValue);
  } catch (err) {
    const wrapped = new Error("本地设置文件无法写入");
    wrapped.code = "SETTINGS_WRITE_FAILED";
    wrapped.cause = err;
    throw wrapped;
  }
  return clean;
}

'''
server = replace_region(
    server,
    'async function loadSettings() {',
    'function maskKey',
    settings_block,
    'secure settings persistence',
)

sentence_feedback = r'''async function sentenceFeedback(body) {
  const word = String(body.word || "").trim();
  const meaningZh = String(body.meaningZh || "").trim();
  const sentence = String(body.sentence || "").trim();
  if (!word || !sentence) throw new Error("INVALID_INPUT");

  const inputLanguage = /[\u3400-\u9fff]/.test(sentence) ? "zh" : "en";
  const settings = await loadSettings();
  const cacheKey = [
    settings.codexModel || DEFAULT_CODEX_MODEL,
    word.toLowerCase(),
    meaningZh,
    sentence,
  ].join("|");
  const cached = sentenceFeedbackCache.get(cacheKey);
  if (cached) return { ...cached, cacheHit: true };

  const prompt = `你是英语学习应用的快速造句审核器。只做必要检查，不扩写，不讲解过程。
目标词：${word}
当前词义：${meaningZh}
用户输入：${sentence}

规则：
1. 中文输入：翻译成自然、简洁英文；必须自然使用目标词或常见词形，并保持当前词义。不要新增用户没表达的信息。如果无法在不编造信息的前提下加入目标词，approved=false。
2. 英文输入：检查是否自然、语法是否基本正确、是否使用目标词/词形且符合当前词义。正确时 suggestion 为空；需要修改时只做最小修改。
3. 如果英文完全没包含目标词，只有在不改变原意时才补入；否则 approved=false，并在 tips 中提醒用户重写。
4. keyword 必须是最终英文里实际出现的目标词或词形，用于界面高亮。
5. suggestion 如果非空，应当是可直接保存的最终英文；如果 suggestion 已经修正完成，则 level=good、approved=true。

只输出 JSON：
{"inputLanguage":"zh|en","approved":true,"level":"good|warn","title":"简短中文结论","tips":["最多2条"],"suggestion":"最终英文或空字符串","keyword":"最终英文中实际目标词/词形"}`;

  const result = await runCodex(prompt, {
    timeoutMs: 15000,
    workspaceWrite: false,
    reasoningEffortOverride: "low",
  });
  const parsed = extractJson(result.stdout);
  const feedback = {
    inputLanguage: parsed.inputLanguage === "zh" ? "zh" : inputLanguage,
    approved: parsed.approved !== false,
    level: parsed.level === "good" ? "good" : "warn",
    title: String(parsed.title || "审核完成"),
    tips: Array.isArray(parsed.tips) ? parsed.tips.slice(0, 2).map(String) : [],
    suggestion: String(parsed.suggestion || "").trim(),
    keyword: String(parsed.keyword || word).trim() || word,
    provider: "codex-local",
    cacheHit: false,
  };

  if (feedback.inputLanguage === "zh" && !feedback.suggestion) feedback.approved = false;
  if (feedback.level !== "good" && !feedback.suggestion) feedback.approved = false;

  sentenceFeedbackCache.set(cacheKey, feedback);
  if (sentenceFeedbackCache.size > 100) {
    const first = sentenceFeedbackCache.keys().next().value;
    sentenceFeedbackCache.delete(first);
  }
  return feedback;
}

'''
server = replace_region(
    server,
    'async function sentenceFeedback(body) {',
    'function safeFileStem',
    sentence_feedback,
    'fast sentence feedback',
)
server_path.write_text(server, encoding='utf-8')


# ---------------- public/app.js ----------------
app_path = root / 'public' / 'app.js'
app = app_path.read_text(encoding='utf-8')

if 'applyApproved:false' not in app:
    app = replace_once(
        app,
        '      aiSuggestionApplied:false,\n',
        '      aiSuggestionApplied:false,\n      applyApproved:false,\n      applyLastCheckedText:"",\n      applyDetectedLanguage:"",\n',
        'study apply state',
    )

helpers = r'''
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

'''
if 'function sentenceUsesTargetWord' not in app:
    start_study = app.find('  function startStudy')
    contains_chinese = app.rfind('  function containsChinese', 0, start_study)
    if start_study < 0 or contains_chinese < 0:
        raise SystemExit('unable to locate containsChinese/startStudy insertion point')
    app = app[:start_study] + helpers + app[start_study:]

visual_function = r'''  function stageVisual(card){
    const currentScene=String(state.study.visualNote||"").trim();
    const generation=card.imageGeneration||{status:"idle",message:"",code:"",startedAt:""};
    const customOpen=Boolean(state.visualSceneExpanded||currentScene);
    const hasImage=Boolean(card.imageData||card.imageUrl);
    const generating=Boolean(state.study.imageGenerating||generation.status==="generating");

    const status = generating
      ? `<div class="visual-status-inline working"><span class="mini-spinner"></span><span>正在生成联想图…</span></div>`
      : generation.status==="error"
        ? `<div class="visual-status-inline error"><strong>生成失败</strong><span>${escapeHtml(generation.message||"可以重试或上传本地图。")}</span></div>`
        : "";

    return `${stageKicker("视觉联想")}
      <div class="study-center visualize-stage visual-tight" style="align-items:stretch;text-align:left">
        <div class="visual-tight-head">
          <div class="visual-context-line compact"><span>当前词义</span><strong>${escapeHtml(card.meaningZh)}</strong></div>
          <button class="btn ghost small" data-action="toggle-visual-scene">${customOpen?"收起场景":"自定义场景"}</button>
        </div>

        ${customOpen?`<div class="field visual-scene-compact">
          <textarea class="textarea visual-scene-input" id="visual-note" placeholder="例如：一家人在晚餐桌前分享烤鸡">${escapeHtml(state.study.visualNote||"")}</textarea>
          <div class="visual-scene-help">中文描述即可；留空会按当前词义自动构图。</div>
        </div>`:""}

        ${status}

        ${hasImage?`
          <div class="visual-preview compact"><img class="visual-memory-image" data-card-id="${escapeHtml(card.id)}" src="${card.imageData||card.imageUrl}" alt="${escapeHtml(card.word)} 的视觉联想图片" /></div>
          <div class="visual-inline-actions">
            <button class="btn" data-action="generate-visual" ${generating?"disabled":""}>${generating?"生成中…":"重新生成"}</button>
            <label class="btn" for="visual-file">换一张图片</label>
          </div>
        `:`
          <div class="visual-generate-compact">
            <button class="btn primary" data-action="generate-visual" ${generating?"disabled":""}>${generating?"生成中…":"生成联想图"}</button>
            <label class="btn" for="visual-file">上传本地图</label>
          </div>
        `}
        <input id="visual-file" type="file" accept="image/png,image/jpeg,image/webp" style="display:none" />

        <div class="rating-row visual-actions tight">
          <button class="btn ghost" data-action="skip-visual">跳过</button>
          <button class="btn primary" data-action="finish-visual">完成视觉联想</button>
        </div>
      </div>`;
  }

'''
app = replace_region(app, '  function stageVisual(card){', '  function stageInitialReview', visual_function, 'compact visual stage')

apply_function = r'''  function stageApply(card){
    const fb=state.study.feedback;
    const current=String(state.study.applyText||"").trim();
    const checked=Boolean(state.study.applyApproved && state.study.applyLastCheckedText===current);
    const chinese=containsChinese(current);
    const missingKeyword=Boolean(current && !chinese && !sentenceUsesTargetWord(current,card.word));
    const corrected=Boolean(state.study.originalApplyText && state.study.originalApplyText.trim()!==current);
    const keyword=String(fb?.keyword||card.word||"").trim();

    const reviewStatus = state.study.applySubmitting
      ? `<div class="apply-review-result pending"><span class="mini-spinner"></span><div><strong>${chinese?"正在翻译并审核":"正在审核"}</strong><span>快速检查中…</span></div></div>`
      : fb
        ? `<div class="apply-review-result ${checked?"good":"warn"}"><div><strong>${escapeHtml(fb.title||(checked?"审核通过":"需要修改"))}</strong>${(fb.tips||[]).length?`<span>${escapeHtml((fb.tips||[]).join(" · "))}</span>`:""}</div>${checked?`<span class="ai-keyword-chip">关键词 · ${escapeHtml(keyword)}</span>`:""}</div>`
        : "";

    return `${stageKicker("造句应用")}
      <div class="study-center apply-stage-tight" style="align-items:stretch;text-align:left">
        <div class="apply-target-word">${wordIdentity(card,{size:"medium",showPos:true,center:true})}</div>
        <div class="field">
          <label>写一句与你自己相关的话</label>
          <textarea class="textarea" id="apply-text" placeholder="英文或中文；Enter 提交，Shift + Enter 换行">${escapeHtml(state.study.applyText||"")}</textarea>
          <div class="apply-mini-hint">Enter 提交 · Shift + Enter 换行</div>
        </div>

        <div id="apply-keyword-warning" class="apply-keyword-warning" ${missingKeyword?"":"hidden"}>当前句子还没有目标词 “${escapeHtml(card.word)}”。</div>
        ${reviewStatus}

        <div class="apply-primary-actions compact">
          ${corrected?`<button class="btn ghost" data-action="restore-original-apply">恢复原句</button>`:""}
          <button class="btn" data-action="submit-apply" ${state.study.applySubmitting?"disabled":""}>${state.study.applySubmitting?"处理中…":chinese?"翻译并审核":"提交审核"}</button>
          <button class="btn primary" data-action="pass-apply" ${checked&&!state.study.applySubmitting?"":"disabled"}>确认通过</button>
        </div>
      </div>`;
  }

'''
app = replace_region(app, '  function stageApply(card){', '  function advanceStage', apply_function, 'streamlined apply stage')

library_function = r'''  function libraryPage(){
    const q=state.librarySearch.trim().toLowerCase();
    const list=state.data.cards.filter(c=>!q||c.word.toLowerCase().includes(q)||c.meaningZh.includes(q));
    return shell(
      header("","单词库","",`<button class="btn primary" data-route="add">＋ 添加单词</button>`)
      + `<div class="search-row"><input class="input" id="library-search" placeholder="搜索单词或中文释义" value="${escapeHtml(state.librarySearch)}" /><span class="pill">${list.length} 张卡片</span></div>
      <div class="table-wrap"><table class="table library-table"><thead><tr><th>联想图</th><th>单词</th><th>词性</th><th>中文释义</th><th>阶段</th><th>下次复习</th><th></th></tr></thead>
      <tbody>${list.length?list.map(c=>`<tr>
        <td><div class="library-thumb">${(c.imageData||c.imageUrl)?`<img src="${c.imageData||c.imageUrl}" alt="${escapeHtml(c.word)} 联想图" loading="lazy" />`:`<span>—</span>`}</div></td>
        <td><strong>${escapeHtml(c.word)}</strong><div class="phonetic">${escapeHtml(formatPhonetic(c.phonetic||""))}</div></td>
        <td><span class="pill blue">${escapeHtml(c.pos)}</span></td>
        <td>${escapeHtml(c.meaningZh)}</td>
        <td>${stageLabelOf(c.stage)}</td>
        <td>${c.nextReviewAt?new Date(c.nextReviewAt).toLocaleDateString():"—"}</td>
        <td><button class="btn small danger" data-delete-card="${c.id}">删除</button></td>
      </tr>`).join(""):`<tr><td colspan="7"><div class="empty"><strong>没有匹配的单词</strong></div></td></tr>`}</tbody></table></div>`
    );
  }

'''
app = replace_region(app, '  function libraryPage(){', '  function statsPage', library_function, 'library thumbnails')

new_actions = r'''    if(action==="submit-apply"){
      if(!state.study||state.study.applySubmitting)return;
      const cardId=state.study.cardId;
      const sentence=String(document.getElementById("apply-text")?.value??state.study.applyText??"").trim();
      const c=getCard(cardId);
      if(!c)return;

      state.study.applyText=sentence;
      state.study.applyApproved=false;
      state.study.applyLastCheckedText="";
      state.study.applyDetectedLanguage=containsChinese(sentence)?"zh":"en";

      if(!sentence){
        state.study.feedback={level:"warn",title:"请先写一句话",tips:[],keyword:c.word};
        render();
        return;
      }

      state.study.applySubmitting=true;
      state.study.feedback=null;
      render();

      try{
        const payload=await api("/api/ai/text",{method:"POST",body:{word:c.word,meaningZh:c.meaningZh,sentence}});
        if(state.study?.cardId!==cardId)return;
        const fb=payload.feedback||{};
        const suggested=String(fb.suggestion||"").trim();
        const finalText=suggested||sentence;
        const keyword=String(fb.keyword||c.word||"").trim()||c.word;
        const keywordOk=textContainsKeyword(finalText,keyword)||sentenceUsesTargetWord(finalText,c.word);

        if(suggested && suggested!==sentence){
          if(!state.study.originalApplyText) state.study.originalApplyText=sentence;
          state.study.applyText=suggested;
        }

        const approved=fb.approved!==false && fb.level==="good" && keywordOk;
        state.study.applyApproved=approved;
        state.study.applyLastCheckedText=approved?finalText:"";
        state.study.feedback={
          level:approved?"good":"warn",
          title:approved?(suggested?"已纠正并审核通过":"审核通过"):(fb.title||"这句话还不能通过"),
          tips:[...(Array.isArray(fb.tips)?fb.tips:[]),...(!keywordOk?[`最终句子需要包含目标词 “${c.word}” 或其词形。`]:[])].slice(0,2),
          suggestedSentence:suggested,
          keyword,
          inputLanguage:fb.inputLanguage||state.study.applyDetectedLanguage,
        };
      }catch(err){
        if(state.study?.cardId!==cardId)return;
        state.study.applyApproved=false;
        state.study.applyLastCheckedText="";
        state.study.feedback={level:"warn",title:"审核没有完成",tips:["请再提交一次；未审核的句子不会被直接通过。"],keyword:c.word};
      }finally{
        if(state.study?.cardId===cardId){
          state.study.applySubmitting=false;
          render();
        }
      }
      return;
    }

    if(action==="restore-original-apply"){
      const original=String(state.study?.originalApplyText||"");
      if(!original)return;
      state.study.applyText=original;
      state.study.originalApplyText="";
      state.study.applyApproved=false;
      state.study.applyLastCheckedText="";
      state.study.feedback=null;
      render();
      setTimeout(()=>document.getElementById("apply-text")?.focus(),0);
      return;
    }

    if(action==="pass-apply"){
      const c=getCard(state.study.cardId);
      const latest=String(document.getElementById("apply-text")?.value??state.study.applyText??"").trim();
      const checked=Boolean(state.study.applyApproved && state.study.applyLastCheckedText===latest);
      const keyword=String(state.study.feedback?.keyword||c?.word||"").trim();

      if(!latest){toast("请先写一句话");return;}
      if(!checked){
        showNotice("需要先审核","提交后通过审核，才能进入下一步。","warn");
        return;
      }
      if(!(textContainsKeyword(latest,keyword)||sentenceUsesTargetWord(latest,c.word))){
        state.study.applyApproved=false;
        state.study.applyLastCheckedText="";
        showNotice("缺少目标词",`句子需要包含 “${c.word}” 或其常见词形。`,"warn");
        render();
        return;
      }

      state.study.applyText=latest;
      c.userSentence=latest;
      c.updatedAt=new Date().toISOString();
      saveData();
      enterInitialReview(c);
      return;
    }
'''
app = replace_region(
    app,
    '    if(action==="submit-apply"){',
    '    if(action==="initial-review-reveal"){',
    new_actions,
    'apply submit/pass actions',
)

listener = r'''    const applyText=document.getElementById("apply-text");
    if(applyText){
      const syncApplyUi=()=>{
        if(!state.study)return;
        const value=String(applyText.value||"");
        state.study.applyText=value;
        state.study.applyApproved=false;
        state.study.applyLastCheckedText="";
        const warning=document.getElementById("apply-keyword-warning");
        const word=getCard(state.study.cardId)?.word||"";
        const missing=Boolean(value.trim()&&!containsChinese(value)&&!sentenceUsesTargetWord(value,word));
        if(warning) warning.hidden=!missing;
        const pass=document.querySelector('[data-action="pass-apply"]');
        if(pass) pass.disabled=true;
        const submit=document.querySelector('[data-action="submit-apply"]');
        if(submit&&!state.study.applySubmitting) submit.textContent=containsChinese(value)?"翻译并审核":"提交审核";
        document.querySelector('.apply-review-result')?.remove();
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

'''
visual_anchor = '    const visualFile=document.getElementById("visual-file");'
if 'const syncApplyUi=()=>{' not in app:
    if visual_anchor not in app:
        raise SystemExit('missing visual-file listener anchor')
    app = app.replace(visual_anchor, listener + visual_anchor, 1)

settings_anchor = '+ `<div class="settings-list">'
if 'settings-security-banner' not in app:
    if settings_anchor not in app:
        raise SystemExit('missing settings list anchor')
    app = app.replace(
        settings_anchor,
        '+ `<div class="settings-security-banner">🔒 API Key 仅保存在本机 settings.json；Windows 桌面版使用系统加密，仓库不会包含该文件。</div><div class="settings-list">',
        1,
    )
app = app.replace('placeholder="粘贴 Learner\'s Dictionary API Key"', 'placeholder="粘贴 Dictionary API Key（仅本机）"')
app = app.replace('<p>默认：GPT-5.6 Luna · 中</p>\n            <p></p>', '')
app = app.replace('toast("词典 API Key 已保存")', 'toast("密钥已保存到本机 settings.json")')
app_path.write_text(app, encoding='utf-8')


# ---------------- public/styles.css ----------------
css_path = root / 'public' / 'styles.css'
css = css_path.read_text(encoding='utf-8')
css_marker = '/* v4.4 focused interaction + desktop polish */'
if css_marker not in css:
    css += r'''

/* v4.4 focused interaction + desktop polish */
.settings-security-banner{margin-bottom:12px;padding:11px 14px;border:1px solid #cfe3da;border-radius:12px;background:#f2faf6;color:#3f6657;font-size:11px;line-height:1.55}
.apply-stage-tight{min-height:310px}.apply-mini-hint{margin-top:5px;color:var(--muted-2);font-size:10px}
.apply-keyword-warning{margin-top:9px;padding:9px 11px;border-radius:10px;background:var(--amber-soft);color:#8b631f;font-size:11px;font-weight:750}.apply-keyword-warning[hidden]{display:none}
.apply-primary-actions.compact{display:flex;justify-content:flex-end;gap:9px;flex-wrap:wrap;margin-top:14px}
.apply-review-result{margin-top:11px;padding:11px 13px;border:1px solid var(--line);border-radius:11px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:#f8fafc}
.apply-review-result>div{display:grid;gap:3px}.apply-review-result strong{font-size:12px}.apply-review-result span{color:var(--muted);font-size:10px;line-height:1.45}
.apply-review-result.good{background:var(--green-soft);border-color:#c9eadc}.apply-review-result.good strong{color:#267052}.apply-review-result.warn{background:var(--amber-soft);border-color:#eed8ad}.apply-review-result.warn strong{color:#8b631f}.apply-review-result.pending{justify-content:flex-start;background:#f5f8fd}
.mini-spinner{width:14px;height:14px;border:2px solid #d8e2f0;border-top-color:var(--blue);border-radius:50%;animation:lexi-spin .75s linear infinite;flex:0 0 auto}@keyframes lexi-spin{to{transform:rotate(360deg)}}
.ai-keyword-chip{display:inline-flex!important;align-items:center;padding:4px 8px;border-radius:999px;background:#e8f1ff;color:var(--blue)!important;font-weight:800;white-space:nowrap}
.visual-tight{min-height:330px}.visual-tight-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
.visual-context-line.compact{margin:0;display:flex;align-items:baseline;gap:9px;padding:0;background:transparent;border:0}.visual-context-line.compact span{color:var(--muted);font-size:11px}.visual-context-line.compact strong{font-size:17px}
.visual-scene-compact{margin:4px 0 10px}.visual-scene-compact .visual-scene-input{min-height:72px}.visual-status-inline{display:flex;align-items:center;gap:9px;padding:9px 11px;margin:6px 0 10px;border-radius:10px;background:#f6f8fb;color:var(--muted);font-size:11px}.visual-status-inline.error{background:var(--red-soft);color:#a54d4d}.visual-status-inline.error strong{margin-right:4px}
.visual-preview.compact{width:min(430px,100%);margin:8px auto 0}.visual-preview.compact img{max-height:230px}.visual-generate-compact,.visual-inline-actions{display:flex;justify-content:center;gap:9px;flex-wrap:wrap;margin:16px 0 2px}.visual-inline-actions{margin-top:10px}.visual-actions.tight{margin-top:16px;padding-top:13px;border-top:1px solid var(--line-soft)}
.library-table{min-width:840px}.library-table th:first-child,.library-table td:first-child{width:78px}.library-thumb{width:54px;height:54px;border-radius:10px;overflow:hidden;display:grid;place-items:center;background:#f4f7fb;border:1px solid var(--line-soft);color:var(--muted-2)}.library-thumb img{width:100%;height:100%;object-fit:cover;display:block}
@media(max-width:760px){.apply-primary-actions.compact{justify-content:stretch}.apply-primary-actions.compact .btn{flex:1}.visual-tight-head{align-items:flex-start}.settings-security-banner{font-size:10px}}
'''
css_path.write_text(css, encoding='utf-8')


# ---------------- desktop shell ----------------
electron = r'''const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, shell } = require("electron");

app.setName("LexiFlow");
if (process.platform === "win32") app.setAppUserModelId("com.lexiflow.desktop");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let mainWindow = null;
let backend = null;
let runtimePaths = null;

function configureRuntimePaths() {
  const userData = app.getPath("userData");
  const appDataDir = path.join(userData, "app-data");
  const generatedDir = path.join(appDataDir, "generated");
  const sessionDir = path.join(userData, "chromium-session");
  fs.mkdirSync(appDataDir, { recursive: true });
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.mkdirSync(sessionDir, { recursive: true });
  app.setPath("sessionData", sessionDir);
  process.env.LEXIFLOW_DESKTOP = "1";
  process.env.LEXIFLOW_NO_OPEN = "1";
  process.env.LEXIFLOW_DATA_DIR = appDataDir;
  process.env.LEXIFLOW_GENERATED_DIR = generatedDir;
  process.env.LEXIFLOW_RUNTIME_CWD = appDataDir;
  return { userData, appDataDir, generatedDir };
}

function createBrowserWindow() {
  const iconPath = path.join(__dirname, "public", "icon.png");
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#f5f7fb",
    autoHideMenuBar: true,
    show: true,
    title: "LexiFlow · 英语词汇学习",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });
  win.setMenuBarVisibility(false);
  return win;
}

async function createWindow() {
  mainWindow = createBrowserWindow();
  await mainWindow.loadFile(path.join(__dirname, "public", "startup.html"));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  try {
    backend = require("./server");
    const started = await backend.startServer();
    mainWindow.webContents.on("will-navigate", (event, url) => {
      if (!url.startsWith(started.address)) {
        event.preventDefault();
        if (/^https:\/\//i.test(url)) shell.openExternal(url);
      }
    });
    await mainWindow.loadURL(started.address);
    mainWindow.setTitle("LexiFlow · 英语词汇学习");
    console.log(`LexiFlow desktop data: ${runtimePaths.appDataDir}`);
  } catch (err) {
    console.error("LexiFlow desktop startup failed:", err);
    const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#f5f7fb;font-family:Segoe UI,Microsoft YaHei,sans-serif;display:grid;place-items:center;height:100vh;color:#172033"><div style="text-align:center"><h2>LexiFlow</h2><p>应用没有正常启动，请关闭后重试。</p></div></body>`;
    await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(()=>{});
  }

  mainWindow.on("closed", () => { mainWindow = null; });
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

runtimePaths = configureRuntimePaths();
app.whenReady().then(createWindow).catch(err => {
  console.error("LexiFlow window startup failed:", err);
  app.quit();
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow().catch(err => console.error("LexiFlow window restore failed:", err));
});
app.on("will-quit", () => { try { backend?.stopServer?.(); } catch {} });
'''
(root / 'electron-main.js').write_text(electron, encoding='utf-8')

startup = r'''<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LexiFlow · 正在启动</title>
  <style>
    *{box-sizing:border-box}html,body{margin:0;height:100%;background:#f5f7fb;font-family:Inter,"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif;color:#172033}
    body{display:grid;place-items:center}.boot{display:grid;justify-items:center;gap:12px}.boot img{width:74px;height:74px;border-radius:18px;box-shadow:0 16px 40px rgba(42,88,205,.18)}
    .boot strong{font-size:24px;letter-spacing:-.03em}.boot span{font-size:12px;color:#7b8798}.dot{width:5px;height:5px;border-radius:50%;background:#3f73e5;box-shadow:12px 0 #8cabef,24px 0 #c7d6f8;animation:pulse 1s ease-in-out infinite alternate;margin-right:24px}@keyframes pulse{to{opacity:.35;transform:translateY(-2px)}}
  </style>
</head>
<body><div class="boot"><img src="./icon.png" alt="LexiFlow" /><strong>LexiFlow</strong><div class="dot"></div><span>正在准备学习空间</span></div></body>
</html>
'''
(root / 'public' / 'startup.html').write_text(startup, encoding='utf-8')

index_path = root / 'public' / 'index.html'
index = index_path.read_text(encoding='utf-8')
if 'rel="icon"' not in index:
    index = index.replace('<link rel="stylesheet" href="./styles.css" />', '<link rel="icon" type="image/png" href="./icon.png" />\n  <link rel="stylesheet" href="./styles.css" />')
index_path.write_text(index, encoding='utf-8')

package_path = root / 'package.json'
package = json.loads(package_path.read_text(encoding='utf-8'))
package['version'] = '0.6.0'
package['build']['directories']['buildResources'] = 'build'
package['build']['win']['icon'] = 'build/icon.ico'
package['build']['nsis']['installerIcon'] = 'build/icon.ico'
package['build']['nsis']['uninstallerIcon'] = 'build/icon.ico'
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

lock_path = root / 'package-lock.json'
if lock_path.exists():
    lock = json.loads(lock_path.read_text(encoding='utf-8'))
    lock['version'] = '0.6.0'
    if isinstance(lock.get('packages'), dict) and isinstance(lock['packages'].get(''), dict):
        lock['packages']['']['version'] = '0.6.0'
    lock_path.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# ---------------- app icon ----------------
size = 512
img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
mask = Image.new('L', (size, size), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([20, 20, 492, 492], radius=112, fill=255)
grad = Image.new('RGBA', (size, size), (0, 0, 0, 0))
gp = grad.load()
c1, c2 = (72, 124, 239), (42, 88, 205)
for y in range(size):
    for x in range(size):
        t = min(1, max(0, .65 * y / (size - 1) + .35 * x / (size - 1)))
        gp[x, y] = tuple(int(c1[i] * (1 - t) + c2[i] * t) for i in range(3)) + (255,)
img = Image.composite(grad, img, mask)
d = ImageDraw.Draw(img)
d.rounded_rectangle([114, 112, 402, 384], radius=46, fill=(255, 255, 255, 48), outline=(255, 255, 255, 70), width=3)
d.rounded_rectangle([92, 132, 378, 408], radius=48, fill=(255, 255, 255, 245))
navy = (26, 42, 68, 255)
d.rounded_rectangle([150, 188, 198, 330], radius=19, fill=navy)
d.rounded_rectangle([150, 286, 294, 334], radius=19, fill=navy)
d.ellipse([306, 174, 342, 210], fill=(134, 234, 193, 255))
d.ellipse([326, 224, 348, 246], fill=(255, 255, 255, 210))
(root / 'build').mkdir(exist_ok=True)
img.save(root / 'public' / 'icon.png')
img.save(root / 'build' / 'icon.ico', format='ICO', sizes=[(16,16),(20,20),(24,24),(32,32),(40,40),(48,48),(64,64),(128,128),(256,256)])

print('LexiFlow UX patch applied.')
