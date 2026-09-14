"use strict";
const fs=require("fs");
const path=require("path");
const root=path.resolve(__dirname,"..");
function patch(name,before,after,label){
  const file=path.join(root,name);let source=fs.readFileSync(file,"utf8");
  if(!source.includes(before))throw new Error(`${label}: source snippet not found`);
  source=source.replace(before,after);fs.writeFileSync(file,source,"utf8");
}

patch(
  "public/app.js",
  `  async function speak(word,audioUrl="",audioUrls=[]){\n    const segments=Array.isArray(audioUrls)?audioUrls.filter(Boolean):[];\n    if(audioUrl) segments.unshift(audioUrl);\n    if(segments.length){\n      for(const src of Array.from(new Set(segments))){\n        try{\n          await new Promise((resolve,reject)=>{\n            const audio=new Audio(src);audio.onended=resolve;audio.onerror=reject;audio.play().catch(reject);\n          });\n          return;\n        }catch{}\n      }\n    }\n    if(await playNaturalTts(word))return;\n    toast("当前没有可用的自然发音，请稍后重试");\n  }`,
  `  async function playDictionaryAudio(segments=[]){\n    for(const src of Array.from(new Set((Array.isArray(segments)?segments:[]).filter(Boolean)))){\n      try{\n        await new Promise((resolve,reject)=>{\n          const audio=new Audio(src);audio.onended=resolve;audio.onerror=reject;audio.play().catch(reject);\n        });\n        return true;\n      }catch{}\n    }\n    return false;\n  }\n\n  async function speak(word,audioUrl="",audioUrls=[]){\n    const value=String(word||"").trim();\n    if(!value)return;\n    const supplied=Array.isArray(audioUrls)?audioUrls.filter(Boolean):[];\n    if(audioUrl)supplied.unshift(audioUrl);\n    if(await playDictionaryAudio(supplied))return;\n\n    try{\n      const payload=await api("/api/dictionary/pronunciation",{method:"POST",body:{word:value}});\n      const result=payload?.result||{};\n      const resolved=Array.isArray(result.audioUrls)?result.audioUrls.filter(Boolean):[];\n      if(result.audioUrl)resolved.unshift(result.audioUrl);\n      if(await playDictionaryAudio(resolved))return;\n    }catch{}\n\n    if(await playNaturalTts(value))return;\n    toast("当前没有可用的自然发音，请稍后重试");\n  }`,
  "dictionary-first shared pronunciation bridge"
);

patch(
  "server-runtime.js",
  `  const local = localLookupResult(word, "primary", word);`,
  `  const queryKind = expressionQuery.classifyEnglishQuery(word);\n  const local = queryKind === "phrase"\n    ? coreLexicon.lookupExact(word, "primary", { sourceQuery: word, autoResolved: false, lookupPath: "core-phrase-pronunciation" })\n    : localLookupResult(word, "primary", word);`,
  "phrase pronunciation local authority"
);

patch(
  "public/product-ux.css",
  `.lexi-speaker-button{\n  position:relative;\n  overflow:visible;\n  display:inline-grid!important;\n  place-items:center;\n  padding:0!important;\n  color:inherit;\n}`,
  `.lexi-speaker-button{\n  position:relative;\n  overflow:visible;\n  display:inline-grid!important;\n  place-items:center;\n  width:38px!important;\n  height:38px!important;\n  padding:0!important;\n  border:1px solid var(--line)!important;\n  border-radius:50%!important;\n  background:#fff!important;\n  color:#2f3e54!important;\n  cursor:pointer!important;\n}\n.lexi-speaker-button:hover{border-color:#bdd0f6!important;background:var(--blue-soft)!important;color:var(--blue)!important}`,
  "canonical speaker surface"
);

const testFile=path.join(root,"scripts","check-expression-query-v4.js");
let test=fs.readFileSync(testFile,"utf8");
const fixture='const productUx = fs.readFileSync(path.join(root, "public", "product-ux.js"), "utf8");';
if(!test.includes(fixture))throw new Error("expression test fixture marker not found");
test=test.replace(fixture,fixture+'\nconst productCss = fs.readFileSync(path.join(root, "public", "product-ux.css"), "utf8");');
const oldAudioAssertion='assert(app.includes("for(const src of Array.from(new Set(segments)))")&&app.includes("audio.play().catch(reject);\\n          });\\n          return;"), "dictionary pronunciation must stop after the first successful exact recording instead of playing every variant");';
const newAudioAssertion='assert(app.includes("async function playDictionaryAudio")&&app.includes("for(const src of Array.from(new Set((Array.isArray(segments)?segments:[]).filter(Boolean))))")&&app.includes("return true;"), "dictionary pronunciation must stop after the first successful exact recording instead of playing every variant");';
if(!test.includes(oldAudioAssertion))throw new Error("old dictionary audio assertion not found");
test=test.replace(oldAudioAssertion,newAudioAssertion);
const marker='assert(memorize.includes(\'saving=false;\\n      if(window.LexiFlowStudySessionV3?.advanceWithinBucket?.(card.id,"memorize"))return;\'), "Memorize must release its save lock before rotating to the next recall card");';
if(!test.includes(marker))throw new Error("expression test assertion marker not found");
test=test.replace(marker,marker+'\nassert(app.includes(\'api("/api/dictionary/pronunciation",{method:"POST",body:{word:value}})\')&&app.includes("playDictionaryAudio"), "shared word pronunciation must actively try dictionary audio before synthesized speech when a card has no cached recording");\nassert(runtime.includes(\'queryKind === "phrase"\\n    ? coreLexicon.lookupExact(word, "primary", { sourceQuery: word, autoResolved: false, lookupPath: "core-phrase-pronunciation" })\'), "phrase pronunciation must not re-enter raw ECDICT component semantics");\nassert(productCss.includes("width:38px!important")&&productCss.includes("border:1px solid var(--line)!important")&&productCss.includes("border-radius:50%!important"), "all decorated speaker buttons must use the same canonical card-creation speaker surface");');
fs.writeFileSync(testFile,test,"utf8");
console.log("Final pronunciation hardening applied.");
