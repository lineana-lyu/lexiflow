from pathlib import Path

server = Path('server.js')
app = Path('public/app.js')
css = Path('public/styles.css')
s = server.read_text(encoding='utf-8')
a = app.read_text(encoding='utf-8')
c = css.read_text(encoding='utf-8')


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old, new, 1)


s = replace_once(s, 'const LOOKUP_CACHE_SCHEMA = "v4.3-desktop";', 'const LOOKUP_CACHE_SCHEMA = "v4.4-verified-resolution";', 'cache schema')

s = replace_once(s, '''  const sourceEntries = exactEntries.length
    ? exactEntries
    : payload.filter(entry => entry && typeof entry === "object").slice(0, 1);

  const candidates = [];''', '''  // Only exact headword/stem matches are allowed to become a learning card.
  // A nearby dictionary object or spelling suggestion must never silently replace
  // a Chinese concept with an unrelated English word.
  const sourceEntries = exactEntries;
  if (!sourceEntries.length) {
    const suggestions = payload
      .filter(entry => entry && typeof entry === "object")
      .map(entry => normalizeHeadword(entry?.meta?.id || entry?.hwi?.hw || ""))
      .filter(Boolean)
      .filter((word, index, list) => word !== String(query || "").trim().toLowerCase() && list.indexOf(word) === index)
      .slice(0, 8);
    return { word: query, suggestions, mode, exactMatch: false, hasMore: false };
  }

  const candidates = [];''', 'exact dictionary entries only')

s = replace_once(s, '''  return {
    word: candidates[0]?.word || query,
    phonetic: candidates[0]?.pronunciation || "",
    audioUrl: candidates[0]?.audioUrl || "",
    entries: candidates,
    suggestions: [],
    mode,
    hasMore: totalExactEntries > candidates.length,
  };''', '''  return {
    word: candidates[0]?.word || query,
    phonetic: candidates[0]?.pronunciation || "",
    audioUrl: candidates[0]?.audioUrl || "",
    audioUrls: candidates[0]?.audioUrl ? [candidates[0].audioUrl] : [],
    pronunciationSource: candidates[0]?.audioUrl || candidates[0]?.pronunciation ? "merriam-webster-entry" : "",
    entries: candidates,
    suggestions: [],
    mode,
    exactMatch: true,
    intentMatched: !intentEn || Boolean(intentMatch),
    hasMore: totalExactEntries > candidates.length,
  };''', 'normalized dictionary metadata')

s = replace_once(s, '''async function merriamWebsterPronunciation(word) {
  const settings = await loadSettings();
  const key = String(settings.merriamWebsterLearnersKey || "").trim();
  if (!key) {
    const err = new Error("请先在设置中配置 Merriam-Webster Learner's Dictionary API Key");
    err.code = "DICTIONARY_KEY_MISSING";
    throw err;
  }
  const url = `https://www.dictionaryapi.com/api/v3/references/learners/json/${encodeURIComponent(word)}?key=${encodeURIComponent(key)}`;
  const response = await fetch(url, { headers: { "Accept":"application/json", "User-Agent":"LexiFlow/4.2-audit1" } });
  if (!response.ok) {
    const err = new Error(`Merriam-Webster 发音查询失败：HTTP ${response.status}`);
    err.code = "DICTIONARY_HTTP_ERROR";
    throw err;
  }
  const payload = await response.json();
  if (!Array.isArray(payload)) return { phonetic:"", audioUrl:"" };
  const exactEntries = payload.filter(entry => entry && typeof entry === "object" && entryMatchesQuery(entry, word));
  const source = exactEntries[0] || payload.find(entry => entry && typeof entry === "object");
  if (!source) return { phonetic:"", audioUrl:"" };
  return { phonetic: pronunciationFromEntry(source), audioUrl: audioUrlFromEntry(source) };
}''', '''async function fetchLearnersPayload(word, key, userAgent = "LexiFlow/0.8.3") {
  const url = `https://www.dictionaryapi.com/api/v3/references/learners/json/${encodeURIComponent(word)}?key=${encodeURIComponent(key)}`;
  const response = await fetch(url, { headers: { "Accept":"application/json", "User-Agent":userAgent } });
  if (!response.ok) {
    const err = new Error(`Merriam-Webster 请求失败：HTTP ${response.status}`);
    err.code = "DICTIONARY_HTTP_ERROR";
    throw err;
  }
  return response.json();
}

function exactPronunciationFromPayload(payload, word) {
  if (!Array.isArray(payload)) return { phonetic:"", audioUrl:"", exactMatch:false };
  const exactEntries = payload.filter(entry => entry && typeof entry === "object" && entryMatchesQuery(entry, word));
  const source = exactEntries[0];
  if (!source) return { phonetic:"", audioUrl:"", exactMatch:false };
  return { phonetic: pronunciationFromEntry(source), audioUrl: audioUrlFromEntry(source), exactMatch:true };
}

async function merriamWebsterPronunciation(word) {
  const settings = await loadSettings();
  const key = String(settings.merriamWebsterLearnersKey || "").trim();
  if (!key) {
    const err = new Error("请先在设置中配置 Merriam-Webster Learner's Dictionary API Key");
    err.code = "DICTIONARY_KEY_MISSING";
    throw err;
  }
  const normalizedWord = String(word || "").trim().toLowerCase();
  const payload = await fetchLearnersPayload(normalizedWord, key, "LexiFlow/0.8.3-pronunciation");
  const exact = exactPronunciationFromPayload(payload, normalizedWord);
  if (exact.exactMatch) {
    return {
      phonetic: exact.phonetic,
      audioUrl: exact.audioUrl,
      audioUrls: exact.audioUrl ? [exact.audioUrl] : [],
      pronunciationSource: "merriam-webster-entry",
      exactMatch:true,
    };
  }

  // Multi-word phrases may not have their own Learner's Dictionary headword.
  // In that case only exact Merriam-Webster component pronunciations are used.
  const parts = normalizedWord.split(/\\s+/).filter(part => /^[a-z][a-z'-]*$/i.test(part));
  if (parts.length > 1 && parts.length <= 5) {
    const componentResults = [];
    for (const part of parts) {
      const componentPayload = await fetchLearnersPayload(part, key, "LexiFlow/0.8.3-phrase-pronunciation");
      const component = exactPronunciationFromPayload(componentPayload, part);
      if (!component.exactMatch || !component.phonetic) {
        return { phonetic:"", audioUrl:"", audioUrls:[], pronunciationSource:"", exactMatch:false };
      }
      componentResults.push(component);
    }
    return {
      phonetic: componentResults.map(item => item.phonetic).join(" "),
      audioUrl: "",
      audioUrls: componentResults.map(item => item.audioUrl).filter(Boolean),
      pronunciationSource: "merriam-webster-components",
      exactMatch:false,
    };
  }
  return { phonetic:"", audioUrl:"", audioUrls:[], pronunciationSource:"", exactMatch:false };
}''', 'exact/phrase pronunciation')

s = replace_once(s, '''  const url = `https://www.dictionaryapi.com/api/v3/references/learners/json/${encodeURIComponent(word)}?key=${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    headers: { "Accept": "application/json", "User-Agent": "LexiFlow/4.2" },
  });

  if (!response.ok) {
    const err = new Error(`Merriam-Webster 请求失败：HTTP ${response.status}`);
    err.code = "DICTIONARY_HTTP_ERROR";
    throw err;
  }

  const payload = await response.json();''', '''  const payload = await fetchLearnersPayload(word, key, "LexiFlow/0.8.3-lookup");''', 'dictionary fetch helper')

s = replace_once(s, '''  if (normalized.suggestions?.length) return normalized;

  let result;
  if (provided && normalized.entries?.length) {''', '''  if (normalized.suggestions?.length) return normalized;

  if (provided && normalized.entries?.length && intentEn && normalized.intentMatched === false) {
    return { word, mode:safeMode, exactMatch:true, semanticMismatch:true, suggestions:[], senses:[] };
  }

  let result;
  if (provided && normalized.entries?.length) {''', 'semantic verification')

s = replace_once(s, '      audioUrl: normalized.audioUrl,\n      mode: safeMode,', '      audioUrl: normalized.audioUrl,\n      audioUrls: normalized.audioUrls || (normalized.audioUrl ? [normalized.audioUrl] : []),\n      pronunciationSource: normalized.pronunciationSource || "merriam-webster-entry",\n      dictionaryExact:true,\n      mode: safeMode,', 'dictionary pronunciation metadata')

s = replace_once(s, '''8. alternatives 只用于后台容错，最多 3 个；用户不需要先选择。

只输出 JSON：
{
  "normalizedChinese":"纠正后的中文",
  "primary":{
    "word":"english",
    "meaningZh":"简短中文",
    "intentEn":"precise sense in English",
    "avoidVisualEn":["confusing visual sense"],
    "exampleEn":"natural example",
    "exampleZh":"自然中文翻译",
    "confidence":0.95
  },
  "alternatives":[{"word":"english","meaningZh":"中文"}]
}`;''', '''8. primary 可以是一个自然的现代英语短语；不要为了迎合单词词典而强行改成不自然的单个词。
9. exampleEn 必须包含 primary.word 原样（忽略大小写），避免词条与例句错位。
10. alternatives 最多 3 个，必须是同一中文概念的自然替代表达；每项也给出 intentEn，便于词典校验。

只输出 JSON：
{
  "normalizedChinese":"纠正后的中文",
  "primary":{
    "word":"english word or phrase",
    "pos":"noun|verb|adjective|adverb|phrase",
    "meaningZh":"简短中文",
    "intentEn":"precise sense in English",
    "avoidVisualEn":["confusing visual sense"],
    "exampleEn":"natural example that contains the exact primary.word",
    "exampleZh":"自然中文翻译",
    "confidence":0.95
  },
  "alternatives":[{"word":"alternative","pos":"noun|verb|adjective|adverb|phrase","meaningZh":"中文","intentEn":"precise sense in English"}]
}`;''', 'resolver prompt')

s = replace_once(s, '      meaningZh: String(primary.meaningZh || local?.[0]?.reason || q).trim(),\n      intentEn:', '      pos: String(primary.pos || (word.includes(" ") ? "phrase" : "word")).trim(),\n      meaningZh: String(primary.meaningZh || local?.[0]?.reason || q).trim(),\n      intentEn:', 'primary pos')

s = replace_once(s, '''    alternatives: Array.isArray(parsed.alternatives)
      ? parsed.alternatives.slice(0, 3).map(item => ({
          word: String(item.word || "").trim().toLowerCase(),
          meaningZh: String(item.meaningZh || "").trim(),
        })).filter(item => /^[a-z][a-z '-]*$/i.test(item.word))
      : [],''', '''    alternatives: Array.isArray(parsed.alternatives)
      ? parsed.alternatives.slice(0, 3).map(item => ({
          word: String(item.word || "").trim().toLowerCase(),
          pos: String(item.pos || "").trim(),
          meaningZh: String(item.meaningZh || "").trim(),
          intentEn: String(item.intentEn || "").trim(),
        })).filter(item => /^[a-z][a-z '-]*$/i.test(item.word))
      : [],''', 'richer alternatives')

smart_start = s.index('async function smartLookup(query) {')
smart_end = s.index('\n\nfunction putSmallCache', smart_start)
if smart_start < 0 or smart_end < 0:
    raise SystemExit('smartLookup anchors missing')
smart_new = r'''async function buildResolvedPhraseCard(candidate, resolved, sourceQuery) {
  const pronunciation = await merriamWebsterPronunciation(candidate.word);
  const exampleEn = String(candidate.exampleEn || resolved.primary.exampleEn || "").trim();
  const exampleZh = String(candidate.exampleZh || resolved.primary.exampleZh || "").trim();
  const exactPhrase = String(candidate.word || "").trim();
  if (!exampleEn || !exampleZh || !exampleEn.toLowerCase().includes(exactPhrase.toLowerCase())) {
    const err = new Error("AI 返回的短语例句与目标短语不一致");
    err.code = "SEARCH_RESOLUTION_INCONSISTENT";
    throw err;
  }
  const alternatives = [resolved.primary, ...(resolved.alternatives || [])]
    .filter(item => item?.word && item.word.toLowerCase() !== exactPhrase.toLowerCase())
    .map(item => ({ word:item.word, meaningZh:item.meaningZh || resolved.normalizedChinese || sourceQuery }));
  return {
    word: exactPhrase,
    phonetic: pronunciation.phonetic || "",
    audioUrl: pronunciation.audioUrl || "",
    audioUrls: pronunciation.audioUrls || [],
    pronunciationSource: pronunciation.pronunciationSource || "",
    dictionaryExact:false,
    phraseCard:true,
    mode:"primary",
    hasMore:false,
    suggestions:[],
    aiEnriched:true,
    sourceQuery,
    normalizedQuery:resolved.normalizedChinese,
    autoResolved:true,
    alternatives,
    senses:[{
      id:`phrase-${exactPhrase.replace(/[^a-z0-9]+/gi,"-")}`,
      pos:String(candidate.pos || resolved.primary.pos || "phrase").trim() || "phrase",
      meaningZh:String(candidate.meaningZh || resolved.primary.meaningZh || resolved.normalizedChinese || sourceQuery).trim(),
      exampleEn,
      exampleZh,
      commonForLearner:true,
      translationConfidence:Number.isFinite(Number(candidate.confidence ?? resolved.primary.confidence)) ? Number(candidate.confidence ?? resolved.primary.confidence) : null,
      senseIntentEn:String(candidate.intentEn || resolved.primary.intentEn || "").trim(),
      avoidVisualEn:Array.isArray(candidate.avoidVisualEn || resolved.primary.avoidVisualEn) ? (candidate.avoidVisualEn || resolved.primary.avoidVisualEn) : [],
    }],
  };
}

async function lookupResolvedChineseCandidate(candidate, resolved, sourceQuery) {
  const word = String(candidate?.word || "").trim().toLowerCase();
  if (!word) return null;
  const learningContent = {
    ...resolved.primary,
    ...candidate,
    word,
    meaningZh:String(candidate.meaningZh || resolved.primary.meaningZh || resolved.normalizedChinese || sourceQuery).trim(),
    exampleEn:String(candidate.exampleEn || resolved.primary.exampleEn || "").trim(),
    exampleZh:String(candidate.exampleZh || resolved.primary.exampleZh || "").trim(),
  };
  const intentEn = String(candidate.intentEn || resolved.primary.intentEn || "").trim();
  const result = await merriamWebsterLookup(word, "primary", {
    intentEn,
    learningContent,
    avoidVisualEn: learningContent.avoidVisualEn,
    sourceQuery,
    normalizedQuery: resolved.normalizedChinese,
    alternatives: [resolved.primary, ...(resolved.alternatives || [])]
      .filter(item => item?.word && item.word.toLowerCase() !== word)
      .map(item => ({ word:item.word, meaningZh:item.meaningZh || resolved.normalizedChinese || sourceQuery })),
  });
  if (result?.senses?.length && !result.semanticMismatch) return result;
  return null;
}

async function smartLookup(query, options = {}) {
  const q = String(query || "").trim();
  if (!q) {
    const err = new Error("请输入要查找的内容");
    err.code = "EMPTY_QUERY";
    throw err;
  }

  const hasChinese = /[\u3400-\u9fff]/.test(q);
  if (hasChinese) {
    if (!options.forceRefresh && !options.preferredWord) {
      const cachedChinese = await findCachedChineseLookup(q);
      if (cachedChinese) return cachedChinese;
    }

    const resolved = await resolveChineseSearch(q);
    const allCandidates = [resolved.primary, ...(resolved.alternatives || [])]
      .filter(item => item?.word)
      .filter((item, index, list) => list.findIndex(other => other.word.toLowerCase() === item.word.toLowerCase()) === index);
    const preferredWord = String(options.preferredWord || "").trim().toLowerCase();
    if (preferredWord) allCandidates.sort((a, b) => (a.word.toLowerCase() === preferredWord ? -1 : b.word.toLowerCase() === preferredWord ? 1 : 0));

    for (const candidate of allCandidates) {
      if (preferredWord && candidate.word.toLowerCase() !== preferredWord) continue;
      const verified = await lookupResolvedChineseCandidate(candidate, resolved, q);
      if (verified) return verified;
      if (candidate.word.includes(" ")) return buildResolvedPhraseCard(candidate, resolved, q);
    }

    for (const candidate of allCandidates) {
      if (candidate.word.includes(" ")) return buildResolvedPhraseCard(candidate, resolved, q);
      const verified = await lookupResolvedChineseCandidate(candidate, resolved, q);
      if (verified) return verified;
    }

    return {
      word:q,
      sourceQuery:q,
      normalizedQuery:resolved.normalizedChinese,
      autoResolved:true,
      suggestions:allCandidates.map(item => ({ word:item.word, reason:item.meaningZh || resolved.normalizedChinese || q })),
      suggestionTitle:"没有找到可靠的完全匹配",
      suggestionHint:"下面是可能的英文表达。选择一个后再由词典确认，不会自动替换成无关的拼写建议。",
    };
  }

  if (!/^[A-Za-z][A-Za-z\s'-]*$/.test(q)) {
    const err = new Error("暂时无法识别这个输入");
    err.code = "INVALID_SEARCH_QUERY";
    throw err;
  }

  let result = await merriamWebsterLookup(q.toLowerCase(), "primary", { sourceQuery: q });
  if (result.suggestions?.length) {
    if (q.includes(" ")) return result;
    const corrected = String(result.suggestions[0] || "").trim().toLowerCase();
    if (corrected) {
      result = await merriamWebsterLookup(corrected, "primary", { sourceQuery: q });
      result.autoCorrectedFrom = q;
    }
  }
  return result;
}
'''
s = s[:smart_start] + smart_new + s[smart_end:]

s = replace_once(s, '        const result = await smartLookup(query);', '        const result = await smartLookup(query, { forceRefresh:Boolean(body.forceRefresh), preferredWord:String(body.preferredWord || "").trim() });', 'smart route options')

a = replace_once(a, '    searchResolution: null,\n    visualSceneExpanded: false', '    searchResolution: null,\n    lookupAlternativesOpen: false,\n    visualSceneExpanded: false', 'lookup alternatives state')

a = replace_once(a, '''      const audioUrl=String(payload.result?.audioUrl||"").trim();
      if(phonetic) card.phonetic=phonetic;
      if(audioUrl && !card.audioUrl) card.audioUrl=audioUrl;
      if(phonetic || audioUrl){card.updatedAt=new Date().toISOString();saveData();}''', '''      const audioUrl=String(payload.result?.audioUrl||"").trim();
      const audioUrls=Array.isArray(payload.result?.audioUrls)?payload.result.audioUrls.map(String).filter(Boolean):[];
      if(phonetic) card.phonetic=phonetic;
      if(audioUrl && !card.audioUrl) card.audioUrl=audioUrl;
      if(audioUrls.length) card.audioUrls=audioUrls;
      if(payload.result?.pronunciationSource) card.pronunciationSource=String(payload.result.pronunciationSource);
      if(phonetic || audioUrl || audioUrls.length){card.updatedAt=new Date().toISOString();saveData();}''', 'hydrate phrase pronunciation')

old = '''    const resolvedNote = r.sourceQuery && (r.autoResolved || r.autoCorrectedFrom || r.normalizedQuery)
      ? `<div class="auto-resolved-note"><span>已自动识别</span><strong>${escapeHtml(r.sourceQuery)} → ${escapeHtml(r.word)}</strong>${r.normalizedQuery && r.normalizedQuery!==r.sourceQuery?`<small>识别为“${escapeHtml(r.normalizedQuery)}”</small>`:""}</div>`
      : "";'''
new = '''    const resolvedNote = r.sourceQuery && (r.autoResolved || r.autoCorrectedFrom || r.normalizedQuery)
      ? `<div class="auto-resolved-note"><span>已自动识别</span><strong>${escapeHtml(r.sourceQuery)} → ${escapeHtml(r.word)}</strong>${r.normalizedQuery && r.normalizedQuery!==r.sourceQuery?`<small>识别为“${escapeHtml(r.normalizedQuery)}”</small>`:""}</div>`
      : "";
    const alternativeWords=Array.isArray(r.alternatives)?r.alternatives.filter(item=>item?.word&&String(item.word).toLowerCase()!==String(r.word).toLowerCase()):[];
    const alternativePanel=(r.sourceQuery&&/[\\u3400-\\u9fff]/.test(r.sourceQuery)&&(alternativeWords.length||r.autoResolved))?`
      <div class="lookup-recovery-row">
        <button class="text-action" data-action="toggle-lookup-alternatives">${state.lookupAlternativesOpen?"收起其它结果":"不是这个词？换个结果"}</button>
        <button class="text-action" data-action="refresh-lookup">重新识别</button>
      </div>
      ${state.lookupAlternativesOpen&&alternativeWords.length?`<div class="lookup-alternatives">${alternativeWords.map(item=>`<button class="lookup-alternative" data-search-alternative="${escapeHtml(item.word)}"><strong>${escapeHtml(item.word)}</strong><span>${escapeHtml(item.meaningZh||r.normalizedQuery||r.sourceQuery)}</span></button>`).join("")}</div>`:""}`:"";'''
a = replace_once(a, old, new, 'lookup recovery panel')
a = replace_once(a, '    return `${resolvedNote}\n      <div class="word-top learning-card-wordtop">', '    return `${resolvedNote}${alternativePanel}\n      <div class="word-top learning-card-wordtop">', 'insert recovery panel')
a = replace_once(a, '<button class="speaker" data-action="speak" data-word="${escapeHtml(r.word)}" data-audio="${escapeHtml(r.audioUrl||"")}" title="播放美式发音">🔊</button>', '<button class="speaker" data-action="speak" data-word="${escapeHtml(r.word)}" data-audio="${escapeHtml(r.audioUrl||"")}" data-audios="${escapeHtml(JSON.stringify(r.audioUrls||[]))}" title="播放美式发音">🔊</button>', 'lookup phrase audio segments')

a = replace_once(a, '''  function speak(word,audioUrl=""){
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
  }''', '''  async function speak(word,audioUrl="",audioUrls=[]){
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
    if(!("speechSynthesis" in window)){ toast("当前设备无法播放发音"); return; }
    const u=new SpeechSynthesisUtterance(word); u.lang="en-US";u.rate=.88;
    const vs=speechSynthesis.getVoices();
    u.voice=vs.find(v=>v.lang.toLowerCase()==="en-us")||vs.find(v=>v.lang.toLowerCase().startsWith("en"))||null;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }''', 'sequential dictionary audio')

a = replace_once(a, '    if(action==="speak"){speak(el.dataset.word,el.dataset.audio||"");return;}', '    if(action==="speak"){let segments=[];try{segments=JSON.parse(el.dataset.audios||"[]");}catch{}speak(el.dataset.word,el.dataset.audio||"",segments);return;}', 'speak action segments')
a = replace_once(a, '          data-audio="${escapeHtml(card.audioUrl||"")}"\n          title="播放美式发音"', '          data-audio="${escapeHtml(card.audioUrl||"")}"\n          data-audios="${escapeHtml(JSON.stringify(card.audioUrls||[]))}"\n          title="播放美式发音"', 'study phrase audio segments')
a = replace_once(a, '      state.lookup={query:q,result:null};\n      state.lookupStatus="loading";', '      state.lookup={query:q,result:null};\n      state.lookupAlternativesOpen=false;\n      state.lookupStatus="loading";', 'reset alternatives on submit')

anchor = '''    document.querySelectorAll("[data-suggestion]").forEach(el=>el.addEventListener("click",async ()=>{
      const q=el.dataset.suggestion;
      state.lookup={query:q,result:null};state.lookupStatus="loading";render();
      try{
        const payload=await api("/api/dictionary/lookup",{method:"POST",body:{word:q,mode:"primary"}});
        state.lookup={query:q,result:payload.result};state.selectedSenseId=payload.result?.senses?.[0]?.id||null;state.lookupStatus="idle";render();
      }catch(err){state.lookupStatus="idle";showErrorNotice(err,"暂时没有查到这个词");render();}
    }));
'''
addition = anchor + '''
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
'''
a = replace_once(a, anchor, addition, 'alternative click binding')

a = replace_once(a, '    if(action==="dismiss-notice"){state.notice=null;render();return;}', '''    if(action==="dismiss-notice"){state.notice=null;render();return;}
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
    }''', 'lookup recovery actions')

a = replace_once(a, '    if(action==="clear-lookup"){state.lookup=null;state.lookupStatus="idle";state.loadingMoreSenses=false;state.selectedSenseId=null;state.addDraft=null;render();return;}', '    if(action==="clear-lookup"){state.lookup=null;state.lookupStatus="idle";state.lookupAlternativesOpen=false;state.loadingMoreSenses=false;state.selectedSenseId=null;state.addDraft=null;render();return;}', 'clear lookup alternatives')
a = replace_once(a, 'const card={id:uid(),word:r.word,phonetic:r.phonetic,audioUrl:r.audioUrl||"",pos:s.pos,meaningZh:s.meaningZh,exampleEn:s.exampleEn,exampleZh:s.exampleZh,senseIntentEn:s.senseIntentEn||"",avoidVisualEn:Array.isArray(s.avoidVisualEn)?s.avoidVisualEn:[],sourceQuery:r.sourceQuery||state.lookup?.query||r.word,stage:"select",createdAt:now,updatedAt:now,reviewCount:0,nextReviewAt:null,memoryHistory:[],visualNote:"",imageData:null,userSentence:""};', 'const card={id:uid(),word:r.word,phonetic:r.phonetic,audioUrl:r.audioUrl||"",audioUrls:Array.isArray(r.audioUrls)?r.audioUrls:[],pronunciationSource:r.pronunciationSource||"",pos:s.pos,meaningZh:s.meaningZh,exampleEn:s.exampleEn,exampleZh:s.exampleZh,senseIntentEn:s.senseIntentEn||"",avoidVisualEn:Array.isArray(s.avoidVisualEn)?s.avoidVisualEn:[],sourceQuery:r.sourceQuery||state.lookup?.query||r.word,stage:"select",createdAt:now,updatedAt:now,reviewCount:0,nextReviewAt:null,memoryHistory:[],visualNote:"",imageData:null,userSentence:""};', 'save phrase pronunciation metadata')

c += r'''

/* v0.8.3 — verified lookup recovery */
.lookup-recovery-row{display:flex;align-items:center;gap:14px;margin:10px 0 2px;padding:0 2px}.lookup-recovery-row .text-action{font-size:11px;color:#6f7d90}.lookup-recovery-row .text-action:first-child{color:#3f73e5;font-weight:800}
.lookup-alternatives{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 18px;padding:12px;border:1px solid #e5eaf1;border-radius:12px;background:#fafbfd}
.lookup-alternative{display:flex;align-items:baseline;gap:7px;padding:8px 11px;border:1px solid #dbe3ee;border-radius:10px;background:#fff;color:#23314a;transition:transform 140ms var(--ease-out),border-color 160ms ease,background-color 160ms ease}
.lookup-alternative:hover{border-color:#b9cdf5;background:#f7f9ff}.lookup-alternative:active{transform:scale(.98)}.lookup-alternative strong{font-size:12px}.lookup-alternative span{font-size:10px;color:#8a96a8}
'''

server.write_text(s, encoding='utf-8')
app.write_text(a, encoding='utf-8')
css.write_text(c, encoding='utf-8')
