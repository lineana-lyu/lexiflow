from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    Path(path).write_text(content, encoding="utf-8")


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly 1 match, found {count}")
    return source.replace(old, new, 1)


def regex_once(source: str, pattern: str, replacement: str, label: str) -> str:
    result, count = re.subn(pattern, replacement, source, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly 1 regex match, found {count}")
    return result


# ---------------------------------------------------------------------------
# server.js
# ---------------------------------------------------------------------------
server = read("server.js")

server = replace_once(
    server,
    'const LOOKUP_CACHE_SCHEMA = "v4.1";',
    'const LOOKUP_CACHE_SCHEMA = "v4.2-audit1";',
    "bump cache schema",
)

server = regex_once(
    server,
    r"function codexStatus\(\) \{.*?\n\}\n\nfunction spawnCodex",
    '''let codexStatusCache = { at: 0, value: null };
const CODEX_STATUS_CACHE_MS = 45 * 1000;

function codexStatus(force = false) {
  if (!force && codexStatusCache.value && Date.now() - codexStatusCache.at < CODEX_STATUS_CACHE_MS) {
    return codexStatusCache.value;
  }

  const resolved = resolveCodexExecutable();
  const executable = resolved.command;
  const probe = runSync(executable, ["--version"]);
  const cfg = parseCodexConfig();
  const authFound = fs.existsSync(CODEX_AUTH);

  if (probe.status !== 0) {
    const detail = String(probe.stderr || probe.error?.message || probe.stdout || "").trim();
    if (detail) console.warn("Codex probe failed:", detail.slice(0, 800));
  }

  const value = {
    executable: path.isAbsolute(executable) ? executable : "codex (PATH)",
    executableSource: resolved.source,
    cliAvailable: probe.status === 0,
    version: probe.status === 0 ? String(probe.stdout || probe.stderr || "").trim() : "",
    probeError: probe.status === 0 ? "" : "Codex CLI 启动检测未通过",
    authPath: CODEX_AUTH,
    authFound,
    configPath: CODEX_CONFIG,
    configFound: cfg.configFound,
    model: cfg.model,
    provider: cfg.provider,
    profileModels: cfg.profileModels || [],
  };

  codexStatusCache = { at: Date.now(), value };
  return value;
}

function spawnCodex''',
    "cache Codex status",
)

server = replace_once(
    server,
    '    normalized.aiError = String(err.message || "").slice(0, 600);\n',
    '',
    "remove raw AI error from dictionary payload",
)

server = replace_once(
    server,
    '''  return hits.slice(0, 5);
}

async function resolveChineseSearch(query) {''',
    '''  return hits.slice(0, 5);
}

async function findCachedChineseLookup(query) {
  const q = String(query || "").trim();
  if (!q) return null;

  const compact = value => String(value || "").replace(/[；;、，,\\s]/g, "");
  const qCompact = compact(q);
  const cache = await loadLookupCache();
  let best = null;

  for (const [cacheKey, entry] of Object.entries(cache || {})) {
    if (!cacheKey.startsWith(LOOKUP_CACHE_SCHEMA + "|")) continue;
    const result = entry?.result;
    if (!result?.word || !Array.isArray(result?.senses)) continue;

    for (const sense of result.senses) {
      const meaning = String(sense?.meaningZh || "").trim();
      if (!meaning) continue;
      const parts = meaning.split(/[；;、，,/]/).map(x => compact(x)).filter(Boolean);
      const meaningCompact = compact(meaning);
      const distance = levenshteinDistance(meaningCompact, qCompact);

      let score = 0;
      if (meaningCompact === qCompact) score = 100;
      else if (parts.includes(qCompact)) score = 96;
      else if (meaning.includes(q) || q.includes(meaning)) score = 82;
      else if (distance <= (qCompact.length <= 3 ? 1 : 2)) score = 60;

      if (score && (!best || score > best.score)) {
        best = { score, result, meaning };
      }
    }
  }

  if (!best) return null;
  return {
    ...best.result,
    sourceQuery: q,
    normalizedQuery: best.meaning,
    autoResolved: true,
    cacheHit: true,
  };
}

async function resolveChineseSearch(query) {''',
    "add Chinese cache fast path helper",
)

server = replace_once(
    server,
    '''  const hasChinese = /[\\u3400-\\u9fff]/.test(q);
  if (hasChinese) {
    const resolved = await resolveChineseSearch(q);''',
    '''  const hasChinese = /[\\u3400-\\u9fff]/.test(q);
  if (hasChinese) {
    const cachedChinese = await findCachedChineseLookup(q);
    if (cachedChinese) return cachedChinese;

    const resolved = await resolveChineseSearch(q);''',
    "use Chinese cache fast path",
)

server = replace_once(
    server,
    '"User-Agent":"LexiFlow-Standalone-MVP/3.9"',
    '"User-Agent":"LexiFlow/4.2-audit1"',
    "update pronunciation user agent",
)

server = replace_once(
    server,
    'async function dictionaryTest() {',
    '''async function saveLocalImage(body) {
  const dataUrl = String(body?.dataUrl || "");
  const match = dataUrl.match(/^data:image\\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    const err = new Error("不支持的图片格式");
    err.code = "INVALID_IMAGE";
    throw err;
  }

  const ext = match[1] === "jpeg" ? "jpg" : match[1];
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > 1024 * 1024) {
    const err = new Error("图片大小不符合要求");
    err.code = "IMAGE_TOO_LARGE";
    throw err;
  }

  const fileName = "upload-" + Date.now() + "-" + Math.random().toString(16).slice(2, 10) + "." + ext;
  await fsp.writeFile(path.join(GENERATED_DIR, fileName), buffer);
  return { url: "/generated/" + encodeURIComponent(fileName) };
}

async function dictionaryTest() {''',
    "add local image persistence helper",
)

server = replace_once(
    server,
    '''  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }''',
    '''  const origin = String(req.headers.origin || "");
  const allowedOrigins = new Set([
    "http://" + HOST + ":" + PORT,
    "http://localhost:" + PORT,
  ]);
  const allowFileHealth = origin === "null" && req.method === "GET" && url.pathname === "/api/health";

  if (origin && !allowedOrigins.has(origin) && !allowFileHealth) {
    return sendJson(res, 403, {
      ok: false,
      code: "LOCAL_ORIGIN_REQUIRED",
      error: "请从 LexiFlow 本地页面使用此服务",
    });
  }

  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", allowFileHealth ? "null" : origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }''',
    "restrict local CORS",
)

server = replace_once(
    server,
    '    if (req.method === "POST" && url.pathname === "/api/ai/image") {',
    '''    if (req.method === "POST" && url.pathname === "/api/images/local") {
      const body = await readJsonBody(req);
      try {
        const image = await saveLocalImage(body);
        return sendJson(res, 200, { ok: true, image });
      } catch (err) {
        const friendly = {
          code: err.code || "LOCAL_IMAGE_SAVE_FAILED",
          title: err.code === "IMAGE_TOO_LARGE" ? "图片太大" : "图片没有保存成功",
          message: err.code === "IMAGE_TOO_LARGE"
            ? "请选择 1MB 以内的 PNG、JPG 或 WebP 图片。"
            : "请选择 PNG、JPG 或 WebP 图片后重试。",
        };
        return sendJson(res, 400, { ok: false, code: friendly.code, error: friendly.message, userError: friendly });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/ai/image") {''',
    "add local image route",
)

server = regex_once(
    server,
    r'''      \} catch \(err\) \{
        const runtime = await loadSettings\(\);
        lastCodexRuntimeTest = \{
          status: "failed",
          at: new Date\(\)\.toISOString\(\),
          message: String\(err\.message \|\| "AI 连接检查失败"\)\.slice\(0, 1200\),
          model: runtime\.codexModel \|\| codexStatus\(\)\.model \|\| "",
          reasoningEffort: runtime\.codexReasoningEffort \|\| "",
        \};

        return sendJson\(res, 502, \{
          ok: false,
          code: err\.code \|\| "CODEX_TEST_FAILED",
          error: lastCodexRuntimeTest\.message,
          test: lastCodexRuntimeTest,
        \}\);
      \}''',
    '''      } catch (err) {
        const runtime = await loadSettings();
        const friendly = friendlyError(err, "text");
        lastCodexRuntimeTest = {
          status: "failed",
          at: new Date().toISOString(),
          message: friendly.message,
          model: runtime.codexModel || codexStatus().model || "",
          reasoningEffort: runtime.codexReasoningEffort || "",
        };

        return sendJson(res, 502, {
          ok: false,
          code: friendly.code,
          error: friendly.message,
          userError: friendly,
          test: lastCodexRuntimeTest,
        });
      }''',
    "sanitize Codex test error",
)

server = replace_once(
    server,
    '        return sendJson(res, err.code === "DICTIONARY_KEY_MISSING" ? 400 : 502, { ok:false, code:err.code || "PRONUNCIATION_LOOKUP_FAILED", error:err.message });',
    '''        const friendly = err.code === "DICTIONARY_KEY_MISSING"
          ? { code: "DICTIONARY_KEY_MISSING", title: "需要配置词典", message: "请先在设置中填写 Merriam-Webster Learner's Dictionary Key。" }
          : friendlyError(err, "dictionary");
        return sendJson(res, err.code === "DICTIONARY_KEY_MISSING" ? 400 : 502, {
          ok:false, code:friendly.code, error:friendly.message, userError:friendly
        });''',
    "sanitize pronunciation error",
)

server = replace_once(
    server,
    '    sendJson(res, 500, { ok: false, error: "本地服务发生错误", detail: err.message });',
    '    sendJson(res, 500, { ok: false, error: "本地服务暂时无法完成这个操作" });',
    "remove top-level error detail",
)

# ---------------------------------------------------------------------------
# public/app.js
# ---------------------------------------------------------------------------
app = read("public/app.js")

app = replace_once(
    app,
    '''  async function refreshProviderStatus(silent=true){
    try{
      const payload=await api("/api/status");
      state.providerStatus=payload;
      if(!silent) toast("服务状态已刷新");
      render();
    }catch(err){
      state.providerStatus={ok:false,error:err.message,serviceUnavailable:true};
      if(!silent) showErrorNotice(err,"本地服务没有启动");
      render();
    }
  }''',
    '''  function captureProviderDraft(){
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
  }''',
    "preserve unsaved form drafts",
)

app = replace_once(
    app,
    '''        const local=localSearchCandidates(q);
        if(local.length){
          const saved=state.data.cards.find(c=>c.word.toLowerCase()===String(local[0].word).toLowerCase());
          if(saved){''',
    '''        const local=localSearchCandidates(q);
        const qNormalized=normalizeSearchText(q);
        const saved=local.length
          ? state.data.cards.find(c=>c.word.toLowerCase()===String(local[0].word).toLowerCase())
          : null;
        const exactLocal=Boolean(saved&&(
          normalizeSearchText(saved.word)===qNormalized ||
          String(saved.meaningZh||"").split(/[；;、，,/]/).some(part=>normalizeSearchText(part)===qNormalized)
        ));
        if(exactLocal){
          if(saved){''',
    "avoid fuzzy local hijack",
)

app = replace_once(
    app,
    '      const q=state.lookup?.query?.trim()||state.lookup?.result?.word||"";',
    '      const q=state.lookup?.result?.word||state.lookup?.query?.trim()||"";',
    "expanded lookup uses resolved English word",
)

app = replace_once(
    app,
    '''  function activeLearningCards(){
    return state.data.cards.filter(c=>c.stage!=="review" && c.stage!=="mastered");
  }''',
    '''  function activeLearningCards(){
    return state.data.cards.filter(c=>c.initialReviewPending || (c.stage!=="review" && c.stage!=="mastered"));
  }''',
    "resume pending initial review",
)

app = replace_once(
    app,
    '''    if(stage==="visualize") return stageVisual(card);
    if(stage==="apply") return stageApply(card);
    return `<div class="study-center"><strong class="prompt-big">首次学习已完成</strong><p class="prompt-small">这张卡片已经进入复习队列。</p><button class="btn primary" data-route="home">返回今日学习</button></div>`;''',
    '''    if(stage==="visualize") return stageVisual(card);
    if(stage==="apply") return stageApply(card);
    if(stage==="review" && card.initialReviewPending) return stageInitialReview(card);
    return `<div class="study-center"><strong class="prompt-big">首次学习已完成</strong><p class="prompt-small">这张卡片已经进入复习队列。</p><button class="btn primary" data-route="home">返回今日学习</button></div>`;''',
    "render initial review stage",
)

app = replace_once(
    app,
    '  function localFeedback(text,word){',
    '''  function stageInitialReview(card){
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

  function localFeedback(text,word){''',
    "add initial review UI",
)

app = replace_once(
    app,
    '''  function finishInitialReview(card, quality){
    const now=new Date();
    card.stage="review";
    card.reviewCount=(card.reviewCount||0)+1;
    card.lastReviewedAt=now.toISOString();
    card.nextReviewAt=addDays(now, quality==="good"?3:1).toISOString();
    card.updatedAt=now.toISOString();
    recordActivity("review",card.id,{quality,kind:"initial"});
    saveData();
    toast("首次学习完成，已加入复习队列");
    state.study=null;state.route="home";render();
  }''',
    '''  function enterInitialReview(card){
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
  }''',
    "separate apply and initial review",
)

app = replace_once(
    app,
    '      finishInitialReview(c,"good");',
    '      enterInitialReview(c);',
    "apply enters initial review",
)

app = replace_once(
    app,
    '    if(action==="start-review"){startReview();return;}',
    '''    if(action==="initial-review-reveal"){
      if(state.study) state.study.revealed=true;
      render();
      return;
    }
    if(action==="initial-review-rate"){
      const c=state.study?.cardId?getCard(state.study.cardId):null;
      if(c&&c.initialReviewPending) finishInitialReview(c,el.dataset.quality);
      return;
    }
    if(action==="start-review"){startReview();return;}''',
    "wire initial review actions",
)

app = replace_once(
    app,
    '<button class="btn primary" data-action="submit-apply">获取 AI 建议</button>',
    '<button class="btn primary" data-action="submit-apply" ${state.study.applySubmitting?"disabled":""}>${state.study.applySubmitting?"正在获取建议…":"获取 AI 建议"}</button>',
    "disable duplicate apply AI request",
)

app = regex_once(
    app,
    r'''    if\(action==="submit-apply"\)\{.*?\n      return;\n    \}\n    if\(action==="apply-ai-suggestion"\)\{''',
    '''    if(action==="submit-apply"){
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
    if(action==="apply-ai-suggestion"){''',
    "route-safe apply request",
)

app = regex_once(
    app,
    r'''    if\(action==="generate-visual"\)\{.*?\n      return;\n    \}\n    if\(action==="skip-visual"\|\|action==="finish-visual"\)\{''',
    '''    if(action==="generate-visual"){
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
    if(action==="skip-visual"||action==="finish-visual"){''',
    "route-safe image request",
)

app = regex_once(
    app,
    r'''    const visualFile=document\.getElementById\("visual-file"\);.*?    \}\);\n\n    document\.querySelectorAll\("\[data-delete-card\]"\)''',
    '''    const visualFile=document.getElementById("visual-file");
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

    document.querySelectorAll("[data-delete-card]")''',
    "move local image out of localStorage",
)

app = replace_once(
    app,
    '    if(!raw)return "音标加载中…";',
    '    if(!raw)return "暂无音标";',
    "fix permanent phonetic loading",
)

app = replace_once(
    app,
    '${r.aiEnriched===false?`<div class="feedback warn"><h4>Codex 文本处理没有成功</h4><ul><li>词典查询已成功，但中文释义/翻译需要你手动补充。</li>${r.aiError?`<li>运行信息：${escapeHtml(r.aiError)}</li>`:""}</ul></div>`:""}',
    '${r.aiEnriched===false?`<div class="feedback warn"><h4>中文释义暂未整理完成</h4><ul><li>英文词典结果已经找到，你可以稍后重试，或直接手动补充中文释义与例句。</li></ul></div>`:""}',
    "hide raw dictionary error",
)

app = replace_once(
    app,
    '''"LEXIFLOW · SETTINGS",
        "设置",
        "词典 Key 在这里配置；Codex 认证继续使用本机 auth.json，模型和思考强度只作为 LexiFlow 每次调用时的运行参数。",''',
    '''"设置",
        "设置",
        "配置词典与 AI 服务。认证仍由本机 Codex 安全管理，LexiFlow 不读取你的登录凭据。",''',
    "productize settings header",
)

app = replace_once(app, '<h3>本地 Codex · 运行状态</h3>', '<h3>AI 服务</h3>', "AI settings title")
app = replace_once(
    app,
    '''<p>认证文件：${escapeHtml(codex?.authPath||"等待本地服务返回")}</p>
              <p>Codex 默认模型：${escapeHtml(codex?.model||"未从 config.toml 读取到")}</p>
              ${codex?.probeError?`<p>Codex 检测提示：${escapeHtml(codex.probeError)}</p>`:""}''',
    '<p>默认模型：${escapeHtml(codex?.model||"跟随 Codex 默认配置")}</p>',
    "hide technical settings details",
)
app = replace_once(
    app,
    '<span class="pill ${codex?.cliAvailable?"green":"red"}">${codex?.cliAvailable?"CLI 已检测":"CLI 不可用"}</span>',
    '<span class="pill ${codex?.cliAvailable?"green":"red"}">${codex?.cliAvailable?"AI 已连接":"AI 未连接"}</span>',
    "productize AI badge",
)
app = replace_once(app, '<h3>Codex 模型与思考强度</h3>', '<h3>模型与思考强度</h3>', "model settings title")
app = replace_once(app, '<h3>本地 Codex · 图片 AI</h3>', '<h3>图片生成</h3>', "image settings title")

app = replace_once(
    app,
    '    if(search) search.addEventListener("input",e=>{state.librarySearch=e.target.value;render();});',
    '''    if(search) search.addEventListener("input",e=>{
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
    });''',
    "preserve library search focus",
)

# ---------------------------------------------------------------------------
# public/styles.css
# ---------------------------------------------------------------------------
styles = read("public/styles.css")
if "/* audit round 1 */" not in styles:
    styles += '''\n\n/* audit round 1 */
/* Avoid replaying a full-page entrance animation on every state-driven render. */
.content{animation:none}
.btn:disabled{transform:none!important;box-shadow:none!important}
'''

# ---------------------------------------------------------------------------
# README.md
# ---------------------------------------------------------------------------
readme = read("README.md")
if "## MVP Audit Round 1" not in readme:
    readme += '''\n\n## MVP Audit Round 1

本轮在继续扩展功能前先修复稳定性与业务正确性问题：

- Apply 不再自动算作“首次复习完成”；用户必须真正完成首次主动回忆后才进入后续复习计划。
- 中文查词展开其它义项时使用最终英文词条，不会把中文原始输入直接发给英文词典接口。
- 本地服务只接受 LexiFlow 自身来源，不再对任意网页开放跨域写入/AI 调用。
- 图片生成和造句 AI 在用户退出页面后不会继续写入已经销毁的学习会话状态。
- 本地上传图片写入 generated 目录，不再把大体积 base64 图片塞进 localStorage。
- 中文重复查询可以命中新版缓存 fast path；Codex CLI 状态短时间缓存，减少重复启动探测。
- 设置/搜索后台状态刷新会保留尚未提交的输入。
- 普通界面不再展示 Codex 底层错误字符串、认证文件路径等开发者信息。
- 词典缓存 schema 升级，旧版错误/缺字段缓存不会继续命中。
- 无可用 IPA 时明确显示“暂无音标”，不再永久显示“音标加载中”。
'''

write("server.js", server)
write("public/app.js", app)
write("public/styles.css", styles)
write("README.md", readme)

print("Audit round 1 patch applied successfully")
