(() => {
  "use strict";

  const API_ORIGIN = location.protocol === "file:" ? "http://127.0.0.1:4177" : "";
  const DEFAULT_VOICE = "af_bella";
  let activeAudio = null;
  let activeButton = null;

  function clean(v){ return String(v || "").trim(); }
  function selectedVoice(){
    return clean(document.documentElement.dataset.lexiflowTtsVoice) || clean(localStorage.getItem("lexiflow-tts-voice")) || DEFAULT_VOICE;
  }

  function showToast(message,duration=3200){
    const text=clean(message);if(!text)return;
    const existing=document.querySelector(".toast[data-tts-toast='1']");
    if(existing)existing.remove();
    const toast=document.createElement("div");
    toast.className="toast";
    toast.dataset.ttsToast="1";
    toast.textContent=text;
    document.body.appendChild(toast);
    setTimeout(()=>toast.remove(),duration);
  }

  function setBusy(button,busy){
    if(!button)return;
    button.classList.toggle("tts-loading",busy);
    button.setAttribute("aria-busy",busy?"true":"false");
    if(busy) button.dataset.ttsOriginalTitle=button.getAttribute("title")||"";
    if(busy) button.setAttribute("title","正在后台准备本地自然语音…");
    else if(Object.prototype.hasOwnProperty.call(button.dataset,"ttsOriginalTitle")){
      const original=button.dataset.ttsOriginalTitle;
      if(original)button.setAttribute("title",original);else button.removeAttribute("title");
      delete button.dataset.ttsOriginalTitle;
    }
  }

  async function play(text,button){
    const value=clean(text); if(!value)return false;
    const voice=selectedVoice();
    setBusy(activeButton,false);
    activeButton=button||null;
    setBusy(activeButton,true);
    let slowNoticeTimer=setTimeout(()=>{
      showToast("首次自然发音正在后台准备，你可以继续查词或进入设置。",4200);
    },700);
    try{
      const response=await fetch(`${API_ORIGIN}/api/tts/kokoro`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({text:value,voice,speed:.94})
      });
      clearTimeout(slowNoticeTimer);slowNoticeTimer=null;
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||!payload?.ok||!payload.audioDataUrl){
        const err=new Error(payload?.userError?.message||payload?.error||"本地自然语音暂时不可用");
        err.payload=payload;
        throw err;
      }
      try{activeAudio?.pause();}catch{}
      activeAudio=new Audio(payload.audioDataUrl);
      activeAudio.addEventListener("ended",()=>setBusy(button,false),{once:true});
      activeAudio.addEventListener("error",()=>setBusy(button,false),{once:true});
      await activeAudio.play();
      return true;
    }catch(err){
      console.warn("Kokoro playback failed",err);
      document.dispatchEvent(new CustomEvent("lexiflow:tts-error",{detail:{message:err?.message||"本地自然语音暂时不可用"}}));
      return false;
    }finally{
      if(slowNoticeTimer)clearTimeout(slowNoticeTimer);
      if(!activeAudio||activeAudio.paused)setBusy(button,false);
    }
  }

  document.addEventListener("change",event=>{
    const select=event.target?.closest?.("#tts-voice");
    if(!select)return;
    const voice=clean(select.value)||DEFAULT_VOICE;
    localStorage.setItem("lexiflow-tts-voice",voice);
    document.documentElement.dataset.lexiflowTtsVoice=voice;
  },true);

  document.addEventListener("click",async event=>{
    const sentence=event.target?.closest?.("[data-hydrated-sentence], .sentence-speaker");
    if(sentence){
      const text=clean(sentence.dataset.hydratedSentence || sentence.closest(".sentence-audio-line")?.querySelector(".sentence-audio-text")?.textContent);
      if(!text)return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      await play(text,sentence);
      return;
    }

    const speaker=event.target?.closest?.('[data-action="speak"]');
    if(!speaker)return;
    const audio=clean(speaker.dataset.audio);
    let audios=[];try{audios=JSON.parse(speaker.dataset.audios||"[]").filter(Boolean);}catch{}
    if(audio||audios.length)return; // Real dictionary/Wikimedia audio always wins.
    const word=clean(speaker.dataset.word || speaker.closest(".word-line")?.querySelector("h2")?.textContent || speaker.closest(".learning-card-wordtop")?.querySelector("h2")?.textContent || speaker.closest(".library-editor-word-line")?.querySelector(".library-editor-word")?.textContent);
    if(!word)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    await play(word,speaker);
  },true);

  document.addEventListener("lexiflow:tts-error",event=>{
    const message=clean(event.detail?.message);
    if(message)showToast(message,3200);
  });
})();
