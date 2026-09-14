"use strict";

const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");

function read(fileName){ return fs.readFileSync(path.join(root,fileName),"utf8"); }
function write(fileName,source){ fs.writeFileSync(path.join(root,fileName),source,"utf8"); }
function replaceOnce(fileName,before,after,label){
  let source=read(fileName);
  if(!source.includes(before))throw new Error(`${label}: source snippet not found`);
  source=source.replace(before,after);
  write(fileName,source);
}
function replaceRange(fileName,startMarker,endMarker,replacement,label){
  let source=read(fileName);
  const start=source.indexOf(startMarker);
  if(start<0)throw new Error(`${label}: start marker not found`);
  const end=source.indexOf(endMarker,start);
  if(end<0)throw new Error(`${label}: end marker not found`);
  source=source.slice(0,start)+replacement+source.slice(end);
  write(fileName,source);
}

replaceRange(
  "server-runtime.js",
  '    if (queryKind === "word" && /^[A-Za-z][A-Za-z\\s\'-]*$/.test(query)) {',
  '    if (!result) return false;',
  [
    '    if (queryKind === "word" && /^[A-Za-z][A-Za-z\\s\'-]*$/.test(query)) {',
    '      result = localLookupResult(query.toLowerCase(), "primary", query);',
    '    }',
    ''
  ].join("\n"),
  "remove local phrase semantic short-circuit"
);

replaceRange(
  "server-runtime.js",
  '    const queryKind = expressionQuery.classifyEnglishQuery(word);\n    const result = queryKind === "phrase"',
  '  if (pathname === "/api/dictionary/pronunciation") {',
  [
    '    const queryKind = expressionQuery.classifyEnglishQuery(word);',
    '    if (queryKind === "phrase") {',
    '      try {',
    '        const result = await expressionQuery.resolveEnglishExpression(word);',
    '        if (!result) return false;',
    '        writeJson(res, 200, { ok: true, result: { ...result, localLookup: false, expressionLookup: true, examplesPending: result.senses?.some(s => !s.exampleEn || !s.exampleZh) } });',
    '        console.log("LexiFlow expression dictionary lookup: " + word);',
    '      } catch (err) {',
    '        writeJson(res, 503, {',
    '          ok: false,',
    '          code: err?.code || "EXPRESSION_QUERY_UNAVAILABLE",',
    '          error: "完整短语暂时没有解析完成",',
    '          userError: {',
    '            code: err?.code || "EXPRESSION_QUERY_UNAVAILABLE",',
    '            title: "短语解析暂时不可用",',
    '            message: "LexiFlow 不会退回逐词字面义。请确认 AI 连接后重试。",',
    '          },',
    '        });',
    '      }',
    '      return true;',
    '    }',
    '    const result = localLookupResult(word, mode, word);',
    '    if (!result) return false;',
    '    writeJson(res, 200, { ok: true, result: { ...result, localLookup: true, examplesPending: result.senses?.some(s => !s.exampleEn || !s.exampleZh) } });',
    '    console.log("LexiFlow lookup [" + (result.lookupPath || result.dictionarySource || "local") + "] " + (result.lookupMs ?? "?") + "ms: " + word);',
    '    return true;',
    '  }',
    '',
    ''
  ].join("\n"),
  "route direct phrase dictionary lookup through expression semantics"
);

replaceRange(
  "server-runtime.js",
  '  const queryKind = expressionQuery.classifyEnglishQuery(word);\n  const local = queryKind === "phrase"',
  '  if (local?.audioUrl) {',
  [
    '  const queryKind = expressionQuery.classifyEnglishQuery(word);',
    '  // Multi-word expressions must never inherit a single component\'s local ECDICT phonetic/audio.',
    '  // Whole-phrase exact dictionary audio is resolved remotely; otherwise synthesize the complete expression.',
    '  const local = queryKind === "phrase" ? null : localLookupResult(word, "primary", word);',
    ''
  ].join("\n"),
  "remove component local pronunciation authority for phrases"
);

replaceRange(
  "server-runtime.js",
  '    const pronunciation = remote.payload?.result;',
  '  } catch {}',
  [
    '    const pronunciation = remote.payload?.result;',
    '    const rawAudioUrl = clean(pronunciation?.audioUrl);',
    '    const rawAudioUrls = Array.isArray(pronunciation?.audioUrls) ? pronunciation.audioUrls.map(clean).filter(Boolean) : [];',
    '    const hasAudio = Boolean(rawAudioUrl || rawAudioUrls.length);',
    '    const componentOnly = queryKind === "phrase" && pronunciation?.exactMatch !== true;',
    '    const safeAudioUrl = componentOnly ? "" : rawAudioUrl;',
    '    const safeAudioUrls = componentOnly ? [] : (rawAudioUrls.length ? rawAudioUrls : (safeAudioUrl ? [safeAudioUrl] : []));',
    '    const dictionaryAudio = Boolean(!componentOnly && (safeAudioUrl || safeAudioUrls.length));',
    '    if (remote.status >= 200 && remote.status < 300 && pronunciation && (hasAudio || clean(pronunciation.phonetic))) {',
    '      writeJson(res, 200, {',
    '        ok: true,',
    '        result: {',
    '          ...pronunciation,',
    '          phonetic: clean(pronunciation.phonetic) || local?.phonetic || "",',
    '          audioUrl: safeAudioUrl,',
    '          audioUrls: safeAudioUrls,',
    '          pronunciationSource: componentOnly && clean(pronunciation.phonetic)',
    '            ? "merriam-webster-components-phonetic"',
    '            : clean(pronunciation.pronunciationSource),',
    '          dictionaryAudio,',
    '          wholeExpressionAudio: queryKind !== "phrase" || pronunciation?.exactMatch === true,',
    '          localLookup: false,',
    '        },',
    '      });',
    '      return true;',
    '    }',
    ''
  ].join("\n"),
  "strip component recordings from phrase playback"
);

replaceOnce(
  "lib/expression-query.js",
  "3. meaningZh 给出最常用、最自然的简短中文释义。\\n4. intentEn 用简短英文解释这个表达的准确意思。",
  "3. meaningZh 给出最常用、最自然的简短中文释义。若输入是短语动词、习语或固定搭配，必须优先给惯用义，禁止把组成单词逐字拼成表面意思；例如 hang out 的常用义是“闲逛、一起待着”，不是“挂出”。\\n4. intentEn 用简短英文解释这个表达的准确意思。",
  "strengthen idiomatic phrase meaning prompt"
);

replaceOnce(
  "public/product-ux.css",
  "  width:38px!important;\n  height:38px!important;\n  padding:0!important;",
  "  width:38px!important;\n  height:38px!important;\n  min-width:38px!important;\n  min-height:38px!important;\n  flex:0 0 38px!important;\n  aspect-ratio:1/1!important;\n  box-sizing:border-box!important;\n  line-height:1!important;\n  padding:0!important;",
  "lock speaker geometry"
);
replaceOnce(
  "public/product-ux.css",
  ".lexi-speaker-svg{width:20px;height:20px;display:block;overflow:visible}",
  ".lexi-speaker-svg{width:20px;height:20px;min-width:20px;min-height:20px;flex:0 0 20px;display:block;overflow:visible}",
  "lock speaker svg geometry"
);
replaceOnce(
  "public/product-ux.js",
  '      button.classList.add("speaker","lexi-speaker-button");',
  '      if(!button.classList.contains("sentence-speaker"))button.classList.add("speaker");\n      button.classList.add("lexi-speaker-button");',
  "avoid sentence speaker class collision"
);

const checkFile=path.join(root,"scripts","check-expression-query-v4.js");
let check=fs.readFileSync(checkFile,"utf8");
check=check.replace(
  `assert(runtime.includes('queryKind === "phrase"')&&runtime.includes('lookupPath: "core-phrase"'), "uncurated phrases must not be accepted from raw ECDICT before whole-expression resolution");`,
  `assert(!runtime.includes('result = coreLexicon.lookupExact(query.toLowerCase(), "primary"'), "multiword search must not short-circuit through local Core/ECDICT phrase semantics before expression resolution");`
);
check=check.replace(
  `assert(runtime.includes('queryKind === "phrase"\\n      ? coreLexicon.lookupExact'), "direct dictionary lookup must also avoid raw ECDICT as authoritative phrase semantics");`,
  `assert(runtime.includes('if (queryKind === "phrase")')&&runtime.includes('expressionQuery.resolveEnglishExpression(word)'), "direct dictionary phrase lookup must use whole-expression semantics rather than raw ECDICT");`
);
check=check.replace(
  `assert(runtime.includes('queryKind === "phrase"\\n    ? coreLexicon.lookupExact(word, "primary", { sourceQuery: word, autoResolved: false, lookupPath: "core-phrase-pronunciation" })'), "phrase pronunciation must not re-enter raw ECDICT component semantics");`,
  `assert(runtime.includes('const local = queryKind === "phrase" ? null : localLookupResult')&&runtime.includes('const componentOnly = queryKind === "phrase" && pronunciation?.exactMatch !== true')&&runtime.includes('wholeExpressionAudio'), "phrase pronunciation must reject component recordings and reserve audio ownership for exact whole-expression recordings");`
);
check=check.replace(
  `assert(productCss.includes("width:38px!important")&&productCss.includes("border:1px solid var(--line)!important")&&productCss.includes("border-radius:50%!important"), "all decorated speaker buttons must use the same canonical card-creation speaker surface");`,
  `assert(productCss.includes("width:38px!important")&&productCss.includes("flex:0 0 38px!important")&&productCss.includes("aspect-ratio:1/1!important")&&productCss.includes("border-radius:50%!important"), "all decorated speaker buttons must keep the same non-deforming canonical card-creation geometry");`
);
if(!check.includes("multiword search must not short-circuit")||!check.includes("reject component recordings"))throw new Error("expression regression checks were not updated");
fs.writeFileSync(checkFile,check,"utf8");

console.log("Phrase semantics, whole-expression pronunciation, and speaker geometry fixed.");
