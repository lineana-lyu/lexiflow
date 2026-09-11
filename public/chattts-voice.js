(() => {
  "use strict";
  const API_ORIGIN = location.protocol === "file:" ? "http://127.0.0.1:4177" : "";
  let activeAudio = null;

  function clean(v){ return String(v || "").trim(); }
  function notifyUnavailable(){
    console.warn("LexiFlow ChatTTS candidate-3 voice is unavailable. Windows speech synthesis is intentionally not used.");
  }
  async function play(text){
    const value=clean(text); if(!value)return false;
    try{
      const response=await fetch(`${API_ORIGIN}/api/tts/chattts`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:value})});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||!payload?.ok||!payload.audioDataUrl)return false;
      try{activeAudio?.pause();}catch{}
      activeAudio=new Audio(payload.audioDataUrl);
      await activeAudio.play();
      return true;
    }catch{return false;}
  }

  document.addEventListener("click",async event=>{
    const sentence=event.target?.closest?.("[data-hydrated-sentence], .sentence-speaker");
    if(sentence){
      const text=clean(sentence.dataset.hydratedSentence || sentence.closest(".sentence-audio-line")?.querySelector(".sentence-audio-text")?.textContent);
      if(!text)return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      if(!(await play(text)))notifyUnavailable();
      return;
    }

    const speaker=event.target?.closest?.('[data-action="speak"]');
    if(!speaker)return;
    const audio=clean(speaker.dataset.audio);
    let audios=[];try{audios=JSON.parse(speaker.dataset.audios||"[]").filter(Boolean);}catch{}
    if(audio||audios.length)return; // Real dictionary/Wikimedia audio remains first choice.
    const word=clean(speaker.dataset.word || speaker.closest(".word-line")?.querySelector("h2")?.textContent || speaker.closest(".learning-card-wordtop")?.querySelector("h2")?.textContent);
    if(!word)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    if(!(await play(word)))notifyUnavailable();
  },true);
})();
