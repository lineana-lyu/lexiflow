from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "public" / "app.js"


def replace_once(text: str, before: str, after: str) -> str:
    count = text.count(before)
    if count != 1:
        raise SystemExit(f"expected one match, got {count}: {before[:120]!r}")
    return text.replace(before, after, 1)


text = APP.read_text(encoding="utf-8")

# Entering Settings must be a pure client-side navigation. Provider diagnostics are
# already refreshed at startup and remain available behind the explicit refresh button.
text = replace_once(
    text,
    '      if(state.route==="settings"||state.route==="add") refreshProviderStatus(true);',
    '      if(state.route==="add") refreshProviderStatus(true);',
)

old_speech = '''  async function speak(word,audioUrl="",audioUrls=[]){
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
  }

  function speakSentence(sentence){
    const text=String(sentence||"").trim();
    if(!text)return;
    if(!("speechSynthesis" in window)){ toast("当前设备无法播放例句"); return; }
    const u=new SpeechSynthesisUtterance(text);
    u.lang="en-US";
    u.rate=.9;
    const vs=speechSynthesis.getVoices();
    u.voice=vs.find(v=>v.lang.toLowerCase()==="en-us")||vs.find(v=>v.lang.toLowerCase().startsWith("en"))||null;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
'''

new_speech = '''  async function playNaturalTts(text){
    const value=String(text||"").trim();
    if(!value)return false;
    const player=window.LexiFlowNaturalTts?.play;
    if(typeof player!=="function")return false;
    try{return Boolean(await player(value));}catch{return false;}
  }

  async function speak(word,audioUrl="",audioUrls=[]){
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
    if(await playNaturalTts(word))return;
    toast("当前没有可用的自然发音，请稍后重试");
  }

  async function speakSentence(sentence){
    const text=String(sentence||"").trim();
    if(!text)return;
    if(await playNaturalTts(text))return;
    toast("当前没有可用的自然例句发音，请稍后重试");
  }
'''

text = replace_once(text, old_speech, new_speech)
APP.write_text(text, encoding="utf-8")
print("Applied non-blocking Settings navigation and Kokoro-only fallback")
