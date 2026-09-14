"use strict";
const fs=require("fs");
const path=require("path");
function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const app=fs.readFileSync(path.join(root,"public","app.js"),"utf8");
const policy=fs.readFileSync(path.join(root,"public","review-policy-v3.js"),"utf8");
const review=fs.readFileSync(path.join(root,"public","review-session-v3.js"),"utf8");
const source=fs.readFileSync(path.join(root,"public","source-context-v3.js"),"utf8");
const theme=fs.readFileSync(path.join(root,"public","theme-v7.css"),"utf8");
const hydration=fs.readFileSync(path.join(root,"public","example-hydration.js"),"utf8");
const enrichment=fs.readFileSync(path.join(root,"lib","example-enrichment.js"),"utf8");
const electron=fs.readFileSync(path.join(root,"electron-main.js"),"utf8");
const runtime=fs.readFileSync(path.join(root,"server-runtime.js"),"utf8");
const kokoro=fs.readFileSync(path.join(root,"public","kokoro-voice.js"),"utf8");

assert(app.includes("verifyProviderConnectionsOnStartup"),"app must verify provider connections automatically");
assert(app.includes("setTimeout(()=>{void verifyProviderConnectionsOnStartup();},0)"),"automatic provider verification must start after initial render");
assert(app.includes("词汇进度")&&app.includes("最近 30 天学习节奏")&&app.includes("需要加强")&&app.includes("30 天回忆成功率"),"stats page must expose actionable progress metrics");
for(const banned of ["CLI 已检测","CLI 未检测","真实 AI 请求验证","Fast transport","运行连接已验证","Today Plan"]){
  assert(!app.includes(banned),`user-facing app copy must not expose internal label: ${banned}`);
}
assert(!policy.includes("复习与学习负荷")&&!policy.includes("settingsHtml"),"read-only review workload must not appear in Settings");
assert(!review.includes("Today Plan"),"review session must not expose planning internals");
assert(source.includes(".lexi-source-box .input,.lexi-source-box .textarea{font-size:12.5px}"),"source context typography must follow the V7 scale");
assert(theme.includes("V7 user surface consistency")&&theme.includes(".settings-list .input,.settings-list .select"),"Settings typography must have a consistent V7 surface contract");
assert(hydration.includes("function isDictionaryPayload")&&!hydration.includes("function isLocalDictionaryPayload"),"example translation hydration must cover remote/expression dictionary payloads too");
assert(enrichment.includes("runCodex(prompt, 28000)"),"example translation must allow a realistic AI response window");
assert(electron.includes('path.join(__dirname, "public", "icon.png")')&&electron.includes("nativeImage.createFromPath"),"desktop window must use the same source icon as the app UI");
assert(!electron.includes("APP_ICON_DATA_URL"),"stale embedded desktop icon must not return");
assert(app.includes("verifiedWholeExpressionAudio")&&app.includes("if(!isExpression){")&&app.includes("target.audioUrl=nextAudioUrl"),"phrase playback must revalidate exact whole-expression audio and clear stale saved audio");
assert(hydration.includes("pronunciation.wholeExpressionAudio === true")&&hydration.includes("result.audioUrl = first")&&hydration.includes("pronunciation?.wholeExpressionPhonetic!==true"),"lookup hydration must remove component audio and reject partial phrase IPA");
assert(kokoro.includes("if(!isExpression && (audio || audios.length))return;"),"startup fallback must synthesize expressions instead of trusting supplied component audio");
assert(runtime.includes('pronunciationPolicy:"whole-expression-v2"')&&runtime.includes("exactWholeAudio")&&runtime.includes("composePhrasePhonetic"),"runtime must expose one verified phrase recording or synthesize the complete expression");
console.log("User surface V4 checks passed.");
