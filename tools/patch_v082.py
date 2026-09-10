from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "public" / "app.js"
CSS = ROOT / "public" / "styles.css"
PKG = ROOT / "package.json"

app = APP.read_text(encoding="utf-8")

capture_re = re.compile(r"  function captureLibraryEditorDraft\(\)\{.*?\n  \}\n\n  function libraryEditPage\(\)\{", re.S)
capture_replacement = r'''  function captureLibraryEditorDraft(){
    const editor=state.libraryEditor;
    const card=editor&&getCard(editor.cardId);
    if(!editor||!card)return null;
    const current=editor.draft||libraryEditorBaseDraft(card);
    const read=(id,fallback)=>document.getElementById(id)?.value??fallback;
    editor.draft={
      ...current,
      // Lexical identity is intentionally read-only in the library editor.
      word:card.word||"",
      phonetic:card.phonetic||"",
      pos:card.pos||"",
      meaningZh:card.meaningZh||"",
      exampleEn:String(read("library-edit-example-en",current.exampleEn)||"").trim(),
      exampleZh:String(read("library-edit-example-zh",current.exampleZh)||"").trim(),
      visualNote:String(read("library-edit-visual-note",current.visualNote)||"").trim()
    };
    return editor.draft;
  }

  function libraryEditPage(){'''
app, count = capture_re.subn(capture_replacement, app, count=1)
if count != 1:
    raise SystemExit(f"capture/editor anchor replacement count={count}")

editor_re = re.compile(r"  function libraryEditPage\(\)\{.*?\n  \}\n\n  function statsPage\(\)\{", re.S)
editor_replacement = r'''  function libraryEditPage(){
    const editor=state.libraryEditor;
    const card=editor&&getCard(editor.cardId);
    if(!editor||!card)return libraryPage();
    const d=editor.draft||libraryEditorBaseDraft(card);
    const image=d.imageData||d.imageUrl||"";
    const generating=Boolean(editor.imageGenerating);
    const phonetic=formatPhonetic(d.phonetic||"")||"暂无音标";
    return shell(
      header("","编辑单词卡","只调整例句和视觉联想；词条信息保持原样，复习进度不会改变。",`<button class="btn" data-action="library-edit-back">← 返回单词库</button>`)
      + `<div class="library-editor-grid library-editor-grid-refined">
        <section class="card library-editor-identity" aria-label="固定词条信息">
          <div class="library-editor-word-block">
            <div class="library-editor-word-line">
              <strong class="library-editor-word">${escapeHtml(d.word)}</strong>
              <button class="speaker library-editor-speaker" data-action="speak" data-word="${escapeHtml(d.word)}" data-audio="${escapeHtml(card.audioUrl||"")}" aria-label="播放 ${escapeHtml(d.word)} 的发音">🔊</button>
              <span class="pill blue library-editor-pos">${escapeHtml(d.pos||"word")}</span>
            </div>
            <div class="library-editor-phonetic">${escapeHtml(phonetic)}</div>
          </div>
          <div class="library-editor-meaning-block">
            <span>中文释义</span>
            <strong>${escapeHtml(d.meaningZh)}</strong>
          </div>
        </section>

        <section class="card pad library-editor-copy-card">
          <div class="library-editor-section-head">
            <div><span class="library-editor-section-kicker">可编辑</span><h2>例句</h2><p>只在表达不自然或不够贴合词义时修改。</p></div>
          </div>
          <div class="field library-editor-editable-field">
            <label>英文例句</label>
            <textarea class="textarea library-editor-textarea" id="library-edit-example-en" placeholder="写一句自然、明确体现当前词义的英文例句">${escapeHtml(d.exampleEn)}</textarea>
          </div>
          <div class="field library-editor-editable-field">
            <label>中文例句</label>
            <textarea class="textarea library-editor-textarea" id="library-edit-example-zh" placeholder="填写对应的自然中文翻译">${escapeHtml(d.exampleZh)}</textarea>
          </div>
          <div class="library-editor-copy-note">例句会直接用于后续记忆与复习。</div>
        </section>

        <aside class="card pad library-editor-image-panel">
          <div class="library-editor-section-head">
            <div><span class="library-editor-section-kicker">视觉记忆</span><h2>联想图</h2><p>可以重新生成，也可以换成你自己的图片。</p></div>
          </div>
          <div class="library-editor-image-frame ${image?"has-image":""}">
            ${image?`<img class="library-editor-image" src="${image}" alt="${escapeHtml(d.word)} 联想图" />`:`<div class="library-editor-image-empty"><span>✦</span><strong>暂无联想图</strong><small>AI 可根据词义和例句自动设计</small></div>`}
            ${generating?`<div class="library-editor-image-loading"><span class="mini-spinner"></span><strong>正在生成新图片</strong><small>可以继续修改例句或场景，当前已保存内容不会被覆盖。</small></div>`:""}
          </div>
          <div class="library-editor-image-actions">
            <button class="btn primary" data-action="regenerate-library-image" ${generating?"disabled":""}>${generating?"生成中…":image?"✦ 重新生成":"✦ AI 生成图片"}</button>
            <label class="btn" for="library-image-file">上传图片</label>
            ${image?`<button class="btn ghost" data-action="clear-library-image" ${generating?"disabled":""}>移除</button>`:""}
          </div>
          <input id="library-image-file" type="file" accept="image/png,image/jpeg,image/webp" style="display:none" />

          <div class="field library-editor-scene-field">
            <label>联想场景 <span>可选</span></label>
            <textarea class="textarea library-editor-scene" id="library-edit-visual-note" placeholder="例如：傍晚的书房里，台灯照亮摊开的英语课本。留空也可以直接生成。">${escapeHtml(d.visualNote)}</textarea>
            <small>填写后优先按你的描述生成；留空时 AI 会自动设计画面。</small>
          </div>
          <div class="library-editor-tip">图片和场景只用于记忆辅助，不会改变学习阶段或复习时间。</div>
        </aside>

        <div class="library-editor-footer">
          <span>保存后只更新例句、联想场景和图片。</span>
          <div class="library-editor-footer-actions">
            <button class="btn" data-action="library-edit-back">取消</button>
            <button class="btn primary" data-action="save-library-card">保存修改</button>
          </div>
        </div>
      </div>`
    );
  }

  function statsPage(){'''
app, count = editor_re.subn(editor_replacement, app, count=1)
if count != 1:
    raise SystemExit(f"libraryEditPage replacement count={count}")

save_re = re.compile(r'''    if\(action==="save-library-card"\)\{.*?\n    \}\n    if\(action==="regenerate-library-image"\)\{''', re.S)
save_replacement = r'''    if(action==="save-library-card"){
      const editor=state.libraryEditor;
      const card=editor&&getCard(editor.cardId);
      const draft=card&&captureLibraryEditorDraft();
      if(!editor||!card||!draft)return;
      if(!draft.exampleEn||!draft.exampleZh){
        showNotice("例句还没有填写完整","请保留一组对应的中英文例句。","warn");
        return;
      }
      // Fixed lexical identity: word / phonetic / POS / Chinese meaning are never changed here.
      card.exampleEn=draft.exampleEn;
      card.exampleZh=draft.exampleZh;
      card.visualNote=draft.visualNote;
      card.imageData=draft.imageData||"";
      card.imageUrl=draft.imageUrl||"";
      card.generatedVisualScene=draft.generatedVisualScene||"";
      card.imageGeneration=draft.imageGeneration||null;
      card.updatedAt=new Date().toISOString();
      saveData();
      state.libraryEditor=null;
      state.route="library";
      toast("单词卡已更新");
      return;
    }
    if(action==="regenerate-library-image"){'''
app, count = save_re.subn(save_replacement, app, count=1)
if count != 1:
    raise SystemExit(f"save handler replacement count={count}")

app = app.replace("    },720);\n  }\n\n  function render(){", "    },360);\n  }\n\n  function render(){", 1)
APP.write_text(app, encoding="utf-8")

css = CSS.read_text(encoding="utf-8")
marker = "/* v0.8.2 — Emil-inspired hierarchy and editor refinement */"
if marker in css:
    raise SystemExit("v0.8.2 CSS marker already exists")

css += r'''

/* v0.8.2 — Emil-inspired hierarchy and editor refinement */
:root{
  --ease-out:cubic-bezier(.23,1,.32,1);
  --ease-in-out:cubic-bezier(.77,0,.175,1);
  --shadow:0 1px 2px rgba(20,34,55,.025),0 12px 32px rgba(20,34,55,.045);
  --radius:16px;
  --radius-sm:10px;
}
.content{max-width:1220px}
.card{border-color:#e4e9f0}
.page-head{margin-bottom:22px}.page-head h1{font-size:32px;letter-spacing:-.038em}.page-head p{max-width:720px;color:#7a8799}
.btn,.speaker{transition:transform 140ms var(--ease-out),background-color 160ms ease,border-color 160ms ease,color 160ms ease,box-shadow 160ms ease}
.btn:active:not(:disabled),.speaker:active:not(:disabled){transform:scale(.98)}
.nav-btn{transition:background-color 160ms ease,color 160ms ease,transform 140ms var(--ease-out)}
.nav-btn:active{transform:scale(.985)}
.input,.textarea,.select{transition:border-color 160ms ease,box-shadow 160ms ease,background-color 160ms ease}
.textarea:hover:not(:focus),.input:hover:not(:focus),.select:hover:not(:focus){border-color:#bfcddd}
.library-row{transition:background-color 150ms ease,box-shadow 150ms ease}

.library-editor-grid-refined{grid-template-columns:minmax(0,1.04fr) minmax(360px,.96fr);gap:20px;align-items:start}
.library-editor-identity{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:28px;padding:21px 24px;background:linear-gradient(180deg,#fff 0%,#fbfcfe 100%);box-shadow:0 1px 2px rgba(20,34,55,.025)}
.library-editor-word-block{min-width:0}.library-editor-word-line{display:flex;align-items:center;gap:10px;min-width:0}
.library-editor-word{font-size:31px;line-height:1.08;letter-spacing:-.045em;color:#152038}
.library-editor-speaker{width:34px;height:34px;font-size:14px;flex:0 0 auto}.library-editor-pos{padding:5px 10px}
.library-editor-phonetic{margin-top:7px;color:#7b889b;font-size:13px;letter-spacing:.01em}
.library-editor-meaning-block{min-width:220px;padding-left:28px;border-left:1px solid #e8edf3;display:grid;gap:5px;justify-items:start}
.library-editor-meaning-block span{color:#98a3b2;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.library-editor-meaning-block strong{color:#243149;font-size:20px;font-weight:780;letter-spacing:-.02em}

.library-editor-copy-card,.library-editor-image-panel{box-shadow:var(--shadow)}
.library-editor-copy-card{min-height:100%}
.library-editor-section-head{margin-bottom:18px}.library-editor-section-kicker{display:block;margin-bottom:5px;color:#4a78df;font-size:10px;font-weight:850;letter-spacing:.12em}
.library-editor-section-head h2{font-size:18px}.library-editor-section-head p{margin-top:4px;max-width:440px;font-size:11px;line-height:1.55}
.library-editor-editable-field{margin-bottom:15px}.library-editor-editable-field label,.library-editor-scene-field label{color:#4e5d73;font-size:11px;font-weight:800}
.library-editor-textarea{min-height:124px;padding:14px 15px;border-color:#d8e0ea;border-radius:12px;background:#fcfdff;line-height:1.7}
.library-editor-copy-note{margin-top:3px;padding-top:14px;border-top:1px solid #edf1f5;color:#98a3b2;font-size:10px;line-height:1.55}

.library-editor-image-panel{position:sticky;top:22px}
.library-editor-image-frame{aspect-ratio:16/10;border-color:#e1e7ef;border-radius:14px;background:#f7f9fc}
.library-editor-image-empty{gap:6px}.library-editor-image-empty span{font-size:22px}.library-editor-image-empty strong{font-size:12px;color:#68778c}.library-editor-image-empty small{font-size:10px;color:#9aa5b4}
.library-editor-image-loading{background:rgba(249,251,254,.94);backdrop-filter:none}
.library-editor-image-actions{gap:8px;margin-top:12px}.library-editor-image-actions .btn{min-height:40px;box-shadow:none}.library-editor-image-actions .btn.primary{box-shadow:0 6px 16px rgba(63,115,229,.14)}
.library-editor-scene-field{margin-top:18px;padding-top:17px;border-top:1px solid #edf1f5}
.library-editor-scene-field label{display:flex;align-items:center;gap:6px}.library-editor-scene-field label span{color:#9aa5b4;font-size:10px;font-weight:650}
.library-editor-scene{min-height:108px;padding:13px 14px;border-color:#d8e0ea;border-radius:12px;background:#fcfdff;line-height:1.65}
.library-editor-scene-field small{color:#97a2b1;font-size:10px;line-height:1.55}
.library-editor-tip{margin-top:10px;padding-top:10px;border-top:1px dashed #edf1f5;color:#9aa5b4}
.library-editor-footer{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:4px 2px 0;color:#8d99aa;font-size:11px}
.library-editor-footer-actions{display:flex;align-items:center;gap:9px}.library-editor-footer-actions .btn{min-width:88px}

/* Frequent study navigation should feel spatial but never theatrical. */
.study-depth-motion.study-depth-forward>.study-card{animation:lexiCalmEnterForward .24s var(--ease-out) both}
.study-depth-motion.study-depth-backward>.study-card{animation:lexiCalmEnterBackward .24s var(--ease-out) both}
html[data-study-motion="forward"]::view-transition-old(lexi-study-card){animation:lexiCalmOldForward .18s var(--ease-out) both}
html[data-study-motion="forward"]::view-transition-new(lexi-study-card){animation:lexiCalmEnterForward .24s var(--ease-out) both}
html[data-study-motion="backward"]::view-transition-old(lexi-study-card){animation:lexiCalmOldBackward .18s var(--ease-out) both}
html[data-study-motion="backward"]::view-transition-new(lexi-study-card){animation:lexiCalmEnterBackward .24s var(--ease-out) both}
html[data-study-motion]::view-transition-old(lexi-study-progress){animation:lexiProgressOut .12s ease both}
html[data-study-motion]::view-transition-new(lexi-study-progress){animation:lexiProgressIn .18s ease both}
@keyframes lexiCalmOldForward{from{opacity:1;transform:translateX(0)}to{opacity:.5;transform:translateX(-18px)}}
@keyframes lexiCalmEnterForward{from{opacity:.72;transform:translateX(22px)}to{opacity:1;transform:translateX(0)}}
@keyframes lexiCalmOldBackward{from{opacity:1;transform:translateX(0)}to{opacity:.5;transform:translateX(18px)}}
@keyframes lexiCalmEnterBackward{from{opacity:.72;transform:translateX(-22px)}to{opacity:1;transform:translateX(0)}}

@media(max-width:900px){
  .library-editor-grid-refined{grid-template-columns:1fr}
  .library-editor-identity{align-items:flex-start}.library-editor-meaning-block{min-width:180px}
  .library-editor-image-panel{position:static}
}
@media(max-width:620px){
  .library-editor-identity{display:grid;gap:16px;padding:18px}
  .library-editor-meaning-block{min-width:0;padding:14px 0 0;border-left:0;border-top:1px solid #e8edf3}
  .library-editor-word{font-size:27px}
  .library-editor-footer{align-items:stretch;flex-direction:column}.library-editor-footer-actions{justify-content:flex-end}
}
@media(prefers-reduced-motion:reduce){
  .btn,.speaker,.nav-btn,.input,.textarea,.select,.library-row{transition:none!important}
}
'''
CSS.write_text(css, encoding="utf-8")

pkg = json.loads(PKG.read_text(encoding="utf-8"))
pkg["version"] = "0.8.2"
PKG.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print("patched v0.8.2")
