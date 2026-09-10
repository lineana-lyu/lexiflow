from pathlib import Path

root = Path(".")
app_path = root / "public" / "app.js"
server_path = root / "server.js"
css_path = root / "public" / "styles.css"

app = app_path.read_text(encoding="utf-8")
server = server_path.read_text(encoding="utf-8")
css = css_path.read_text(encoding="utf-8")

def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing anchor: {label}")
    return text.replace(old, new, 1)

# Add sentence speech/highlight helpers next to the existing word-pronunciation helper.
anchor = '''  function speak(word,audioUrl=""){
    if(audioUrl){
      const audio=new Audio(audioUrl);
      audio.play().catch(()=>speak(word,""));
      return;
    }
    if(!("speechSynthesis" in window)){ toast("当前设备无法播放发音"); return; }
    const u=new SpeechSynthesisUtterance(word); u.lang="en-US";u.rate=.88;
    const vs=speechSynthesis.getVoices();
    u.voice=vs.find(v=>v.lang.toLowerCase()==="en-us")||vs.find(v=>v.lang.toLowerCase().startsWith("en"))||null;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }
'''
addition = anchor + '''
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

  function highlightKeyword(text,keyword){
    const source=String(text||"");
    const key=String(keyword||"").trim();
    if(!key)return escapeHtml(source);
    const escaped=key.replace(/[.*+?^${}()|[\\]\\\\]/g,"\\\\$&");
    const re=new RegExp(`\\\\b(${escaped})\\\\b`,"ig");
    let cursor=0;
    let out="";
    let match;
    while((match=re.exec(source))){
      out+=escapeHtml(source.slice(cursor,match.index));
      out+=`<mark class="keyword-mark">${escapeHtml(match[0])}</mark>`;
      cursor=match.index+match[0].length;
      if(re.lastIndex===match.index)re.lastIndex++;
    }
    out+=escapeHtml(source.slice(cursor));
    return out;
  }

  function sentenceExample(text,className="example-en",keyword=""){
    const value=String(text||"").trim();
    if(!value)return "";
    const body=keyword?highlightKeyword(value,keyword):escapeHtml(value);
    return `<div class="sentence-audio-line ${className}">
      <span class="sentence-audio-text">${body}</span>
      <button class="sentence-speaker" data-action="speak-sentence" data-sentence="${escapeHtml(value)}" title="播放例句" aria-label="播放例句">🔊</button>
    </div>`;
  }

  function containsChinese(text){
    return /[\\u3400-\\u9fff]/.test(String(text||""));
  }
'''
app = replace_once(app, anchor, addition, "speech helpers")

# Lookup primary example gets sentence audio.
app = replace_once(
    app,
    '''          <div class="example-en">${escapeHtml(primarySense.exampleEn||"暂无例句，请手动编辑")}</div>''',
    '''          ${primarySense.exampleEn?sentenceExample(primarySense.exampleEn,"example-en"):`<div class="example-en">暂无例句，请手动编辑</div>`}''',
    "primary lookup example"
)

# Expanded senses become a selectable div so their example can contain an audio button safely.
old_expanded = '''      <div class="sense-list">${senses.map(s=>`<button class="sense ${s.id===state.selectedSenseId?"selected":""}" data-sense-id="${s.id}">
        <div class="sense-head"><span class="pill blue">${escapeHtml(s.pos)}</span>${s.id===state.selectedSenseId?`<span class="sense-selected-mark">✓</span>`:""}</div>
        <div class="sense-meaning">${escapeHtml(s.meaningZh||"请手动编辑")}</div>
        <div class="sense-example">${escapeHtml(s.exampleEn||"暂无例句")}</div>
        <div class="sense-example-zh">${escapeHtml(s.exampleZh||"")}</div>
      </button>`).join("")}</div>'''
new_expanded = '''      <div class="sense-list">${senses.map(s=>`<div class="sense ${s.id===state.selectedSenseId?"selected":""}" data-sense-id="${s.id}" role="button" tabindex="0">
        <div class="sense-head"><span class="pill blue">${escapeHtml(s.pos)}</span>${s.id===state.selectedSenseId?`<span class="sense-selected-mark">✓</span>`:""}</div>
        <div class="sense-meaning">${escapeHtml(s.meaningZh||"请手动编辑")}</div>
        ${s.exampleEn?sentenceExample(s.exampleEn,"sense-example"):`<div class="sense-example">暂无例句</div>`}
        <div class="sense-example-zh">${escapeHtml(s.exampleZh||"")}</div>
      </div>`).join("")}</div>'''
app = replace_once(app, old_expanded, new_expanded, "expanded sense example audio")

# Avoid selecting the sense when the nested sentence-audio control is clicked.
old_sense_bind = '''    document.querySelectorAll("[data-sense-id]").forEach(el=>el.addEventListener("click",()=>{
      state.selectedSenseId=el.dataset.senseId;state.addDraft=null;render();
    }));'''
new_sense_bind = '''    document.querySelectorAll("[data-sense-id]").forEach(el=>{
      el.addEventListener("click",e=>{
        if(e.target.closest("[data-action]"))return;
        state.selectedSenseId=el.dataset.senseId;state.addDraft=null;render();
      });
      el.addEventListener("keydown",e=>{
        if(e.key==="Enter"||e.key===" "){e.preventDefault();el.click();}
      });
    });'''
app = replace_once(app, old_sense_bind, new_sense_bind, "sense bind")

# Add sentence audio across learning/review example displays.
app = replace_once(
    app,
    '''        <div class="answer-box"><strong>${escapeHtml(card.meaningZh)}</strong><p>${escapeHtml(card.exampleEn)}</p><p>${escapeHtml(card.exampleZh)}</p></div>''',
    '''        <div class="answer-box"><strong>${escapeHtml(card.meaningZh)}</strong>${sentenceExample(card.exampleEn,"answer-example-en")}<p>${escapeHtml(card.exampleZh)}</p></div>''',
    "stage select example"
)

for i in range(3):
    app = replace_once(
        app,
        '''              <div class="memory-example-en">${escapeHtml(card.exampleEn)}</div>''',
        '''              ${sentenceExample(card.exampleEn,"memory-example-en")}''',
        f"memory example {i+1}"
    )

app = replace_once(
    app,
    '''        ${state.study?.revealed?`<div class="answer-box"><strong>${escapeHtml(card.meaningZh)}</strong><p>${escapeHtml(card.exampleEn)}</p><p>${escapeHtml(card.exampleZh)}</p></div>''',
    '''        ${state.study?.revealed?`<div class="answer-box"><strong>${escapeHtml(card.meaningZh)}</strong>${sentenceExample(card.exampleEn,"answer-example-en")}<p>${escapeHtml(card.exampleZh)}</p></div>''',
    "scheduled review example"
)

# Replace the whole apply stage with bilingual input and two upfront actions.
apply_start = app.index('  function stageApply(card){')
apply_end = app.index('\n  function advanceStage(card,next,meta={})', apply_start)
new_apply = r'''  function stageApply(card){
    const fb=state.study.feedback;
    const suggested=String(fb?.suggestedSentence||"").trim();
    const keyword=String(fb?.keyword||card.word||"").trim();
    const applied=Boolean(state.study.aiSuggestionApplied);
    const canRestore=Boolean(state.study.originalApplyText && state.study.originalApplyText!==state.study.applyText);

    return `${stageKicker("造句应用")}
      <div class="study-center" style="align-items:stretch;text-align:left">
        <div class="apply-target-word">
          ${wordIdentity(card,{size:"medium",showPos:true,center:true})}
        </div>
        <div class="field">
          <label>写一个与你自己相关的句子（中英文都可以）</label>
          <textarea class="textarea" id="apply-text" placeholder="例如：I have a keyboard / 我每天用键盘写代码">${escapeHtml(state.study.applyText||"")}</textarea>
        </div>

        ${applied?`
          <div class="apply-status success">✓ 已应用 AI 建议</div>
          <div class="apply-after-ai-actions">
            ${canRestore?`<button class="btn" data-action="restore-original-apply">恢复原句</button>`:""}
            <button class="btn" data-action="revise-apply">继续修改</button>
            <button class="btn primary" data-action="pass-apply">确认通过</button>
          </div>
        `:`
          <div class="apply-primary-actions">
            ${canRestore?`<button class="btn" data-action="restore-original-apply">恢复原句</button>`:""}
            <button class="btn" data-action="submit-apply" ${state.study.applySubmitting?"disabled":""}>${state.study.applySubmitting?"AI 正在处理…":"获取 AI 建议"}</button>
            <button class="btn primary" data-action="pass-apply">确认通过</button>
          </div>
        `}

        ${fb && !applied?`<div class="feedback ${fb.level}">
          <h4>${escapeHtml(fb.title)}</h4>
          ${(fb.tips||[]).length?`<ul>${(fb.tips||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>`:""}
          ${suggested?`
            <div class="ai-suggestion-box">
              <div class="ai-suggestion-label"><span>AI 建议句</span><span class="ai-keyword-chip">关键词 · ${escapeHtml(keyword||card.word)}</span></div>
              <div class="ai-suggestion-text">${highlightKeyword(suggested,keyword||card.word)}</div>
              <button class="btn primary full" data-action="apply-ai-suggestion">应用这个句子</button>
            </div>
          `:""}
        </div>`:""}
      </div>`;
  }
'''
app = app[:apply_start] + new_apply + app[apply_end:]

# Add sentence speech action beside existing single-word speech action.
app = replace_once(
    app,
    '''    if(action==="speak"){speak(el.dataset.word,el.dataset.audio||"");return;}''',
    '''    if(action==="speak"){speak(el.dataset.word,el.dataset.audio||"");return;}
    if(action==="speak-sentence"){speakSentence(el.dataset.sentence||"");return;}''',
    "sentence speech action"
)

# Preserve AI keyword metadata from server response.
app = replace_once(
    app,
    '''          suggestedSentence:String(fb.suggestion||"").trim()
        };''',
    '''          suggestedSentence:String(fb.suggestion||"").trim(),
          keyword:String(fb.keyword||c.word||"").trim()
        };''',
    "feedback keyword"
)

# Direct confirmation is allowed for simple English; Chinese input must be translated first.
old_pass = '''    if(action==="pass-apply"){
      const c=getCard(state.study.cardId);
      const latest=document.getElementById("apply-text")?.value ?? state.study.applyText ?? "";
      const text=String(latest).trim();

      if(!text){
        toast("请先写一个句子");
        return;
      }

      state.study.applyText=text;
      c.userSentence=text;
      c.updatedAt=new Date().toISOString();
      saveData();

      enterInitialReview(c);
      return;
    }'''
new_pass = '''    if(action==="pass-apply"){
      const c=getCard(state.study.cardId);
      const latest=document.getElementById("apply-text")?.value ?? state.study.applyText ?? "";
      const text=String(latest).trim();

      if(!text){
        toast("请先写一个句子");
        return;
      }
      if(containsChinese(text)){
        state.study.applyText=text;
        showNotice("先把中文转成英文","点击“获取 AI 建议”，AI 会按当前词义改成自然英文并使用目标词。","warn");
        return;
      }

      state.study.applyText=text;
      c.userSentence=text;
      c.updatedAt=new Date().toISOString();
      saveData();

      enterInitialReview(c);
      return;
    }'''
app = replace_once(app, old_pass, new_pass, "direct apply confirmation")

# Replace server sentence feedback with bilingual-aware translation/editing.
server_start = server.index('async function sentenceFeedback(body) {')
server_end = server.index('\nfunction safeFileStem(input) {', server_start)
new_feedback = r'''async function sentenceFeedback(body) {
  const word = String(body.word || "").trim();
  const meaningZh = String(body.meaningZh || "").trim();
  const sentence = String(body.sentence || "").trim();
  if (!word || !sentence) throw new Error("INVALID_INPUT");

  const prompt = `你是面向中国英语学习者的“造句转换与反馈助手”。

目标词：${word}
本次中文词义：${meaningZh}
用户输入：${sentence}

用户输入可能是中文，也可能是英文。请先判断语言，再按下面规则处理。

如果输入是中文：
- 把用户真正想表达的意思转换成自然、简单的英文。
- 最终英文 suggestion 必须使用目标词，并且必须表达“本次中文词义”。
- 语法需要时可以使用目标词的常见词形变化。
- keyword 返回 suggestion 中实际出现的目标词或词形，供界面高亮。
- 不要额外扩写用户没有表达的新信息。
- level 返回 good，title 简短写“已转换为英文”。
- tips 只在存在歧义或值得提醒的问题时返回，通常可以为空。

如果输入是英文：
- 判断目标词是否正确表达了“本次中文词义”、语法是否基本正确、搭配是否自然。
- 已经正确自然时 suggestion 返回空字符串，不要为了显得有建议而改写。
- 有必要修改时，只做最小修改；suggestion 中保留并正确使用目标词。
- keyword 返回最终句子中实际使用的目标词或词形；如果原句没使用目标词，keyword 返回目标词。
- 不要用苛刻的母语者标准。

只输出 JSON：
{"inputLanguage":"zh|en","level":"good|warn","title":"一句简短中文结论","tips":["最多2条中文建议"],"suggestion":"中文输入时必须返回英文句子；英文需要修改时返回修改句，否则空字符串","keyword":"最终英文中实际出现的目标词或词形"}

不要输出 JSON 之外的内容。`;

  const result = await runCodex(prompt, {
    timeoutMs: 30000,
    workspaceWrite: false,
    reasoningEffortOverride: "low",
  });
  const parsed = extractJson(result.stdout);
  return {
    inputLanguage: parsed.inputLanguage === "zh" ? "zh" : "en",
    level: parsed.level === "good" ? "good" : "warn",
    title: String(parsed.title || "AI 已完成反馈"),
    tips: Array.isArray(parsed.tips) ? parsed.tips.slice(0, 2).map(String) : [],
    suggestion: String(parsed.suggestion || "").trim(),
    keyword: String(parsed.keyword || word).trim() || word,
    provider: "codex-local",
  };
}
'''
server = server[:server_start] + new_feedback + server[server_end:]

# Compact visual styles for sentence speakers, keyword highlighting, and upfront apply actions.
css += r'''

/* v0.5.1 bilingual sentence practice + sentence audio */
.sentence-audio-line{
  display:flex;
  align-items:center;
  gap:8px;
  width:100%;
}
.sentence-audio-text{
  min-width:0;
  flex:1;
}
.sentence-speaker{
  width:28px;
  height:28px;
  flex:0 0 28px;
  padding:0;
  border:1px solid #dbe4ef;
  border-radius:50%;
  background:#fff;
  color:#53647a;
  display:inline-grid;
  place-items:center;
  font-size:13px;
  line-height:1;
}
.sentence-speaker:hover{
  border-color:#b9cdf5;
  background:var(--blue-soft);
  color:var(--blue);
}
.answer-example-en{
  margin-top:8px;
  color:#50617a;
  line-height:1.7;
}
.memory-example-en.sentence-audio-line,
.sense-example.sentence-audio-line,
.example-en.sentence-audio-line{
  margin-top:6px;
}
.keyword-mark{
  padding:1px 5px;
  border-radius:6px;
  background:#e8f0ff;
  color:#245fcf;
  font-weight:900;
}
.apply-primary-actions{
  display:flex;
  justify-content:flex-end;
  gap:10px;
  flex-wrap:wrap;
  margin-top:12px;
}
.ai-suggestion-label{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
}
.ai-keyword-chip{
  padding:3px 7px;
  border-radius:999px;
  background:#eef4ff;
  color:#3f73e5;
  font-size:10px;
  font-weight:900;
  letter-spacing:0;
}
.sense[role="button"]{cursor:pointer}
.sense[role="button"]:focus-visible{
  outline:3px solid rgba(63,115,229,.16);
  outline-offset:2px;
}
'''

app_path.write_text(app, encoding="utf-8")
server_path.write_text(server, encoding="utf-8")
css_path.write_text(css, encoding="utf-8")
print("patched app.js, server.js, styles.css")
