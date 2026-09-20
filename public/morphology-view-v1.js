"use strict";

(() => {
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));

  const safeUrl = value => {
    const raw = String(value || "").trim();
    return /^https:\/\//i.test(raw) ? raw : "";
  };

  const typeLabel = type => ({
    root:"词根",
    prefix:"前缀",
    suffix:"后缀",
    combining_form:"构词成分",
    "root-association":"词根关联"
  }[String(type || "")] || "构词成分");

  function injectStyle(){
    if(document.getElementById("lexi-morphology-style")) return;
    const style=document.createElement("style");
    style.id="lexi-morphology-style";
    style.textContent=
      ".lexi-morphology{width:100%;text-align:left;border:1px solid var(--line);border-radius:16px;padding:14px 15px;background:color-mix(in srgb,var(--surface) 92%,transparent);display:flex;flex-direction:column;gap:12px}" +
      ".lexi-morphology-head{display:flex;align-items:center;justify-content:space-between;gap:12px}" +
      ".lexi-morphology-head strong{font-size:14px}" +
      ".lexi-morphology-verified{font-size:11px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:3px 8px;white-space:nowrap}" +
      ".lexi-morphology-parts{display:flex;flex-wrap:wrap;align-items:stretch;gap:8px}" +
      ".lexi-morphology-part{min-width:94px;flex:1 1 120px;border:1px solid var(--line);border-radius:12px;padding:9px 10px;background:var(--surface)}" +
      ".lexi-morphology-part b{display:block;font-size:15px;margin-bottom:3px}" +
      ".lexi-morphology-part small{display:block;color:var(--muted);font-size:11px;margin-bottom:3px}" +
      ".lexi-morphology-part span{font-size:13px}" +
      ".lexi-morphology-bridge{padding:10px 12px;border-radius:12px;background:rgba(127,127,127,.07);line-height:1.65}" +
      ".lexi-morphology-bridge strong{display:block;font-size:15px;margin-bottom:2px}" +
      ".lexi-morphology-bridge span{font-size:13px;color:var(--muted)}" +
      ".lexi-root-story{padding-top:10px;border-top:1px solid var(--line)}" +
      ".lexi-root-story-title{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;margin-bottom:6px}" +
      ".lexi-root-story-title b{font-size:15px}" +
      ".lexi-root-story-title span{font-size:12px;color:var(--muted)}" +
      ".lexi-root-story p{margin:0;font-size:13px;line-height:1.7}" +
      ".lexi-morphology-related{font-size:12px;color:var(--muted);line-height:1.7}" +
      ".lexi-morphology-sources summary{cursor:pointer;color:var(--muted);font-size:11px;user-select:none}" +
      ".lexi-morphology-source-list{display:flex;flex-direction:column;gap:5px;padding-top:7px}" +
      ".lexi-morphology-source-list a,.lexi-morphology-source-list span{font-size:11px;color:var(--muted);text-decoration:none;overflow-wrap:anywhere}" +
      ".lexi-morphology-source-list a:hover{text-decoration:underline}";
    document.head.appendChild(style);
  }

  function markup(morphology, options){
    options=options||{};
    const showStory=options.showStory!==false;
    if(!morphology || morphology.confidence==="uncertain") return "";

    const parts=Array.isArray(morphology.parts)?morphology.parts:[];
    const roots=showStory && Array.isArray(morphology.rootStories)?morphology.rootStories:[];
    const related=Array.isArray(morphology.relatedWords)?morphology.relatedWords.filter(Boolean):[];
    const sourceMap=new Map();

    for(const source of Array.isArray(morphology.sources)?morphology.sources:[]){
      if(source && source.id) sourceMap.set(source.id,source);
    }
    for(const root of roots){
      for(const source of Array.isArray(root.sources)?root.sources:[]){
        if(source && source.id) sourceMap.set(source.id,source);
      }
    }
    const sources=Array.from(sourceMap.values());

    let partsMarkup="";
    if(parts.length){
      partsMarkup='<div class="lexi-morphology-parts">' + parts.map(part =>
        '<div class="lexi-morphology-part">' +
          '<small>' + esc(typeLabel(part.role)) + '</small>' +
          '<b>' + esc(part.text) + '</b>' +
          '<span>' + esc(part.meaningZh||part.meaningEn||"") + '</span>' +
        '</div>'
      ).join("") + '</div>';
    }

    let bridge="";
    if(morphology.literalZh||morphology.meaningBridgeZh){
      bridge='<div class="lexi-morphology-bridge">' +
        (morphology.literalZh?'<strong>'+esc(morphology.literalZh)+'</strong>':"") +
        (morphology.meaningBridgeZh?'<span>'+esc(morphology.meaningBridgeZh)+'</span>':"") +
      '</div>';
    }

    const stories=roots.map(root =>
      '<div class="lexi-root-story">' +
        '<div class="lexi-root-story-title">' +
          '<b>' + esc(root.display||root.id) + '</b>' +
          '<span>' + esc(root.language||"") + ' · ' + esc(root.meaningEn||"") + ' · ' + esc(root.meaningZh||"") + '</span>' +
        '</div>' +
        '<p>' + esc(root.narrativeZh||"") + '</p>' +
      '</div>'
    ).join("");

    const relatedMarkup=related.length
      ? '<div class="lexi-morphology-related"><strong>同根联想：</strong>' + related.map(esc).join(" · ") + '</div>'
      : "";

    let sourceMarkup="";
    if(sources.length){
      sourceMarkup='<details class="lexi-morphology-sources"><summary>查看来源依据</summary><div class="lexi-morphology-source-list">' +
        sources.map(source=>{
          const href=safeUrl(source.url);
          const label=[source.name,source.headword?'“'+source.headword+'”':"",source.kind==="classical_dictionary"?"古典词典":"英语词源"].filter(Boolean).join(" · ");
          return href
            ? '<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>'
            : '<span>'+esc(label)+'</span>';
        }).join("") +
      '</div></details>';
    }

    return '<section class="lexi-morphology" data-morphology-confidence="'+esc(morphology.confidence||"")+'">' +
      '<div class="lexi-morphology-head"><strong>构词理解</strong><span class="lexi-morphology-verified">' +
        (morphology.confidence==="verified"?"来源已核验":"词根关联") +
      '</span></div>' +
      partsMarkup + bridge + stories + relatedMarkup + sourceMarkup +
    '</section>';
  }

  injectStyle();
  window.LexiFlowMorphologyViewV1=Object.freeze({markup});
})();
