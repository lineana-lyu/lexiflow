from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def write(rel, text):
    (ROOT / rel).write_text(text, encoding="utf-8")


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing expected block: {label}")
    return text.replace(old, new, 1)


# 1) Phrase dictionary build: reject partial/component IPA and bump schema so old DBs rebuild.
rel = "scripts/prepare-phrase-dictionary.js"
text = read(rel)
text = replace_once(
    text,
    'const DEFAULT_OUTPUT = path.join(ROOT, "resources", "phrase-dictionary.sqlite");\n',
    'const DEFAULT_OUTPUT = path.join(ROOT, "resources", "phrase-dictionary.sqlite");\nconst PHRASE_SCHEMA = "lexiflow-open-dictionary-phrases-v2-whole-ipa";\n',
    "phrase schema constant",
)
text = replace_once(
    text,
    '''function normalizeHeadword(value) {\n  return clean(value).toLowerCase();\n}\n\nfunction priorityRank(value) {''',
    '''function normalizeHeadword(value) {\n  return clean(value).toLowerCase();\n}\n\nfunction expressionParts(value) {\n  return clean(value).match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g) || [];\n}\n\nfunction ipaParts(value) {\n  const raw = clean(value).replace(/^\\/+|\\/+$/g, "").replace(/^\\[+|\\]+$/g, "");\n  return raw.split(/\\s+/).map(part => part.trim()).filter(Boolean);\n}\n\nfunction isWholeExpressionIpa(headword, ipa) {\n  const words = expressionParts(headword);\n  const phones = ipaParts(ipa);\n  return words.length >= 2 && phones.length >= words.length;\n}\n\nfunction priorityRank(value) {''',
    "phrase IPA helpers",
)
text = replace_once(
    text,
    '''      const ipa = clean(pronunciation?.ipa || pronunciation?.text);\n      if (!ipa) continue;\n      pronunciations.push({ ipa, us:isUsPronunciation(pronunciation) });''',
    '''      const ipa = clean(pronunciation?.ipa || pronunciation?.text);\n      if (!ipa || !isWholeExpressionIpa(normalized, ipa)) continue;\n      pronunciations.push({ ipa, us:isUsPronunciation(pronunciation) });''',
    "reject component IPA during import",
)
text = replace_once(
    text,
    '''    db = new DatabaseSync(filePath, { readOnly:true });\n    return Number(db.prepare("SELECT value FROM metadata WHERE key='phrase_count'").get()?.value || 0) > 0;''',
    '''    db = new DatabaseSync(filePath, { readOnly:true });\n    const count = Number(db.prepare("SELECT value FROM metadata WHERE key='phrase_count'").get()?.value || 0);\n    const schema = String(db.prepare("SELECT value FROM metadata WHERE key='schema'").get()?.value || "");\n    return count > 0 && schema === PHRASE_SCHEMA;''',
    "force schema rebuild",
)
text = replace_once(
    text,
    '    meta.run("schema", "lexiflow-open-dictionary-phrases-v1");',
    '    meta.run("schema", PHRASE_SCHEMA);',
    "write v2 schema",
)
text = replace_once(
    text,
    '''  DEFAULT_OUTPUT,\n  compactEntry,''',
    '''  DEFAULT_OUTPUT,\n  PHRASE_SCHEMA,\n  isWholeExpressionIpa,\n  compactEntry,''',
    "export phrase IPA validator",
)
write(rel, text)


# 2) Runtime phrase dictionary: never surface old DB component IPA as a whole phrase transcription.
rel = "lib/phrase-dictionary.js"
text = read(rel)
text = replace_once(
    text,
    '''function normalizeHeadword(value) {\n  return clean(value).toLowerCase();\n}\n\nfunction candidatePaths() {''',
    '''function normalizeHeadword(value) {\n  return clean(value).toLowerCase();\n}\n\nfunction expressionParts(value) {\n  return clean(value).match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g) || [];\n}\n\nfunction ipaParts(value) {\n  const raw = clean(value).replace(/^\\/+|\\/+$/g, "").replace(/^\\[+|\\]+$/g, "");\n  return raw.split(/\\s+/).map(part => part.trim()).filter(Boolean);\n}\n\nfunction isWholeExpressionIpa(headword, ipa) {\n  const words = expressionParts(headword);\n  const phones = ipaParts(ipa);\n  return words.length >= 2 && phones.length >= words.length;\n}\n\nfunction candidatePaths() {''',
    "runtime phrase IPA helpers",
)
text = replace_once(
    text,
    '''  const chosen = safeMode === "expanded" ? senses.slice(0, 3) : senses.slice(0, 1);\n  const word = clean(row.headword || row.normalized_headword).toLowerCase();\n  return {\n    word,\n    phonetic:formatPhonetic(row.phonetic_us || row.phonetic_any),\n    audioUrl:"",\n    audioUrls:[],\n    pronunciationSource:(row.phonetic_us || row.phonetic_any) ? "open-dictionary-wiktionary-ipa" : "",''',
    '''  const chosen = safeMode === "expanded" ? senses.slice(0, 3) : senses.slice(0, 1);\n  const word = clean(row.headword || row.normalized_headword).toLowerCase();\n  const rawPhonetic = clean(row.phonetic_us || row.phonetic_any);\n  const verifiedPhonetic = isWholeExpressionIpa(word, rawPhonetic) ? rawPhonetic : "";\n  return {\n    word,\n    phonetic:formatPhonetic(verifiedPhonetic),\n    audioUrl:"",\n    audioUrls:[],\n    pronunciationSource:verifiedPhonetic ? "open-dictionary-wiktionary-ipa" : "",\n    wholeExpressionPhonetic:Boolean(verifiedPhonetic),''',
    "runtime reject old component IPA",
)
text = replace_once(
    text,
    'module.exports = { status, close, lookupExact, rowToResult, formatPhonetic };',
    'module.exports = { status, close, lookupExact, rowToResult, formatPhonetic, isWholeExpressionIpa };',
    "export runtime validator",
)
write(rel, text)


# 3) Pronunciation endpoint: phrase audio is always one whole-expression TTS request.
# Dictionary audio remains for single words only. Phrase IPA uses verified local whole IPA or composed exact word IPA.
rel = "server-runtime.js"
text = read(rel)
start_marker = '  if (queryKind === "phrase") {\n    let remotePronunciation = null;'
end_marker = '\n\n  if (local?.audioUrl) {'
start = text.find(start_marker)
if start < 0:
    raise SystemExit("missing expected block: phrase pronunciation start")
end = text.find(end_marker, start)
if end < 0:
    raise SystemExit("missing expected block: phrase pronunciation end")
new_block = '''  if (queryKind === "phrase") {\n    // Multi-word playback has one canonical policy: synthesize the entire\n    // expression in one TTS request. Dictionary APIs often expose an exact\n    // phrase headword while attaching audio/IPA for only the lexical head, so\n    // phrase audio is never accepted from the single-word dictionary channel.\n    let phrasePhonetic = clean(local?.phonetic);\n    let phoneticSource = phrasePhonetic ? clean(local?.pronunciationSource) : "";\n    if (!phrasePhonetic) {\n      phrasePhonetic = await composePhrasePhonetic(word);\n      if (phrasePhonetic) phoneticSource = "composed-exact-word-ipa";\n    }\n\n    writeJson(res, 200, {\n      ok:true,\n      result:{\n        phonetic:phrasePhonetic,\n        audioUrl:"",\n        audioUrls:[],\n        pronunciationSource:phoneticSource,\n        exactMatch:Boolean(local?.dictionaryExact || local?.exactMatch),\n        wholeExpressionPhonetic:Boolean(phrasePhonetic),\n        dictionaryAudio:false,\n        wholeExpressionAudio:false,\n        localLookup:Boolean(local),\n        pronunciationPolicy:"whole-expression-tts-v3",\n      },\n    });\n    return true;\n  }'''
text = text[:start] + new_block + text[end:]
write(rel, text)


# 4) UI: expressions bypass dictionary audio entirely; allow natural inflection in phrase examples;
# suppress the nonsensical "x -> x" auto-recognition banner.
rel = "public/app.js"
text = read(rel)
verified_start = text.find('  function verifiedWholeExpressionAudio(result){')
speak_start = text.find('  async function speak(word,audioUrl="",audioUrls=[]){', verified_start)
if verified_start < 0 or speak_start < 0:
    raise SystemExit("missing expected block: phrase audio helper/speak")
text = text[:verified_start] + text[speak_start:]
speak_start = text.find('  async function speak(word,audioUrl="",audioUrls=[]){')
speak_end = text.find('\n\n  async function speakSentence(sentence){', speak_start)
if speak_start < 0 or speak_end < 0:
    raise SystemExit("missing expected block: speak function")
new_speak = '''  async function speak(word,audioUrl="",audioUrls=[]){\n    const value=String(word||"").trim();\n    if(!value)return;\n    const isExpression=isMultiWordExpression(value);\n\n    // A phrase is a single pronunciation unit. Never trust saved or dictionary\n    // component audio for it; synthesize the complete text in one request.\n    if(isExpression){\n      if(await playNaturalTts(value))return;\n      toast("当前没有可用的完整短语发音，请稍后重试");\n      return;\n    }\n\n    const supplied=Array.isArray(audioUrls)?audioUrls.filter(Boolean):[];\n    if(audioUrl)supplied.unshift(audioUrl);\n    if(await playDictionaryAudio(supplied))return;\n\n    try{\n      const payload=await api("/api/dictionary/pronunciation",{method:"POST",body:{word:value}});\n      const result=payload?.result||{};\n      const resolved=audioCandidates(result);\n      if(await playDictionaryAudio(resolved))return;\n    }catch{}\n\n    if(await playNaturalTts(value))return;\n    toast("当前没有可用的自然发音，请稍后重试");\n  }'''
text = text[:speak_start] + new_speak + text[speak_end:]
text = replace_once(
    text,
    '''    if(!example||!target)return false;\n    if(target.includes(" "))return example.includes(target);\n    return sentenceUsesTargetWord(example,target);''',
    '''    if(!example||!target)return false;\n    if(target.includes(" ")){\n      if(example.includes(target))return true;\n      const parts=target.split(" ").filter(Boolean);\n      const head=parts.shift()||"";\n      const tail=parts.join(" ");\n      if(!head||!tail)return false;\n      return targetWordForms(head).some(form=>new RegExp(`\\\\b${escapeRegExp(`${form} ${tail}`)}\\\\b`,"i").test(example));\n    }\n    return sentenceUsesTargetWord(example,target);''',
    "phrase example inflection",
)
text = replace_once(
    text,
    '''    const resolvedNote = r.sourceQuery && (r.autoResolved || r.autoCorrectedFrom || r.normalizedQuery)\n      ? `<div class="auto-resolved-note"><span>已自动识别</span><strong>${escapeHtml(r.sourceQuery)} → ${escapeHtml(r.word)}</strong>${r.normalizedQuery && r.normalizedQuery!==r.sourceQuery?`<small>识别为“${escapeHtml(r.normalizedQuery)}”</small>`:""}</div>`\n      : "";''',
    '''    const normalizedDiff=Boolean(r.normalizedQuery && String(r.normalizedQuery).toLowerCase()!==String(r.sourceQuery||"").toLowerCase());\n    const resolvedNote = r.sourceQuery && (r.autoResolved || r.autoCorrectedFrom || normalizedDiff)\n      ? `<div class="auto-resolved-note"><span>已自动识别</span><strong>${escapeHtml(r.sourceQuery)} → ${escapeHtml(r.word)}</strong>${normalizedDiff?`<small>识别为“${escapeHtml(r.normalizedQuery)}”</small>`:""}</div>`\n      : "";''',
    "hide identical auto-recognition banner",
)
write(rel, text)


# 5) Regression coverage for the exact failure shown by look forward to.
rel = "scripts/check-phrase-dictionary-v5.js"
text = read(rel)
insert_before = 'console.log("Phrase dictionary V5 checks passed");\n'
if insert_before not in text:
    raise SystemExit("missing expected block: phrase check footer")
extra = r'''

const partial = compactEntry({
  headword:"look forward to",
  normalized_headword:"look forward to",
  pos_groups:[{
    pos:"verb",
    pronunciations:[{ ipa:"ˈfɔrwərd", tags:["US"] }],
    meanings:[{
      sense_id:"s-look-forward",
      priority:"core",
      short_gloss:"期待；盼望",
      learner_explanation:"期待未来发生的事情。",
      examples:[{text:"I'm really looking forward to seeing you next weekend.",translation:"我真的很期待下周末见到你。"}],
    }],
  }],
});
assert(partial, "look forward to should remain a valid phrase entry");
assert.strictEqual(partial.phoneticUs, "", "single-component IPA must not be stored as a whole three-word phrase transcription");
const partialLegacyRow = rowToResult({
  normalized_headword:"look forward to",
  headword:"look forward to",
  phonetic_us:"ˈfɔrwərd",
  phonetic_any:"ˈfɔrwərd",
  senses_json:JSON.stringify(partial.senses),
});
assert.strictEqual(partialLegacyRow.phonetic, "", "runtime must also reject component IPA from an already-built legacy phrase database");

const complete = compactEntry({
  headword:"look forward to",
  normalized_headword:"look forward to",
  pos_groups:[{
    pos:"verb",
    pronunciations:[{ ipa:"lʊk ˈfɔrwərd tə", tags:["US"] }],
    meanings:[{
      sense_id:"s-look-forward-complete",
      priority:"core",
      short_gloss:"期待；盼望",
      learner_explanation:"期待未来发生的事情。",
      examples:[{text:"I look forward to hearing from you.",translation:"我期待收到你的回复。"}],
    }],
  }],
});
assert.strictEqual(complete.phoneticUs, "lʊk ˈfɔrwərd tə", "a verified full three-word IPA should be retained");
'''
text = text.replace(insert_before, extra + "\n" + insert_before, 1)
write(rel, text)


# 6) User-surface regression checks: phrases must use whole-text TTS, and runtime must not expose phrase dictionary audio.
rel = "scripts/check-user-surface-v4.js"
text = read(rel)
text = replace_once(
    text,
    '''assert(app.includes("verifiedWholeExpressionAudio")&&app.includes("if(!isExpression){")&&app.includes("target.audioUrl=nextAudioUrl"),"phrase playback must revalidate exact whole-expression audio and clear stale saved audio");''',
    '''assert(!app.includes("verifiedWholeExpressionAudio")&&app.includes("if(isExpression){")&&app.includes("完整短语发音"),"phrase playback must bypass dictionary/component audio and synthesize the whole expression");''',
    "surface phrase playback policy",
)
text = replace_once(
    text,
    '''assert(runtime.includes('pronunciationPolicy:"whole-expression-v2"')&&runtime.includes("exactWholeAudio")&&runtime.includes("composePhrasePhonetic"),"runtime must expose one verified phrase recording or synthesize the complete expression");''',
    '''assert(runtime.includes('pronunciationPolicy:"whole-expression-tts-v3"')&&runtime.includes("dictionaryAudio:false")&&runtime.includes("wholeExpressionAudio:false")&&runtime.includes("composePhrasePhonetic"),"runtime phrase pronunciation must expose full IPA metadata but never component dictionary audio");''',
    "runtime phrase playback policy",
)
text = text.replace(
    'console.log("User surface V4 checks passed.");',
    'assert(app.includes("normalizedDiff")&&app.includes("targetWordForms(head)"),"phrase result UX must hide identical auto-resolution and accept inflected phrase examples");\nconsole.log("User surface V4 checks passed.");',
    1,
)
write(rel, text)

print("V7 phrase pronunciation v2 fix staged.")
