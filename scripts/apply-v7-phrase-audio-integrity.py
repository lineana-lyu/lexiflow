from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def write(rel, text):
    (ROOT / rel).write_text(text, encoding="utf-8")


def sub_once(text, pattern, replacement, label, flags=re.S):
    new_text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one replacement, got {count}")
    return new_text


# ---------------------------------------------------------------------------
# public/app.js
# Phrase audio must be revalidated as a whole expression before dictionary
# audio is allowed to play. Stale component recordings are cleared when a
# saved phrase card is hydrated.
# ---------------------------------------------------------------------------
app = read("public/app.js")

ensure_card = r'''  async function ensureCardPronunciation(card){
    const cardId=String(card?.id||"");
    const word=String(card?.word||"").trim();
    const existingAudios=Array.isArray(card?.audioUrls)?card.audioUrls.filter(Boolean):[];
    const isPhrase=isMultiWordExpression(word);
    if(!cardId || !word || state.pronunciationHydration[cardId]) return;
    // A saved phrase may contain legacy component audio (for example hang.mp3
    // stored on a "hang out" card). Never treat its mere presence as proof that
    // the recording belongs to the whole expression. Phrases are always
    // revalidated once per session; single words retain the fast path.
    if(!isPhrase && (card.audioUrl || existingAudios.length)) return;
    state.pronunciationHydration[cardId]="loading";
    try{
      const payload=await api("/api/dictionary/pronunciation",{method:"POST",body:{word}});
      const target=getCard(cardId);
      if(!target){state.pronunciationHydration[cardId]="done";return;}
      const result=payload?.result||{};
      const phonetic=String(result.phonetic||"").trim();
      let changed=false;
      if(phonetic && target.phonetic!==phonetic){target.phonetic=phonetic;changed=true;}

      if(isPhrase){
        const verified=verifiedWholeExpressionAudio(result);
        const nextAudioUrl=verified[0]||"";
        const nextAudioUrls=nextAudioUrl?[nextAudioUrl]:[];
        if(String(target.audioUrl||"")!==nextAudioUrl){target.audioUrl=nextAudioUrl;changed=true;}
        if(JSON.stringify(Array.isArray(target.audioUrls)?target.audioUrls.filter(Boolean):[])!==JSON.stringify(nextAudioUrls)){
          target.audioUrls=nextAudioUrls;changed=true;
        }
        const exact=Boolean(nextAudioUrl);
        if(target.dictionaryAudio!==exact){target.dictionaryAudio=exact;changed=true;}
        if(target.wholeExpressionAudio!==exact){target.wholeExpressionAudio=exact;changed=true;}
        if(target.pronunciationExactMatch!==(result.exactMatch===true)){target.pronunciationExactMatch=result.exactMatch===true;changed=true;}
        const source=String(result.pronunciationSource||"").trim();
        if(String(target.pronunciationSource||"")!==source){target.pronunciationSource=source;changed=true;}
      }else{
        const audioUrl=String(result.audioUrl||"").trim();
        const audioUrls=Array.isArray(result.audioUrls)?result.audioUrls.map(String).filter(Boolean):[];
        if(audioUrl && !target.audioUrl){target.audioUrl=audioUrl;changed=true;}
        if(audioUrls.length && JSON.stringify(target.audioUrls||[])!==JSON.stringify(audioUrls)){target.audioUrls=audioUrls;changed=true;}
        if(result.pronunciationSource && target.pronunciationSource!==String(result.pronunciationSource)){
          target.pronunciationSource=String(result.pronunciationSource);changed=true;
        }
      }
      if(changed){target.updatedAt=new Date().toISOString();saveData();}
      state.pronunciationHydration[cardId]="done";
      render();
    }catch{
      state.pronunciationHydration[cardId]="failed";
      render();
    }
  }

  function showNotice'''

app = sub_once(
    app,
    r'  async function ensureCardPronunciation\(card\)\{.*?\n  \}\n\n  function showNotice',
    ensure_card,
    "replace ensureCardPronunciation",
)

speak_block = r'''  function isMultiWordExpression(value){
    return /\s/.test(String(value||"").trim());
  }

  function audioCandidates(result){
    const list=[];
    const direct=String(result?.audioUrl||"").trim();
    if(direct)list.push(direct);
    if(Array.isArray(result?.audioUrls)){
      for(const src of result.audioUrls){const value=String(src||"").trim();if(value&&!list.includes(value))list.push(value);}
    }
    return list;
  }

  function verifiedWholeExpressionAudio(result){
    // Transferable dictionary rule: audio belongs to an expression only when
    // the dictionary matched that exact headword and explicitly marks the
    // recording as whole-expression audio. Component recordings never qualify.
    if(result?.dictionaryAudio!==true || result?.wholeExpressionAudio!==true || result?.exactMatch!==true)return [];
    const candidates=audioCandidates(result);
    // One click must produce one continuous recording. Never concatenate
    // multiple dictionary files with different voices/pauses into a phrase.
    return candidates.length?[candidates[0]]:[];
  }

  async function speak(word,audioUrl="",audioUrls=[]){
    const value=String(word||"").trim();
    if(!value)return;
    const isExpression=isMultiWordExpression(value);

    // Existing/saved audio is trusted only for a single lexical word. A phrase
    // may carry stale per-word recordings from older builds, so it must first
    // be revalidated by the pronunciation endpoint.
    if(!isExpression){
      const supplied=Array.isArray(audioUrls)?audioUrls.filter(Boolean):[];
      if(audioUrl)supplied.unshift(audioUrl);
      if(await playDictionaryAudio(supplied))return;
    }

    try{
      const payload=await api("/api/dictionary/pronunciation",{method:"POST",body:{word:value}});
      const result=payload?.result||{};
      if(isExpression){
        const verified=verifiedWholeExpressionAudio(result);
        if(await playDictionaryAudio(verified))return;
      }else{
        const resolved=audioCandidates(result);
        if(await playDictionaryAudio(resolved))return;
      }
    }catch{}

    // No verified whole-expression dictionary recording: synthesize the entire
    // expression in one TTS request so voice, prosody and timing stay coherent.
    if(await playNaturalTts(value))return;
    toast("当前没有可用的自然发音，请稍后重试");
  }

  async function speakSentence'''

app = sub_once(
    app,
    r'  async function speak\(word,audioUrl="",audioUrls=\[\]\)\{.*?\n  \}\n\n  async function speakSentence',
    speak_block,
    "replace speak phrase-audio policy",
)

write("public/app.js", app)


# ---------------------------------------------------------------------------
# public/example-hydration.js
# A pronunciation refresh must be able to REMOVE stale phrase component audio,
# not only add non-empty fields. Whole-expression IPA from the phrase dictionary
# wins; component IPA composition is only a last fallback.
# ---------------------------------------------------------------------------
hydration = read("public/example-hydration.js")

patch_pron = r'''  function patchPronunciation(result, pronunciation) {
    if (!result || !pronunciation) return;
    const phonetic = clean(pronunciation.phonetic);
    const rawAudioUrl = clean(pronunciation.audioUrl);
    const rawAudioUrls = Array.isArray(pronunciation.audioUrls) ? pronunciation.audioUrls.map(clean).filter(Boolean) : [];
    const isPhrase = /\s/.test(normalizeWord(result.word));

    if (phonetic) result.phonetic = phonetic;

    if (isPhrase) {
      const verified = pronunciation.dictionaryAudio === true && pronunciation.wholeExpressionAudio === true && pronunciation.exactMatch === true;
      const first = verified ? (rawAudioUrl || rawAudioUrls[0] || "") : "";
      // Important: assign empty values too. This actively removes legacy
      // component audio that may already be attached to the phrase result.
      result.audioUrl = first;
      result.audioUrls = first ? [first] : [];
      result.dictionaryAudio = Boolean(first);
      result.wholeExpressionAudio = Boolean(first);
      result.pronunciationExactMatch = pronunciation.exactMatch === true;
    } else {
      if (rawAudioUrl) result.audioUrl = rawAudioUrl;
      if (rawAudioUrls.length) result.audioUrls = rawAudioUrls;
    }

    if (pronunciation.pronunciationSource) result.pronunciationSource = clean(pronunciation.pronunciationSource);
    if (!currentLookupMatches(result.word)) return;
    const phoneticNode = document.querySelector(".learning-card-wordtop .phonetic");
    if (phoneticNode && phonetic) phoneticNode.textContent = phonetic.startsWith("/") || phonetic.startsWith("[") ? phonetic : `/${phonetic}/`;
    const speaker = document.querySelector(".learning-card-wordtop .speaker[data-action=\"speak\"]");
    if (speaker) {
      speaker.dataset.audio = clean(result.audioUrl);
      speaker.dataset.audios = JSON.stringify(Array.isArray(result.audioUrls) ? result.audioUrls : []);
    }
  }

  function phoneticToken'''

hydration = sub_once(
    hydration,
    r'  function patchPronunciation\(result, pronunciation\) \{.*?\n  \}\n\n  function phoneticToken',
    patch_pron,
    "replace patchPronunciation",
)

hydration = sub_once(
    hydration,
    r'    if\(isPhrase&&!pronunciation\?\.dictionaryAudio\)\{\n      const composite=await composePhrasePhonetic\(result\.word\);\n      if\(composite\)patchPronunciation\(result,\{phonetic:composite\}\);\n    \}',
    '    if(isPhrase&&!clean(pronunciation?.phonetic)){\n      const composite=await composePhrasePhonetic(result.word);\n      if(composite)patchPronunciation(result,{phonetic:composite});\n    }',
    "only compose phrase IPA when whole-expression IPA is unavailable",
)

write("public/example-hydration.js", hydration)


# ---------------------------------------------------------------------------
# public/kokoro-voice.js
# If the shared pronunciation bridge is not yet available, an expression must
# synthesize the WHOLE text. Do not let a stale supplied audio URL fall through
# to the base handler.
# ---------------------------------------------------------------------------
voice = read("public/kokoro-voice.js")
voice = sub_once(
    voice,
    r'    if\(audio \|\| \(!isExpression && audios\.length\)\)return;',
    '    if(!isExpression && (audio || audios.length))return;',
    "expression fallback must ignore unverified supplied audio",
    flags=0,
)
write("public/kokoro-voice.js", voice)


# ---------------------------------------------------------------------------
# server-runtime.js
# Collapse a verified pronunciation to one continuous recording and only mark
# wholeExpressionAudio when an exact phrase recording actually exists.
# ---------------------------------------------------------------------------
runtime = read("server-runtime.js")
old = '''    const componentOnly = queryKind === "phrase" && pronunciation?.exactMatch !== true;
    const safeAudioUrl = componentOnly ? "" : rawAudioUrl;
    const safeAudioUrls = componentOnly ? [] : (rawAudioUrls.length ? rawAudioUrls : (safeAudioUrl ? [safeAudioUrl] : []));
    const dictionaryAudio = Boolean(!componentOnly && (safeAudioUrl || safeAudioUrls.length));'''
new = '''    const componentOnly = queryKind === "phrase" && pronunciation?.exactMatch !== true;
    const candidateAudioUrls = Array.from(new Set([rawAudioUrl, ...rawAudioUrls].filter(Boolean)));
    // One dictionary recording owns one expression. Even if an upstream sends
    // several audio files, never concatenate them into a single phrase playback.
    const singleAudio = componentOnly ? "" : (candidateAudioUrls[0] || "");
    const safeAudioUrl = singleAudio;
    const safeAudioUrls = singleAudio ? [singleAudio] : [];
    const dictionaryAudio = Boolean(singleAudio);'''
if old not in runtime:
    raise RuntimeError("server-runtime audio normalization block not found")
runtime = runtime.replace(old, new, 1)
runtime = sub_once(
    runtime,
    r'          wholeExpressionAudio: queryKind !== "phrase" \|\| pronunciation\?\.exactMatch === true,',
    '          wholeExpressionAudio: queryKind !== "phrase" || (pronunciation?.exactMatch === true && Boolean(singleAudio)),',
    "wholeExpressionAudio requires an actual exact recording",
    flags=0,
)
write("server-runtime.js", runtime)


# ---------------------------------------------------------------------------
# Durable regression checks.
# ---------------------------------------------------------------------------
check = read("scripts/check-user-surface-v4.js")
check = check.replace(
    'const electron=fs.readFileSync(path.join(root,"electron-main.js"),"utf8");\n',
    'const electron=fs.readFileSync(path.join(root,"electron-main.js"),"utf8");\nconst runtime=fs.readFileSync(path.join(root,"server-runtime.js"),"utf8");\nconst kokoro=fs.readFileSync(path.join(root,"public","kokoro-voice.js"),"utf8");\n',
    1,
)
anchor = 'assert(!electron.includes("APP_ICON_DATA_URL"),"stale embedded desktop icon must not return");\n'
extra = '''assert(!electron.includes("APP_ICON_DATA_URL"),"stale embedded desktop icon must not return");
assert(app.includes("verifiedWholeExpressionAudio")&&app.includes("if(!isExpression){")&&app.includes("target.audioUrl=nextAudioUrl"),"phrase playback must revalidate exact whole-expression audio and clear stale saved audio");
assert(hydration.includes("pronunciation.wholeExpressionAudio === true")&&hydration.includes("result.audioUrl = first")&&hydration.includes("if(isPhrase&&!clean(pronunciation?.phonetic))"),"lookup hydration must remove component audio and preserve whole-expression IPA priority");
assert(kokoro.includes("if(!isExpression && (audio || audios.length))return;"),"startup fallback must synthesize expressions instead of trusting supplied component audio");
assert(runtime.includes("const singleAudio = componentOnly ? \"\" : (candidateAudioUrls[0] || \"\")")&&runtime.includes("Boolean(singleAudio)"),"runtime must expose at most one verified continuous phrase recording");
'''
if anchor not in check:
    raise RuntimeError("check-user-surface anchor not found")
check = check.replace(anchor, extra, 1)
write("scripts/check-user-surface-v4.js", check)

print("V7 phrase audio integrity patch staged.")
