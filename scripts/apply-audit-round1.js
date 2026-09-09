const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function write(file, value) {
  fs.writeFileSync(file, value, 'utf8');
}

function replaceLiteral(source, from, to, label) {
  const count = source.split(from).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly 1 literal match, found ${count}`);
  }
  return source.replace(from, to);
}

function replaceRegex(source, regex, to, label) {
  const matches = source.match(regex);
  if (!matches) {
    throw new Error(`${label}: regex did not match`);
  }
  return source.replace(regex, to);
}

// ---------------------------------------------------------------------------
// server.js
// ---------------------------------------------------------------------------
let server = read('server.js');

server = replaceLiteral(
  server,
  'const LOOKUP_CACHE_SCHEMA = "v4.1";',
  'const LOOKUP_CACHE_SCHEMA = "v4.2-audit1";',
  'bump dictionary cache schema'
);

server = replaceRegex(
  server,
  /function codexStatus\(\) \{[\s\S]*?\n\}\n\nfunction spawnCodex/,
  `let codexStatusCache = { at: 0, value: null };\nconst CODEX_STATUS_CACHE_MS = 45 * 1000;\n\nfunction codexStatus(force = false) {\n  if (!force && codexStatusCache.value && Date.now() - codexStatusCache.at < CODEX_STATUS_CACHE_MS) {\n    return codexStatusCache.value;\n  }\n\n  const resolved = resolveCodexExecutable();\n  const executable = resolved.command;\n  const probe = runSync(executable, ["--version"]);\n  const cfg = parseCodexConfig();\n  const authFound = fs.existsSync(CODEX_AUTH);\n\n  if (probe.status !== 0) {\n    const detail = String(probe.stderr || probe.error?.message || probe.stdout || "").trim();\n    if (detail) console.warn("Codex probe failed:", detail.slice(0, 800));\n  }\n\n  const value = {\n    executable: path.isAbsolute(executable) ? executable : "codex (PATH)",\n    executableSource: resolved.source,\n    cliAvailable: probe.status === 0,\n    version: probe.status === 0 ? String(probe.stdout || probe.stderr || "").trim() : "",\n    probeError: probe.status === 0 ? "" : "Codex CLI 启动检测未通过",\n    authPath: CODEX_AUTH,\n    authFound,\n    configPath: CODEX_CONFIG,\n    configFound: cfg.configFound,\n    model: cfg.model,\n    provider: cfg.provider,\n    profileModels: cfg.profileModels || [],\n  };\n\n  codexStatusCache = { at: Date.now(), value };\n  return value;\n}\n\nfunction spawnCodex`,
  'cache Codex status'
);

server = replaceLiteral(
  server,
  '    normalized.aiError = String(err.message || "").slice(0, 600);\n',
  '',
  'remove raw dictionary AI error from response'
);

server = replaceLiteral(
  server,
  '  return hits.slice(0, 5);\n}\n\nasync function resolveChineseSearch(query) {',
  `  return hits.slice(0, 5);\n}\n\nasync function findCachedChineseLookup(query) {\n  const q = String(query || "").trim();\n  if (!q) return null;\n\n  const compact = value => String(value || "").replace(/[；;、，,\\s]/g, "");\n  const qCompact = compact(q);\n  const cache = await loadLookupCache();\n  let best = null;\n\n  for (const [cacheKey, entry] of Object.entries(cache || {})) {\n    if (!cacheKey.startsWith(LOOKUP_CACHE_SCHEMA + "|")) continue;\n    const result = entry?.result;\n    if (!result?.word || !Array.isArray(result?.senses)) continue;\n\n    for (const sense of result.senses) {\n      const meaning = String(sense?.meaningZh || "").trim();\n      if (!meaning) continue;\n      const parts = meaning.split(/[；;、，,/]/).map(x => compact(x)).filter(Boolean);\n      const meaningCompact = compact(meaning);\n      const distance = levenshteinDistance(meaningCompact, qCompact);\n\n      let score = 0;\n      if (meaningCompact === qCompact) score = 100;\n      else if (parts.includes(qCompact)) score = 96;\n      else if (meaning.includes(q) || q.includes(meaning)) score = 82;\n      else if (distance <= (qCompact.length <= 3 ? 1 : 2)) score = 60;\n\n      if (score && (!best || score > best.score)) {\n        best = { score, result, meaning };\n      }\n    }\n  }\n\n  if (!best) return null;\n  return {\n    ...best.result,\n    sourceQuery: q,\n    normalizedQuery: best.meaning,\n    autoResolved: true,\n    cacheHit: true,\n  };\n}\n\nasync function resolveChineseSearch(query) {`,
  'add Chinese cache fast path helper'
);

server = replaceLiteral(
  server,
  '  const hasChinese = /[\\u3400-\\u9fff]/.test(q);\n  if (hasChinese) {\n    const resolved = await resolveChineseSearch(q);',
  '  const hasChinese = /[\\u3400-\\u9fff]/.test(q);\n  if (hasChinese) {\n    const cachedChinese = await findCachedChineseLookup(q);\n    if (cachedChinese) return cachedChinese;\n\n    const resolved = await resolveChineseSearch(q);',
  'use Chinese cache fast path'
);

server = replaceLiteral(
  server,
  '"User-Agent":"LexiFlow-Standalone-MVP/3.9"',
  '"User-Agent":"LexiFlow/4.2-audit1"',
  'update pronunciation user agent'
);

server = replaceLiteral(
  server,
  'async function dictionaryTest() {',
  `async function saveLocalImage(body) {\n  const dataUrl = String(body?.dataUrl || "");\n  const match = dataUrl.match(/^data:image\\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);\n  if (!match) {\n    const err = new Error("不支持的图片格式");\n    err.code = "INVALID_IMAGE";\n    throw err;\n  }\n\n  const ext = match[1] === "jpeg" ? "jpg" : match[1];\n  const buffer = Buffer.from(match[2], "base64");\n  if (!buffer.length || buffer.length > 1024 * 1024) {\n    const err = new Error("图片大小不符合要求");\n    err.code = "IMAGE_TOO_LARGE";\n    throw err;\n  }\n\n  const fileName = \\`upload-\\${Date.now()}-\\${Math.random().toString(16).slice(2, 10)}.\\${ext}\\`;\n  await fsp.writeFile(path.join(GENERATED_DIR, fileName), buffer);\n  return { url: \\`/generated/\\${encodeURIComponent(fileName)}\\` };\n}\n\nasync function dictionaryTest() {`,
  'add local image persistence endpoint helper'
);

server = replaceLiteral(
  server,
  `  res.setHeader("Access-Control-Allow-Origin", "*");\n  res.setHeader("Access-Control-Allow-Headers", "Content-Type");\n  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");\n  if (req.method === "OPTIONS") {\n    res.writeHead(204);\n    res.end();\n    return;\n  }`,
  `  const origin = String(req.headers.origin || "");\n  const allowedOrigins = new Set([\n    \\`http://\\${HOST}:\\${PORT}\\`,\n    \\`http://localhost:\\${PORT}\\`,\n  ]);\n  const allowFileHealth = origin === "null" && req.method === "GET" && url.pathname === "/api/health";\n\n  if (origin && !allowedOrigins.has(origin) && !allowFileHealth) {\n    return sendJson(res, 403, {\n      ok: false,\n      code: "LOCAL_ORIGIN_REQUIRED",\n      error: "请从 LexiFlow 本地页面使用此服务",\n    });\n  }\n\n  if (origin) {\n    res.setHeader("Access-Control-Allow-Origin", allowFileHealth ? "null" : origin);\n    res.setHeader("Vary", "Origin");\n  }\n  res.setHeader("Access-Control-Allow-Headers", "Content-Type");\n  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");\n  if (req.method === "OPTIONS") {\n    res.writeHead(204);\n    res.end();\n    return;\n  }`,
  'restrict local service CORS'
);

server = replaceLiteral(
  server,
  '    if (req.method === "POST" && url.pathname === "/api/ai/image") {',
  `    if (req.method === "POST" && url.pathname === "/api/images/local") {\n      const body = await readJsonBody(req);\n      try {\n        const image = await saveLocalImage(body);\n        return sendJson(res, 200, { ok: true, image });\n      } catch (err) {\n        const friendly = {\n          code: err.code || "LOCAL_IMAGE_SAVE_FAILED",\n          title: err.code === "IMAGE_TOO_LARGE" ? "图片太大" : "图片没有保存成功",\n          message: err.code === "IMAGE_TOO_LARGE"\n            ? "请选择 1MB 以内的 PNG、JPG 或 WebP 图片。"\n            : "请选择 PNG、JPG 或 WebP 图片后重试。",\n        };\n        return sendJson(res, 400, { ok: false, code: friendly.code, error: friendly.message, userError: friendly });\n      }\n    }\n\n    if (req.method === "POST" && url.pathname === "/api/ai/image") {`,
  'add local image API route'
);

server = replaceRegex(
  server,
  /      \} catch \(err\) \{\n        const runtime = await loadSettings\(\);\n        lastCodexRuntimeTest = \{\n          status: "failed",\n          at: new Date\(\)\.toISOString\(\),\n          message: String\(err\.message \|\| "AI 连接检查失败"\)\.slice\(0, 1200\),\n          model: runtime\.codexModel \|\| codexStatus\(\)\.model \|\| "",\n          reasoningEffort: runtime\.codexReasoningEffort \|\| "",\n        \};\n\n        return sendJson\(res, 502, \{\n          ok: false,\n          code: err\.code \|\| "CODEX_TEST_FAILED",\n          error: lastCodexRuntimeTest\.message,\n          test: lastCodexRuntimeTest,\n        \}\);\n      \}/,
  `      } catch (err) {\n        const runtime = await loadSettings();\n        const friendly = friendlyError(err, "text");\n        lastCodexRuntimeTest = {\n          status: "failed",\n          at: new Date().toISOString(),\n          message: friendly.message,\n          model: runtime.codexModel || codexStatus().model || "",\n          reasoningEffort: runtime.codexReasoningEffort || "",\n        };\n\n        return sendJson(res, 502, {\n          ok: false,\n          code: friendly.code,\n          error: friendly.message,\n          userError: friendly,\n          test: lastCodexRuntimeTest,\n        });\n      }`,
  'sanitize Codex connection test failure'
);

server = replaceLiteral(
  server,
  '        return sendJson(res, err.code === "DICTIONARY_KEY_MISSING" ? 400 : 502, { ok:false, code:err.code || "PRONUNCIATION_LOOKUP_FAILED", error:err.message });',
  `        const friendly = err.code === "DICTIONARY_KEY_MISSING"\n          ? { code: "DICTIONARY_KEY_MISSING", title: "需要配置词典", message: "请先在设置中填写 Merriam-Webster Learner's Dictionary Key。" }\n          : friendlyError(err, "dictionary");\n        return sendJson(res, err.code === "DICTIONARY_KEY_MISSING" ? 400 : 502, {\n          ok:false, code:friendly.code, error:friendly.message, userError:friendly\n        });`,
  'sanitize pronunciation error'
);

server = replaceLiteral(
  server,
  '    sendJson(res, 500, { ok: false, error: "本地服务发生错误", detail: err.message });',
  '    sendJson(res, 500, { ok: false, error: "本地服务暂时无法完成这个操作" });',
  'remove raw top-level server error detail'
);

// ---------------------------------------------------------------------------
// public/app.js
// ---------------------------------------------------------------------------
let app = read('public/app.js');

app = replaceLiteral(
  app,
  `  async function refreshProviderStatus(silent=true){\n    try{\n      const payload=await api("/api/status");\n      state.providerStatus=payload;\n      if(!silent) toast("服务状态已刷新");\n      render();\n    }catch(err){\n      state.providerStatus={ok:false,error:err.message,serviceUnavailable:true};\n      if(!silent) showErrorNotice(err,"本地服务没有启动");\n      render();\n    }\n  }`,
  `  function captureProviderDraft(){\n    const ids=["word-input","mw-api-key","codex-model-select","codex-model-custom","codex-effort"];\n    const values={};\n    for(const id of ids){\n      const el=document.getElementById(id);\n      if(el) values[id]=el.value;\n    }\n    const active=document.activeElement;\n    return {\n      values,\n      activeId:active?.id||"",\n      selectionStart:typeof active?.selectionStart==="number"?active.selectionStart:null,\n      selectionEnd:typeof active?.selectionEnd==="number"?active.selectionEnd:null\n    };\n  }\n\n  function restoreProviderDraft(draft){\n    if(!draft)return;\n    for(const [id,value] of Object.entries(draft.values||{})){\n      const el=document.getElementById(id);\n      if(el) el.value=value;\n    }\n    const modelSelect=document.getElementById("codex-model-select");\n    const custom=document.getElementById("codex-model-custom");\n    if(modelSelect&&custom) custom.style.display=modelSelect.value==="__custom__"?"block":"none";\n    const active=draft.activeId&&document.getElementById(draft.activeId);\n    if(active){\n      active.focus();\n      if(draft.selectionStart!==null&&typeof active.setSelectionRange==="function"){\n        active.setSelectionRange(draft.selectionStart,draft.selectionEnd??draft.selectionStart);\n      }\n    }\n  }\n\n  async function refreshProviderStatus(silent=true){\n    try{\n      const payload=await api("/api/status");\n      const draft=captureProviderDraft();\n      state.providerStatus=payload;\n      if(!silent) state.toast="服务状态已刷新";\n      render();\n      restoreProviderDraft(draft);\n      if(!silent){\n        const msg=state.toast;\n        setTimeout(()=>{if(state.toast===msg){state.toast="";render();}},2200);\n      }\n    }catch(err){\n      const draft=captureProviderDraft();\n      state.providerStatus={ok:false,serviceUnavailable:true};\n      if(!silent){\n        const user=err?.userError||err?.payload?.userError;\n        state.notice={\n          title:String(user?.title||"本地服务没有启动"),\n          message:String(user?.message||"请通过“启动LexiFlow.bat”启动应用后重试。"),\n          tone:"error"\n        };\n      }\n      render();\n      restoreProviderDraft(draft);\n    }\n  }`,
  'preserve unsaved provider/search drafts during refresh'
);

app = replaceLiteral(
  app,
  `        const local=localSearchCandidates(q);\n        if(local.length){\n          const saved=state.data.cards.find(c=>c.word.toLowerCase()===String(local[0].word).toLowerCase());\n          if(saved){`,
  `        const local=localSearchCandidates(q);\n        const qNormalized=normalizeSearchText(q);\n        const saved=local.length\n          ? state.data.cards.find(c=>c.word.toLowerCase()===String(local[0].word).toLowerCase())\n          : null;\n        const exactLocal=Boolean(saved&&(\n          normalizeSearchText(saved.word)===qNormalized ||\n          String(saved.meaningZh||"").split(/[；;、，,/]/).some(part=>normalizeSearchText(part)===qNormalized)\n        ));\n        if(exactLocal){\n          if(saved){`,
  'avoid fuzzy local-card hijacking'
);

app = replaceLiteral(
  app,
  `            return;\n          }\n        }\n\n        const payload=await api("/api/search/smart"`,
  `            return;\n          }\n        }\n\n        const payload=await api("/api/search/smart"`,
  'retain local search block shape'
);

app = replaceLiteral(
  app,
  '      const q=state.lookup?.query?.trim()||state.lookup?.result?.word||"";',
  '      const q=state.lookup?.result?.word||state.lookup?.query?.trim()||"";',
  'expanded meanings use resolved English word'
);

app = replaceLiteral(
  app,
  `  function activeLearningCards(){\n    return state.data.cards.filter(c=>c.stage!=="review" && c.stage!=="mastered");\n  }`,
  `  function activeLearningCards(){\n    return state.data.cards.filter(c=>c.initialReviewPending || (c.stage!=="review" && c.stage!=="mastered"));\n  }`,
  'keep pending initial review resumable'
);

app = replaceLiteral(
  app,
  `    if(stage==="visualize") return stageVisual(card);\n    if(stage==="apply") return stageApply(card);\n    return \\`<div class="study-center"><strong class="prompt-big">首次学习已完成</strong><p class="prompt-small">这张卡片已经进入复习队列。</p><button class="btn primary" data-route="home">返回今日学习</button></div>\\`;`,
  `    if(stage==="visualize") return stageVisual(card);\n    if(stage==="apply") return stageApply(card);\n    if(stage==="review" && card.initialReviewPending) return stageInitialReview(card);\n    return \\`<div class="study-center"><strong class="prompt-big">首次学习已完成</strong><p class="prompt-small">这张卡片已经进入复习队列。</p><button class="btn primary" data-route="home">返回今日学习</button></div>\\`;`,
  'render real initial review stage'
);

app = replaceLiteral(
  app,
  '  function localFeedback(text,word){',
  `  function stageInitialReview(card){\n    return \\`\${stageKicker("首次复习 · 主动回忆")}\n      <div class="study-center">\n        \${wordIdentity(card,{size:"hero",showPos:true,center:true})}\n        <div class="prompt-small">先回忆中文释义，再查看答案。完成这一步后才会真正进入后续复习计划。</div>\n        \${state.study?.revealed?\\`\n          <div class="memory-answer-card">\n            <div class="memory-answer-meaning">\${escapeHtml(card.meaningZh)}</div>\n            <div class="memory-example-section compact-example">\n              <div class="memory-example-label">例句</div>\n              <div class="memory-example-en">\${escapeHtml(card.exampleEn)}</div>\n              <div class="memory-example-zh">\${escapeHtml(card.exampleZh)}</div>\n            </div>\n          </div>\n          <div class="rating-row">\n            <button class="btn" data-action="initial-review-rate" data-quality="again">没记住 · 明天再复习</button>\n            <button class="btn primary" data-action="initial-review-rate" data-quality="good">记住了 · 3 天后复习</button>\n          </div>\n        \\`:\\`<button class="btn primary" style="margin-top:22px" data-action="initial-review-reveal">查看答案</button>\\`}\n      </div>\\`;\n  }\n\n  function localFeedback(text,word){`,
  'add initial review UI'
);

app = replaceLiteral(
  app,
  `  function finishInitialReview(card, quality){\n    const now=new Date();\n    card.stage="review";\n    card.reviewCount=(card.reviewCount||0)+1;\n    card.lastReviewedAt=now.toISOString();\n    card.nextReviewAt=addDays(now, quality==="good"?3:1).toISOString();\n    card.updatedAt=now.toISOString();\n    recordActivity("review",card.id,{quality,kind:"initial"});\n    saveData();\n    toast("首次学习完成，已加入复习队列");\n    state.study=null;state.route="home";render();\n  }`,
  `  function enterInitialReview(card){\n    card.stage="review";\n    card.initialReviewPending=true;\n    card.nextReviewAt=null;\n    card.updatedAt=new Date().toISOString();\n    recordActivity("stage-complete",card.id,{stage:"initial-review-ready"});\n    saveData();\n    state.study.revealed=false;\n    state.study.feedback=null;\n    render();\n  }\n\n  function finishInitialReview(card, quality){\n    const now=new Date();\n    card.stage="review";\n    card.initialReviewPending=false;\n    card.reviewCount=(card.reviewCount||0)+1;\n    card.lastReviewedAt=now.toISOString();\n    card.nextReviewAt=addDays(now, quality==="good"?3:1).toISOString();\n    card.updatedAt=now.toISOString();\n    recordActivity("review",card.id,{quality,kind:"initial"});\n    saveData();\n    toast("首次复习完成，已加入后续复习计划");\n    state.study=null;state.route="home";render();\n  }`,
  'separate Apply completion from first Review completion'
);

app = replaceLiteral(
  app,
  '      finishInitialReview(c,"good");',
  '      enterInitialReview(c);',
  'Apply now enters initial review instead of auto-completing it'
);

app = replaceLiteral(
  app,
  '    if(action==="start-review"){startReview();return;}',
  `    if(action==="initial-review-reveal"){\n      if(state.study) state.study.revealed=true;\n      render();\n      return;\n    }\n    if(action==="initial-review-rate"){\n      const c=state.study?.cardId?getCard(state.study.cardId):null;\n      if(c&&c.initialReviewPending) finishInitialReview(c,el.dataset.quality);\n      return;\n    }\n    if(action==="start-review"){startReview();return;}`,
  'wire initial review actions'
);

app = replaceLiteral(
  app,
  '<button class="btn primary" data-action="submit-apply">获取 AI 建议</button>',
  '<button class="btn primary" data-action="submit-apply" ${state.study.applySubmitting?"disabled":""}>${state.study.applySubmitting?"正在获取建议…":"获取 AI 建议"}</button>',
  'disable duplicate Apply AI requests'
);

app = replaceRegex(
  app,
  /    if\(action==="submit-apply"\)\{[\s\S]*?\n      return;\n    \}\n    if\(action==="apply-ai-suggestion"\)\{/,
  `    if(action==="submit-apply"){\n      if(!state.study||state.study.applySubmitting)return;\n      const cardId=state.study.cardId;\n      const sentence=document.getElementById("apply-text")?.value||"";\n      const c=getCard(cardId);\n      if(!c)return;\n\n      state.study.applyText=sentence;\n      state.study.aiSuggestionApplied=false;\n\n      if(sentence.trim() && !state.study.originalApplyText){\n        state.study.originalApplyText=sentence;\n      }\n\n      if(!sentence.trim()){\n        state.study.feedback=localFeedback(sentence,c.word);\n        render();\n        return;\n      }\n\n      state.study.applySubmitting=true;\n      state.study.feedback={\n        level:"warn",\n        title:"AI 正在分析…",\n        tips:["正在整理这句话的用法建议。"],\n        suggestedSentence:""\n      };\n      render();\n\n      try{\n        const payload=await api("/api/ai/text",{\n          method:"POST",\n          body:{word:c.word,meaningZh:c.meaningZh,sentence}\n        });\n        if(state.study?.cardId!==cardId)return;\n        const fb=payload.feedback||{};\n        state.study.feedback={\n          level:fb.level||"warn",\n          title:fb.title||"AI 反馈",\n          tips:Array.isArray(fb.tips)?fb.tips:[],\n          suggestedSentence:String(fb.suggestion||"").trim()\n        };\n      }catch(err){\n        if(state.study?.cardId!==cardId)return;\n        const fallback=localFeedback(sentence,c.word);\n        state.study.feedback={\n          ...fallback,\n          title:"AI 暂时没有返回，已完成基础检查",\n          suggestedSentence:""\n        };\n      }finally{\n        if(state.study?.cardId===cardId){\n          state.study.applySubmitting=false;\n          render();\n        }\n      }\n      return;\n    }\n    if(action==="apply-ai-suggestion"){`,
  'make Apply async request route-safe'
);

app = replaceRegex(
  app,
  /    if\(action==="generate-visual"\)\{[\s\S]*?\n      return;\n    \}\n    if\(action==="skip-visual"\|\|action==="finish-visual"\)\{/,
  `    if(action==="generate-visual"){\n      if(!state.study||state.study.imageGenerating)return;\n      const cardId=state.study.cardId;\n      const c=getCard(cardId);\n      if(!c)return;\n\n      const note=document.getElementById("visual-note")?.value.trim()??String(state.study.visualNote||"").trim();\n      state.study.visualNote=note;\n      state.study.imageGenerating=true;\n\n      c.visualNote=note;\n      c.imageGeneration={\n        status:"generating",\n        message:"正在生成联想图，这一步可能需要一些时间。",\n        code:"",\n        startedAt:new Date().toISOString()\n      };\n      c.updatedAt=new Date().toISOString();\n      saveData();\n      render();\n\n      try{\n        const payload=await api("/api/ai/image",{\n          method:"POST",\n          body:{\n            word:c.word,\n            meaningZh:c.meaningZh,\n            exampleEn:c.exampleEn,\n            visualNote:note,\n            sourceQuery:c.sourceQuery||c.word,\n            senseIntentEn:c.senseIntentEn||"",\n            avoidVisualEn:c.avoidVisualEn||[]\n          }\n        });\n\n        c.imageUrl=payload.image.url;\n        c.imageData="";\n        c.generatedVisualScene=String(payload.image.visualNote||note||"").trim();\n        c.imageGeneration={\n          status:"success",\n          message:note?"已按你提供的场景描述生成图片。":"已根据当前词义生成图片。",\n          code:"",\n          startedAt:c.imageGeneration?.startedAt||"",\n          finishedAt:new Date().toISOString()\n        };\n        c.updatedAt=new Date().toISOString();\n        saveData();\n        if(state.study?.cardId===cardId) toast("联想图生成成功");\n      }catch(err){\n        const user=err?.userError||err?.payload?.userError;\n        c.imageGeneration={\n          status:"error",\n          message:user?.message||"这次没有生成成功。你可以重试、上传本地图或暂时跳过。",\n          code:err.code||"IMAGE_GENERATION_FAILED",\n          startedAt:c.imageGeneration?.startedAt||"",\n          finishedAt:new Date().toISOString()\n        };\n        c.updatedAt=new Date().toISOString();\n        saveData();\n        if(state.study?.cardId===cardId) toast("图片没有生成成功，处理建议已保留在页面");\n      }finally{\n        if(state.study?.cardId===cardId){\n          state.study.imageGenerating=false;\n          render();\n        }\n      }\n      return;\n    }\n    if(action==="skip-visual"||action==="finish-visual"){`,
  'make Visualize async request route-safe'
);

app = replaceRegex(
  app,
  /    const visualFile=document\.getElementById\("visual-file"\);[\s\S]*?    \}\);\n\n    document\.querySelectorAll\("\[data-delete-card\]"\)/,
  `    const visualFile=document.getElementById("visual-file");\n    if(visualFile) visualFile.addEventListener("change",e=>{\n      const file=e.target.files?.[0];if(!file)return;\n      if(file.size>900*1024){showNotice("图片太大","请选择小于 900KB 的 PNG、JPG 或 WebP 图片。","warn");return;}\n      const cardId=state.study?.cardId;\n      if(!cardId)return;\n      const reader=new FileReader();\n      reader.onload=async()=>{\n        try{\n          const payload=await api("/api/images/local",{method:"POST",body:{dataUrl:String(reader.result||"")}});\n          const c=getCard(cardId);\n          if(!c)return;\n          c.imageData="";\n          c.imageUrl=payload.image.url;\n          c.generatedVisualScene="";\n          c.imageGeneration={status:"success",message:"已使用本地上传图片。",code:"LOCAL_UPLOAD",finishedAt:new Date().toISOString()};\n          c.updatedAt=new Date().toISOString();\n          saveData();\n          if(state.study?.cardId===cardId) render();\n        }catch(err){\n          if(state.study?.cardId===cardId) showErrorNotice(err,"图片没有保存成功");\n        }\n      };\n      reader.readAsDataURL(file);\n    });\n\n    document.querySelectorAll("[data-delete-card]")`,
  'store uploaded images outside localStorage'
);

app = replaceLiteral(
  app,
  '    if(!raw)return "音标加载中…";',
  '    if(!raw)return "暂无音标";',
  'avoid permanent phonetic loading state'
);

app = replaceLiteral(
  app,
  '${r.aiEnriched===false?`<div class="feedback warn"><h4>Codex 文本处理没有成功</h4><ul><li>词典查询已成功，但中文释义/翻译需要你手动补充。</li>${r.aiError?`<li>运行信息：${escapeHtml(r.aiError)}</li>`:""}</ul></div>`:""}',
  '${r.aiEnriched===false?`<div class="feedback warn"><h4>中文释义暂未整理完成</h4><ul><li>英文词典结果已经找到，你可以稍后重试，或直接手动补充中文释义与例句。</li></ul></div>`:""}',
  'hide raw dictionary AI error'
);

app = replaceLiteral(
  app,
  '"LEXIFLOW · SETTINGS",\n        "设置",\n        "词典 Key 在这里配置；Codex 认证继续使用本机 auth.json，模型和思考强度只作为 LexiFlow 每次调用时的运行参数。",',
  '"设置",\n        "设置",\n        "配置词典与 AI 服务。认证仍由本机 Codex 安全管理，LexiFlow 不读取你的登录凭据。",',
  'productize settings header'
);

app = replaceLiteral(
  app,
  '<h3>本地 Codex · 运行状态</h3>',
  '<h3>AI 服务</h3>',
  'productize AI status title'
);

app = replaceLiteral(
  app,
  '<p>认证文件：${escapeHtml(codex?.authPath||"等待本地服务返回")}</p>\n              <p>Codex 默认模型：${escapeHtml(codex?.model||"未从 config.toml 读取到")}</p>\n              ${codex?.probeError?`<p>Codex 检测提示：${escapeHtml(codex.probeError)}</p>`:""}',
  '<p>默认模型：${escapeHtml(codex?.model||"跟随 Codex 默认配置")}</p>',
  'hide technical paths and probe details from normal settings UI'
);

app = replaceLiteral(
  app,
  '<span class="pill ${codex?.cliAvailable?"green":"red"}">${codex?.cliAvailable?"CLI 已检测":"CLI 不可用"}</span>',
  '<span class="pill ${codex?.cliAvailable?"green":"red"}">${codex?.cliAvailable?"AI 已连接":"AI 未连接"}</span>',
  'productize AI connectivity badge'
);

app = replaceLiteral(
  app,
  '<h3>Codex 模型与思考强度</h3>',
  '<h3>模型与思考强度</h3>',
  'productize model settings title'
);

app = replaceLiteral(
  app,
  '<h3>本地 Codex · 图片 AI</h3>',
  '<h3>图片生成</h3>',
  'productize image AI settings title'
);

app = replaceLiteral(
  app,
  '    if(search) search.addEventListener("input",e=>{state.librarySearch=e.target.value;render();});',
  `    if(search) search.addEventListener("input",e=>{\n      const start=e.target.selectionStart;\n      const end=e.target.selectionEnd;\n      state.librarySearch=e.target.value;\n      render();\n      requestAnimationFrame(()=>{\n        const next=document.getElementById("library-search");\n        if(next){\n          next.focus();\n          if(typeof start==="number") next.setSelectionRange(start,end??start);\n        }\n      });\n    });`,
  'preserve library search focus'
);

// ---------------------------------------------------------------------------
// public/styles.css
// ---------------------------------------------------------------------------
let styles = read('public/styles.css');
if (!styles.includes('/* audit round 1 */')) {
  styles += `\n\n/* audit round 1 */\n/* Rendering is state-driven; replaying a full-page entrance animation on every\n   state update causes visual flicker, so page transitions stay intentionally calm. */\n.content{animation:none}\n.btn:disabled{transform:none!important;box-shadow:none!important}\n`;
}

// ---------------------------------------------------------------------------
// README.md
// ---------------------------------------------------------------------------
let readme = read('README.md');
if (!readme.includes('## MVP Audit Round 1')) {
  readme += `\n\n## MVP Audit Round 1\n\n本轮在继续扩展功能前先修复稳定性与业务正确性问题：\n\n- Apply 不再自动算作“首次复习完成”；用户必须真正完成首次主动回忆后才进入后续复习计划。\n- 中文查词展开其它义项时使用最终英文词条，不会把中文原始输入直接发给英文词典接口。\n- 本地服务只接受 LexiFlow 自身来源，不再对任意网页开放跨域写入/AI 调用。\n- 图片生成和造句 AI 在用户退出页面后不会继续写入已经销毁的学习会话状态。\n- 本地上传图片写入 generated 目录，不再把大体积 base64 图片塞进 localStorage。\n- 中文重复查询可以命中新版缓存 fast path；Codex CLI 状态短时间缓存，减少重复启动探测。\n- 设置/搜索后台状态刷新会保留尚未提交的输入。\n- 普通界面不再展示 Codex 底层错误字符串、认证文件路径等开发者信息。\n- 词典缓存 schema 升级，旧版错误/缺字段缓存不会继续命中。\n- 无可用 IPA 时明确显示“暂无音标”，不再永久显示“音标加载中”。\n`;
}

write('server.js', server);
write('public/app.js', app);
write('public/styles.css', styles);
write('README.md', readme);

console.log('Audit round 1 patch applied successfully.');
