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
  `    if(segments.length){\n      try{\n        for(const src of Array.from(new Set(segments))){\n          await new Promise((resolve,reject)=>{\n            const audio=new Audio(src);audio.onended=resolve;audio.onerror=reject;audio.play().catch(reject);\n          });\n        }\n        return;\n      }catch{}\n    }`,
  `    if(segments.length){\n      for(const src of Array.from(new Set(segments))){\n        try{\n          await new Promise((resolve,reject)=>{\n            const audio=new Audio(src);audio.onended=resolve;audio.onerror=reject;audio.play().catch(reject);\n          });\n          return;\n        }catch{}\n      }\n    }`,
  "dictionary audio fallback order"
);

patch(
  "public/kokoro-voice.js",
  `    const audio=clean(speaker.dataset.audio);\n    let audios=[];try{audios=JSON.parse(speaker.dataset.audios||"[]").filter(Boolean);}catch{}\n    const isExpression=/\\s/.test(word) || /[.!?,;:]/.test(word);\n    // A single exact dictionary recording still wins. Component recordings for a\n    // phrase are not a natural whole-expression pronunciation, so Kokoro owns it.\n    if(audio || (!isExpression && audios.length))return;\n    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();\n    await play(word,speaker);`,
  `    const audio=clean(speaker.dataset.audio);\n    let audios=[];try{audios=JSON.parse(speaker.dataset.audios||"[]").filter(Boolean);}catch{}\n    const pronunciation=window.LexiFlowPronunciationV3;\n    if(typeof pronunciation?.playWord==="function"){\n      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();\n      await pronunciation.playWord(word,{audioUrl:audio,audioUrls:audios});\n      return;\n    }\n    const isExpression=/\\s/.test(word) || /[.!?,;:]/.test(word);\n    // If the shared bridge is unavailable during startup, retain the old fallback:\n    // exact dictionary recordings remain owned by the base surface; expressions\n    // without an exact recording use whole-expression natural synthesis.\n    if(audio || (!isExpression && audios.length))return;\n    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();\n    await play(word,speaker);`,
  "global pronunciation click owner"
);

const testFile=path.join(root,"scripts","check-expression-query-v4.js");
let test=fs.readFileSync(testFile,"utf8");
const marker='assert(kokoro.includes("Component recordings for a"), "Kokoro voice layer must document whole-expression ownership over component recordings");';
const replacement='assert(kokoro.includes("LexiFlowPronunciationV3")&&kokoro.includes("audioUrl:audio,audioUrls:audios"), "all dynamic word speakers must delegate to the shared dictionary-first pronunciation bridge");\nassert(app.includes("for(const src of Array.from(new Set(segments)))")&&app.includes("audio.play().catch(reject);\\n          });\\n          return;"), "dictionary pronunciation must stop after the first successful exact recording instead of playing every variant");';
if(!test.includes(marker))throw new Error("pronunciation regression marker not found");
test=test.replace(marker,replacement);fs.writeFileSync(testFile,test,"utf8");
console.log("Global pronunciation ownership fixed.");
