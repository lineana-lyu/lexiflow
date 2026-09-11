from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, before, after, label):
    file_path = ROOT / path
    text = file_path.read_text(encoding="utf-8")
    count = text.count(before)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly 1 match in {path}, got {count}")
    file_path.write_text(text.replace(before, after, 1), encoding="utf-8")
    print(f"patched {path}: {label}")


# 1) ECDICT POS: do not collapse missing POS to the generic label "word" when
# the translation itself carries a POS prefix such as n./v./adj.
replace_once(
    "lib/ecdict.js",
    '''function normalizePos(value) {
  const raw = String(value || "").trim();
  if (!raw) return "word";

  const candidates = [];
  for (const part of raw.split(/[\\s,/;|]+/)) {
    const key = part.split(":")[0].trim().toLowerCase();
    if (!key) continue;
    const mapped = POS_MAP.get(key) || key;
    if (!candidates.includes(mapped)) candidates.push(mapped);
  }
  return candidates.slice(0, 3).join(" · ") || "word";
}
''',
    '''function normalizePos(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const candidates = [];
  for (const part of raw.split(/[\\s,/;|]+/)) {
    const key = part.split(":")[0].trim().toLowerCase();
    if (!key) continue;
    const mapped = POS_MAP.get(key) || key;
    if (!candidates.includes(mapped)) candidates.push(mapped);
  }
  return candidates.slice(0, 3).join(" · ");
}

function translationPos(value, index = 0) {
  const lines = String(value || "")
    .replace(/\\\\r\\\\n/g, "\\n")
    .replace(/\\\\n/g, "\\n")
    .replace(/\\\\r/g, "\\n")
    .split(/\\r?\\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const ordered = [lines[index], ...lines].filter(Boolean);
  for (const line of ordered) {
    const match = line.match(/^\\s*(n|v|vi|vt|adj|a|adv|ad|prep|pron|conj|num|art|int|aux)\\.?\\s*(?=[:：\\s]|$)/i);
    if (!match) continue;
    const mapped = POS_MAP.get(match[1].toLowerCase()) || match[1].toLowerCase();
    if (mapped) return mapped;
  }
  return "";
}

function resolvedPos(row, index = 0) {
  const direct = normalizePos(row?.pos);
  if (direct) return direct;
  const translated = translationPos(row?.translation, index);
  if (translated) return translated;
  return String(row?.word || "").includes(" ") ? "phrase" : "word";
}
''',
    "infer POS from ECDICT translation when pos is empty",
)
replace_once(
    "lib/ecdict.js",
    '      pos: normalizePos(row.pos),\n',
    '      pos: resolvedPos(row, index),\n',
    "use resolved POS per sense",
)

# 2) Chinese -> English lookup accuracy: do not use substring-reverse ECDICT as
# the final answer. The inner resolver performs semantic resolution + dictionary
# verification and avoids cases such as 风衣 -> dust coat / 笔 -> brush.
replace_once(
    "server-runtime.js",
    '''  if (pathname === "/api/search/smart") {
    const query = clean(parsed.query);
    if (!query) return false;
    const hasChinese = /[\\u3400-\\u9fff]/.test(query);
    const result = hasChinese
      ? localChineseResult(query)
      : /^[A-Za-z][A-Za-z\\s'-]*$/.test(query)
        ? localLookupResult(query.toLowerCase(), "primary", query)
        : null;
    if (!result) return false;
    writeJson(res, 200, { ok: true, result: { ...result, localLookup: true, examplesPending: result.senses?.some(s => !s.exampleEn || !s.exampleZh) } });
    return true;
  }
''',
    '''  if (pathname === "/api/search/smart") {
    const query = clean(parsed.query);
    if (!query) return false;
    const hasChinese = /[\\u3400-\\u9fff]/.test(query);
    // ECDICT is excellent for exact English headword lookup, but translation
    // substring search is not a reliable Chinese -> English resolver. Chinese
    // queries therefore fall through to the semantic resolver in server.js.
    if (hasChinese) return false;
    const result = /^[A-Za-z][A-Za-z\\s'-]*$/.test(query)
      ? localLookupResult(query.toLowerCase(), "primary", query)
      : null;
    if (!result) return false;
    writeJson(res, 200, { ok: true, result: { ...result, localLookup: true, examplesPending: result.senses?.some(s => !s.exampleEn || !s.exampleZh) } });
    return true;
  }
''',
    "route Chinese queries through semantic resolver",
)
replace_once(
    "server-runtime.js",
    '''  if (pathname === "/api/dictionary/pronunciation") {
    const word = clean(parsed.word).toLowerCase();
    if (!/^[a-z][a-z '-]*$/i.test(word)) return false;
    const result = localLookupResult(word, "primary", word);
    if (!result?.phonetic) return false;
    writeJson(res, 200, {
      ok: true,
      result: {
        phonetic: result.phonetic,
        audioUrl: "",
        audioUrls: [],
        pronunciationSource: "ecdict-phonetic",
        exactMatch: true,
        localLookup: true,
      },
    });
    return true;
  }
''',
    '''  if (pathname === "/api/dictionary/pronunciation") {
    // Pronunciation is handled separately: prefer real dictionary audio and
    // fall back to the ECDICT phonetic transcription when audio is unavailable.
    return false;
  }
''',
    "stop ECDICT from shadowing dictionary audio",
)
replace_once(
    "server-runtime.js",
    '''function normalizePos(value) {
''',
    '''async function handlePronunciation(res, body) {
  let parsed;
  try {
    parsed = parseJsonBuffer(body);
  } catch {
    writeJson(res, 400, { ok: false, code: "INVALID_JSON", error: "请求格式不正确" });
    return true;
  }

  const word = clean(parsed.word).toLowerCase();
  if (!/^[a-z][a-z '-]*$/i.test(word)) {
    writeJson(res, 400, { ok: false, code: "INVALID_WORD", error: "请输入英文单词或短语" });
    return true;
  }

  const local = localLookupResult(word, "primary", word);
  try {
    const remote = await requestInnerJson("/api/dictionary/pronunciation", {
      method: "POST",
      body: { word },
      timeoutMs: 10000,
    });
    const pronunciation = remote.payload?.result;
    const hasAudio = Boolean(clean(pronunciation?.audioUrl) || (Array.isArray(pronunciation?.audioUrls) && pronunciation.audioUrls.some(Boolean)));
    if (remote.status >= 200 && remote.status < 300 && pronunciation && (hasAudio || clean(pronunciation.phonetic))) {
      writeJson(res, 200, {
        ok: true,
        result: {
          ...pronunciation,
          phonetic: clean(pronunciation.phonetic) || local?.phonetic || "",
          dictionaryAudio: hasAudio,
          localLookup: false,
        },
      });
      return true;
    }
  } catch {}

  if (local?.phonetic) {
    writeJson(res, 200, {
      ok: true,
      result: {
        phonetic: local.phonetic,
        audioUrl: "",
        audioUrls: [],
        pronunciationSource: "ecdict-phonetic",
        exactMatch: true,
        dictionaryAudio: false,
        localLookup: true,
      },
    });
    return true;
  }
  return false;
}

function normalizePos(value) {
''',
    "add dictionary-audio-first pronunciation handler",
)
replace_once(
    "server-runtime.js",
    '''        const body = await readBody(req);
        const handled = await handleLocalDictionary(req, res, url.pathname, body);
        if (handled) return;
        return forward(req, res, body);
''',
    '''        const body = await readBody(req);
        if (url.pathname === "/api/dictionary/pronunciation") {
          const pronunciationHandled = await handlePronunciation(res, body);
          if (pronunciationHandled) return;
        }
        const handled = await handleLocalDictionary(req, res, url.pathname, body);
        if (handled) return;
        return forward(req, res, body);
''',
    "prefer dictionary pronunciation before local phonetic fallback",
)

# 3) Lookup page: asynchronously hydrate real dictionary audio as well as examples.
replace_once(
    "public/example-hydration.js",
    '''  const inFlight = new Map();
  const activeHydrations = new Map();
''',
    '''  const inFlight = new Map();
  const pronunciationInFlight = new Map();
  const activeHydrations = new Map();
''',
    "track pronunciation hydration",
)
replace_once(
    "public/example-hydration.js",
    '''  function markLoading(result, senses) {
''',
    '''  function patchPronunciation(result, pronunciation) {
    if (!result || !pronunciation) return;
    const phonetic = clean(pronunciation.phonetic);
    const audioUrl = clean(pronunciation.audioUrl);
    const audioUrls = Array.isArray(pronunciation.audioUrls) ? pronunciation.audioUrls.map(clean).filter(Boolean) : [];
    if (phonetic) result.phonetic = phonetic;
    if (audioUrl) result.audioUrl = audioUrl;
    if (audioUrls.length) result.audioUrls = audioUrls;
    if (pronunciation.pronunciationSource) result.pronunciationSource = clean(pronunciation.pronunciationSource);

    if (!currentLookupMatches(result.word)) return;
    const phoneticNode = document.querySelector(".learning-card-wordtop .phonetic");
    if (phoneticNode && phonetic) phoneticNode.textContent = phonetic.startsWith("/") || phonetic.startsWith("[") ? phonetic : `/${phonetic}/`;
    const speaker = document.querySelector(".learning-card-wordtop .speaker[data-action=\\"speak\\"]");
    if (speaker) {
      speaker.dataset.audio = audioUrl;
      speaker.dataset.audios = JSON.stringify(audioUrls);
    }
  }

  async function hydratePronunciation(result) {
    if (!result?.word) return;
    const existing = [clean(result.audioUrl), ...(Array.isArray(result.audioUrls) ? result.audioUrls.map(clean) : [])].filter(Boolean);
    if (existing.length) return;
    const word = normalizeWord(result.word);
    let task = pronunciationInFlight.get(word);
    if (!task) {
      task = nativeFetch(`${API_ORIGIN}/api/dictionary/pronunciation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: result.word }),
      }).then(async response => {
        let payload = {};
        try { payload = await response.json(); } catch {}
        if (!response.ok || !payload?.ok) return null;
        return payload.result || null;
      }).finally(() => pronunciationInFlight.delete(word));
      pronunciationInFlight.set(word, task);
    }
    try {
      const pronunciation = await task;
      if (pronunciation) patchPronunciation(result, pronunciation);
    } catch {}
  }

  function markLoading(result, senses) {
''',
    "hydrate lookup pronunciation and audio",
)
replace_once(
    "public/example-hydration.js",
    '''            if (isLocalDictionaryPayload(payload)) void hydrateResult(payload.result);
            return payload;
''',
    '''            if (isLocalDictionaryPayload(payload)) {
              void hydrateResult(payload.result);
              void hydratePronunciation(payload.result);
            }
            return payload;
''',
    "start example and pronunciation hydration together",
)

# 4) App UX / state fixes.
replace_once(
    "public/app.js",
    '''  async function ensureCardPronunciation(card){
    if(!card || card.phonetic || state.pronunciationHydration[card.id]) return;
''',
    '''  async function ensureCardPronunciation(card){
    const existingAudios=Array.isArray(card?.audioUrls)?card.audioUrls.filter(Boolean):[];
    if(!card || card.audioUrl || existingAudios.length || state.pronunciationHydration[card.id]) return;
''',
    "hydrate saved-card audio even when phonetic already exists",
)
replace_once(
    "public/app.js",
    '''      ${r.aiEnriched===false?`<div class="feedback warn"><h4>中文释义暂未整理完成</h4><ul><li>英文词典结果已经找到，你可以稍后重试，或直接手动补充中文释义与例句。</li></ul></div>`:""}
''',
    '''      ${primarySense&&!String(primarySense.meaningZh||"").trim()?`<div class="feedback warn"><h4>中文释义暂缺</h4><ul><li>当前词条没有可用中文释义，可以重新查询或手动补充。</li></ul></div>`:""}
''',
    "do not claim ECDICT Chinese meaning is unfinished",
)
replace_once(
    "public/app.js",
    '''      applyApproved:false,
      applyLastCheckedText:"",
      applyDetectedLanguage:"",
''',
    '''      applyApproved:false,
      applyLastCheckedText:"",
      applyReviewedText:"",
      applyDetectedLanguage:"",
''',
    "track sentence review independently from adoption",
)
replace_once(
    "public/app.js",
    '''          <div class="scene-panel-label"><span>联想场景</span><small>可编辑</small></div>
          ${sceneLoading&&!sceneDraft?`<div class="scene-loading"><span class="mini-spinner"></span><span>正在准备场景…</span></div>`:`<textarea class="scene-editor" id="visual-note" placeholder="修改这个场景，生成图片时会按这里的内容来。">${escapeHtml(sceneDraft)}</textarea>`}
''',
    '''          <div class="scene-panel-label"><span>联想场景</span><small>${generating?"生成中已锁定":"可编辑"}</small></div>
          ${sceneLoading&&!sceneDraft?`<div class="scene-loading"><span class="mini-spinner"></span><span>正在准备场景…</span></div>`:`<textarea class="scene-editor" id="visual-note" ${generating?"readonly aria-readonly=\\"true\\"":""} placeholder="修改这个场景，生成图片时会按这里的内容来。">${escapeHtml(sceneDraft)}</textarea>`}
''',
    "lock visual scene while image is generating",
)
replace_once(
    "public/app.js",
    '''        <label class="text-action upload-text-action" for="visual-file">上传图片</label>
''',
    '''        <label class="text-action upload-text-action" for="visual-file" ${generating?"aria-disabled=\\"true\\" style=\\"pointer-events:none;opacity:.5\\"":""}>上传图片</label>
''',
    "avoid image replacement race while generating",
)
replace_once(
    "public/app.js",
    '''      imageGeneration:card.imageGeneration?{...card.imageGeneration}:null
''',
    '''      imageGeneration:card.imageGeneration?{...card.imageGeneration}:null,
      userSentence:card.userSentence||""
''',
    "include learner sentence in library draft",
)
replace_once(
    "public/app.js",
    '''      exampleEn:String(read("library-edit-example-en",current.exampleEn)||"").trim(),
      exampleZh:String(read("library-edit-example-zh",current.exampleZh)||"").trim(),
      visualNote:String(read("library-edit-visual-note",current.visualNote)||"").trim()
''',
    '''      exampleEn:card.exampleEn||"",
      exampleZh:card.exampleZh||"",
      userSentence:String(read("library-edit-user-sentence",current.userSentence)||"").trim(),
      visualNote:String(read("library-edit-visual-note",current.visualNote)||"").trim()
''',
    "edit learner sentence instead of dictionary example",
)
replace_once(
    "public/app.js",
    '''    const generating=Boolean(editor.imageGenerating);
''',
    '''    const activeGeneration=d.imageGeneration||card.imageGeneration||null;
    const generating=Boolean(editor.imageGenerating||activeGeneration?.status==="generating");
''',
    "sync library editor with background image-generation state",
)
replace_once(
    "public/app.js",
    '''      header("","编辑单词卡","只调整例句和视觉联想；词条信息保持原样，复习进度不会改变。",`<button class="btn" data-action="library-edit-back">← 返回单词库</button>`)
''',
    '''      header("","编辑单词卡","只调整你的造句和视觉联想；词条、释义与参考例句保持原样，复习进度不会改变。",`<button class="btn" data-action="library-edit-back">← 返回单词库</button>`)
''',
    "clarify library edit scope",
)
replace_once(
    "public/app.js",
    '''        <section class="card pad library-editor-copy-card">
          <div class="library-editor-section-head">
            <div><span class="library-editor-section-kicker">可编辑</span><h2>例句</h2><p>只在表达不自然或不够贴合词义时修改。</p></div>
          </div>
          <div class="field library-editor-editable-field">
            <label>英文例句</label>
            <textarea class="textarea library-editor-textarea" id="library-edit-example-en" placeholder="写一句自然、明确体现当前词义的英文例句">${escapeHtml(d.exampleEn)}</textarea>
          </div>
          <div class="field library-editor-editable-field">
            <label>中文例句</label>
            <textarea class="textarea library-editor-textarea" id="library-edit-example-zh" placeholder="填写对应的自然中文翻译">${escapeHtml(d.exampleZh)}</textarea>
          </div>
          <div class="library-editor-copy-note">例句会直接用于后续记忆与复习。</div>
        </section>
''',
    '''        <section class="card pad library-editor-copy-card">
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
''',
    "make dictionary example read-only and learner sentence editable",
)
replace_once(
    "public/app.js",
    '''            ${generating?`<div class="library-editor-image-loading"><span class="mini-spinner"></span><strong>正在生成新图片</strong><small>可以继续修改例句或场景，当前已保存内容不会被覆盖。</small></div>`:""}
''',
    '''            ${generating?`<div class="library-editor-image-loading"><span class="mini-spinner"></span><strong>正在生成新图片</strong><small>生成期间场景已锁定，完成后可继续修改。</small></div>`:""}
''',
    "correct image-generation lock copy",
)
replace_once(
    "public/app.js",
    '''            <label class="btn" for="library-image-file">上传图片</label>
''',
    '''            <label class="btn" for="library-image-file" ${generating?"aria-disabled=\\"true\\" style=\\"pointer-events:none;opacity:.55\\"":""}>上传图片</label>
''',
    "disable library upload while generation is active",
)
replace_once(
    "public/app.js",
    '''            <textarea class="textarea library-editor-scene" id="library-edit-visual-note" placeholder="例如：傍晚的书房里，台灯照亮摊开的英语课本。留空也可以直接生成。">${escapeHtml(d.visualNote)}</textarea>
            <small>填写后优先按你的描述生成；留空时 AI 会自动设计画面。</small>
''',
    '''            <textarea class="textarea library-editor-scene" id="library-edit-visual-note" ${generating?"readonly aria-readonly=\\"true\\"":""} placeholder="例如：傍晚的书房里，台灯照亮摊开的英语课本。留空也可以直接生成。">${escapeHtml(d.visualNote)}</textarea>
            <small>${generating?"图片生成中，当前场景暂时锁定。":"填写后优先按你的描述生成；留空时 AI 会自动设计画面。"}</small>
''',
    "lock library scene while background generation runs",
)
replace_once(
    "public/app.js",
    '''          <span>保存后只更新例句、联想场景和图片。</span>
''',
    '''          <span>保存后只更新我的造句、联想场景和图片。</span>
''',
    "library footer reflects learner-sentence editing",
)
replace_once(
    "public/app.js",
    '''      if(!draft.exampleEn||!draft.exampleZh){
        showNotice("例句还没有填写完整","请保留一组对应的中英文例句。","warn");
        return;
      }
      if(!learningExampleUsesTarget(draft.exampleEn,card.word)){
        showNotice("例句没有使用当前词","英文例句需要实际包含当前学习词或常见词形，再保存修改。","warn");
        return;
      }
      // Fixed lexical identity: word / phonetic / POS / Chinese meaning are never changed here.
      card.exampleEn=draft.exampleEn;
      card.exampleZh=draft.exampleZh;
''',
    '''      // Fixed lexical identity and reference example: only the learner's own
      // sentence plus visual-memory content can be changed in the library.
      card.userSentence=draft.userSentence||"";
''',
    "persist user sentence instead of dictionary example edits",
)
replace_once(
    "public/app.js",
    '''        state.study.applyApproved=false;
        state.study.applyLastCheckedText="";
''',
    '''        state.study.applyApproved=false;
        state.study.applyLastCheckedText="";
        state.study.applyReviewedText="";
''',
    "clear reviewed state when learner edits sentence",
)
# The previous snippet appears again in submit-apply; patch that specific block via a larger anchor.
replace_once(
    "public/app.js",
    '''      state.study.applyText=sentence;
      state.study.applyApproved=false;
      state.study.applyLastCheckedText="";
      state.study.applyDetectedLanguage=containsChinese(sentence)?"zh":"en";
''',
    '''      state.study.applyText=sentence;
      state.study.applyApproved=false;
      state.study.applyLastCheckedText="";
      state.study.applyReviewedText="";
      state.study.applyDetectedLanguage=containsChinese(sentence)?"zh":"en";
''',
    "reset review marker before AI sentence check",
)
replace_once(
    "public/app.js",
    '''        state.study.applyApproved=originalApproved;
        state.study.applyLastCheckedText=originalApproved?sentence:"";
        state.study.feedback={level:candidateApproved?"good":"warn",title:inputLanguage==="zh"?(candidateApproved?"意思保留了，英文也自然":"这句话还需要调整"):suggested?(candidateApproved?"可以这样说得更自然":"这句话还需要调整"):(originalApproved?"表达自然，可以直接使用":String(fb.title||"这句话还需要调整")),tips:[...(Array.isArray(fb.tips)?fb.tips:[]),...(!keywordOk?[`需要自然使用 “${c.word}” 或它的常见词形。`]:[])].slice(0,2),suggestion:suggested,suggestionApproved:Boolean(suggested&&candidateApproved),keyword,inputLanguage};
''',
    '''        state.study.applyApproved=originalApproved;
        state.study.applyLastCheckedText=originalApproved?sentence:"";
        state.study.applyReviewedText=sentence;
        state.study.feedback={level:candidateApproved?"good":"warn",title:inputLanguage==="zh"?(candidateApproved?"意思保留了，英文也自然":"这句话还需要调整"):suggested?(candidateApproved?"可以这样说得更自然":"这句话还需要调整"):(originalApproved?"表达自然，可以直接使用":String(fb.title||"这句话还需要调整")),tips:[...(Array.isArray(fb.tips)?fb.tips:[]),...(!keywordOk?[`需要自然使用 “${c.word}” 或它的常见词形。`]:[])].slice(0,2),suggestion:suggested,suggestionApproved:Boolean(suggested&&candidateApproved),keyword,inputLanguage};
''',
    "mark sentence as reviewed without forcing adoption",
)
replace_once(
    "public/app.js",
    '''      state.study.applyApproved=keywordOk;
      state.study.applyLastCheckedText=keywordOk?suggestion:"";
''',
    '''      state.study.applyApproved=keywordOk;
      state.study.applyLastCheckedText=keywordOk?suggestion:"";
      state.study.applyReviewedText=suggestion;
''',
    "adopted suggestion remains eligible to continue",
)
replace_once(
    "public/app.js",
    '''      state.study.applyApproved=false;
      state.study.applyLastCheckedText="";
      state.study.feedback=null;
''',
    '''      state.study.applyApproved=false;
      state.study.applyLastCheckedText="";
      state.study.applyReviewedText="";
      state.study.feedback=null;
''',
    "restoring original sentence requires a fresh review",
)
replace_once(
    "public/app.js",
    '''    }else if(fb&&suggestion){
      feedbackPanel=`<div class="ai-feedback-panel ${fb.suggestionApproved?"good":"warn"}"><div class="ai-feedback-head"><div><small>${fb.inputLanguage==="zh"?"英文表达":"修改建议"}</small><strong>${escapeHtml(fb.title||"可以这样表达")}</strong></div></div><div class="ai-suggestion-sentence">${sentenceExample(suggestion,"example-en",keyword)}</div>${(fb.tips||[]).length?`<div class="ai-feedback-notes">${(fb.tips||[]).map(x=>`<span>${escapeHtml(x)}</span>`).join("")}</div>`:""}<div class="ai-feedback-actions"><button class="btn primary" data-action="adopt-ai-sentence" ${fb.suggestionApproved?"":"disabled"}>采用建议</button><button class="text-action" data-action="edit-apply">继续修改</button></div></div>`;
    }else if(fb&&checked){
''',
    '''    }else if(fb&&suggestion){
      feedbackPanel=`<div class="ai-feedback-panel ${fb.suggestionApproved?"good":"warn"}"><div class="ai-feedback-head"><div><small>${fb.inputLanguage==="zh"?"英文表达":"修改建议"}</small><strong>${escapeHtml(fb.title||"可以这样表达")}</strong></div></div><div class="ai-suggestion-sentence">${sentenceExample(suggestion,"example-en",keyword)}</div>${(fb.tips||[]).length?`<div class="ai-feedback-notes">${(fb.tips||[]).map(x=>`<span>${escapeHtml(x)}</span>`).join("")}</div>`:""}<div class="ai-feedback-actions"><button class="btn primary" data-action="adopt-ai-sentence" ${fb.suggestionApproved?"":"disabled"}>采用建议</button><button class="btn" data-action="pass-apply">保留原句，继续首次复习</button><button class="text-action" data-action="edit-apply">继续修改</button></div></div>`;
    }else if(fb&&checked){
''',
    "separate adopting AI suggestion from continuing",
)
replace_once(
    "public/app.js",
    '''    }else if(fb){
      feedbackPanel=`<div class="ai-feedback-panel warn"><div class="ai-feedback-head"><div><small>检查结果</small><strong>${escapeHtml(fb.title||"这句话还需要调整")}</strong></div></div>${(fb.tips||[]).length?`<div class="ai-feedback-notes">${(fb.tips||[]).map(x=>`<span>${escapeHtml(x)}</span>`).join("")}</div>`:""}<div class="ai-feedback-actions"><button class="text-action" data-action="edit-apply">继续修改</button></div></div>`;
    }
''',
    '''    }else if(fb){
      feedbackPanel=`<div class="ai-feedback-panel warn"><div class="ai-feedback-head"><div><small>检查结果</small><strong>${escapeHtml(fb.title||"这句话还需要调整")}</strong></div></div>${(fb.tips||[]).length?`<div class="ai-feedback-notes">${(fb.tips||[]).map(x=>`<span>${escapeHtml(x)}</span>`).join("")}</div>`:""}<div class="ai-feedback-actions"><button class="btn" data-action="pass-apply">保留原句，继续首次复习</button><button class="text-action" data-action="edit-apply">继续修改</button></div></div>`;
    }
''',
    "allow continuation after reviewed warning",
)
replace_once(
    "public/app.js",
    '''      const checked=Boolean(state.study.applyApproved && state.study.applyLastCheckedText===latest);
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

''',
    '''      const reviewed=Boolean(state.study.feedback && state.study.applyReviewedText===latest);

      if(!latest){toast("请先写一句话");return;}
      if(!reviewed){
        showNotice("请先检查句子","先让 AI 给出一次反馈，再决定采用建议、继续修改，或保留原句进入下一步。","warn");
        return;
      }

''',
    "do not force AI adoption or approval before continuing",
)

# Replace the library image regeneration handler so state persists and stays in
# sync even when the user navigates away while the image job runs.
replace_once(
    "public/app.js",
    '''      const cardId=card.id;
      const scene=draft.visualNote||`围绕“${draft.meaningZh}”设计一个具体、清晰、生活化的记忆场景，突出 ${draft.word} 的当前含义。`;
      editor.imageGenerating=true;
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
        if(state.libraryEditor?.cardId!==cardId)return;
        state.libraryEditor.draft={
          ...draft,
          imageData:"",
          imageUrl:payload.image.url,
          generatedVisualScene:String(payload.image.visualNote||scene||"").trim(),
          imageGeneration:{status:"success",phase:"done",message:"联想图已重新生成。",code:"",finishedAt:new Date().toISOString()}
        };
        state.libraryEditor.imageGenerating=false;
        render();
      }catch(err){
        if(state.libraryEditor?.cardId!==cardId)return;
        state.libraryEditor.imageGenerating=false;
        showErrorNotice(err,"图片没有生成成功");
      }
''',
    '''      const cardId=card.id;
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
''',
    "persist library image-generation state across navigation",
)

# Visual-stage image generation should also refresh an already-open library
# editor when the background job completes or fails.
replace_once(
    "public/app.js",
    '''      c.updatedAt=new Date().toISOString();
      saveData();
      if(state.study?.cardId===cardId&&c.stage==="visualize") toast("联想图已生成");
''',
    '''      c.updatedAt=new Date().toISOString();
      saveData();
      if(state.libraryEditor?.cardId===cardId){
        state.libraryEditor.imageGenerating=false;
        state.libraryEditor.draft=libraryEditorBaseDraft(c);
        render();
      }
      if(state.study?.cardId===cardId&&c.stage==="visualize") toast("联想图已生成");
''',
    "sync successful background generation into library editor",
)
replace_once(
    "public/app.js",
    '''      c.updatedAt=new Date().toISOString();
      saveData();
      if(state.study?.cardId===cardId&&c.stage==="visualize") toast("图片没有生成成功");
''',
    '''      c.updatedAt=new Date().toISOString();
      saveData();
      if(state.libraryEditor?.cardId===cardId){
        state.libraryEditor.imageGenerating=false;
        state.libraryEditor.draft=libraryEditorBaseDraft(c);
        render();
      }
      if(state.study?.cardId===cardId&&c.stage==="visualize") toast("图片没有生成成功");
''',
    "sync failed background generation into library editor",
)

# 5) Sentence checking: when the learner input is incomplete or wrong, return a
# concrete corrected suggestion instead of critique-only feedback.
replace_once(
    "server.js",
    '''2. 英文输入：检查是否自然、语法是否基本正确、是否使用目标词/词形且符合当前词义。正确时 suggestion 为空；需要修改时只做最小修改。
3. 如果英文完全没包含目标词，只有在不改变原意时才补入；否则 approved=false，并在 tips 中提醒用户重写。
4. keyword 必须是最终英文里实际出现的目标词或词形，用于界面高亮。
5. suggestion 如果非空，应当是可直接保存的最终英文；如果 suggestion 已经修正完成，则 level=good、approved=true。
''',
    '''2. 英文输入：检查是否自然、语法是否基本正确、是否使用目标词/词形且符合当前词义。完全正确时 suggestion 为空；只要句子不完整、语法错误、搭配不自然或明显表达不完整，suggestion 必须给出一条完整、自然、可直接使用的修正版，而不是只指出问题。
3. 修正时尽量保持用户原意并做最小改动。若原句是无法独立成句的残句（例如主系表缺少表语），允许补充最少量、日常且中性的内容使句子完整，但不要大幅扩写或改变主题。
4. 如果英文完全没包含目标词，优先在不改变原意的前提下自然补入目标词；如果确实无法合理补入，再 approved=false 并解释原因。
5. keyword 必须是最终英文里实际出现的目标词或词形，用于界面高亮。
6. suggestion 如果非空，应当是可直接保存的最终英文；修正版本身正确且含目标词时，level=good、approved=true。不要出现“判定有问题但不给修正句”的情况。
''',
    "require a concrete AI correction for repairable sentences",
)

print("all targeted fixes applied")
