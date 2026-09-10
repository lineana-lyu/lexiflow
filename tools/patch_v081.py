from pathlib import Path
import re

APP = Path("public/app.js")
CSS = Path("public/styles.css")

text = APP.read_text(encoding="utf-8")


def replace_once(old, new, label):
    global text
    if old not in text:
        raise SystemExit(f"missing anchor: {label}")
    text = text.replace(old, new, 1)

replace_once(
    '    librarySearch: "",\n    lookupStatus: "idle",',
    '    librarySearch: "",\n    libraryEditor: null,\n    lookupStatus: "idle",',
    "library editor state",
)

replace_once(
    '  function navButton(route, icon, label){\n    return `<button class="nav-btn ${state.route===route?"active":""}" data-route="${route}">',
    '  function navButton(route, icon, label){\n    const active=state.route===route||(route==="library"&&state.route==="library-edit");\n    return `<button class="nav-btn ${active?"active":""}" data-route="${route}">',
    "library nav active state",
)

library_block = r'''  function libraryPage(){
    const q=state.librarySearch.trim().toLowerCase();
    const list=state.data.cards.filter(c=>!q||c.word.toLowerCase().includes(q)||c.meaningZh.includes(q));
    return shell(
      header("","单词库","点击任意单词卡可以查看并修改内容。",`<button class="btn primary" data-route="add">＋ 添加单词</button>`)
      + `<div class="search-row"><input class="input" id="library-search" placeholder="搜索单词或中文释义" value="${escapeHtml(state.librarySearch)}" /><span class="pill">${list.length} 张卡片</span></div>
      <div class="table-wrap"><table class="table library-table"><thead><tr><th>联想图</th><th>单词</th><th>词性</th><th>中文释义</th><th>阶段</th><th>下次复习</th><th></th></tr></thead>
      <tbody>${list.length?list.map(c=>`<tr class="library-row" data-library-card="${c.id}" tabindex="0" aria-label="编辑 ${escapeHtml(c.word)}">
        <td><div class="library-thumb">${(c.imageData||c.imageUrl)?`<img src="${c.imageData||c.imageUrl}" alt="${escapeHtml(c.word)} 联想图" loading="lazy" />`:`<span>—</span>`}</div></td>
        <td><strong>${escapeHtml(c.word)}</strong><div class="phonetic">${escapeHtml(formatPhonetic(c.phonetic||""))}</div></td>
        <td><span class="pill blue">${escapeHtml(c.pos)}</span></td>
        <td>${escapeHtml(c.meaningZh)}</td>
        <td>${stageLabelOf(c.stage)}</td>
        <td>${c.nextReviewAt?new Date(c.nextReviewAt).toLocaleDateString():"—"}</td>
        <td><div class="library-actions"><button class="btn small" data-action="open-library-editor" data-card-id="${c.id}">编辑</button><button class="btn small danger" data-delete-card="${c.id}">删除</button></div></td>
      </tr>`).join(""):`<tr><td colspan="7"><div class="empty"><strong>没有匹配的单词</strong></div></td></tr>`}</tbody></table></div>`
    );
  }

  function libraryEditorBaseDraft(card){
    return {
      word:card.word||"",
      phonetic:card.phonetic||"",
      pos:card.pos||"",
      meaningZh:card.meaningZh||"",
      exampleEn:card.exampleEn||"",
      exampleZh:card.exampleZh||"",
      visualNote:card.visualNote||card.visualSceneSuggestion?.scene||"",
      imageData:card.imageData||"",
      imageUrl:card.imageUrl||"",
      generatedVisualScene:card.generatedVisualScene||"",
      imageGeneration:card.imageGeneration?{...card.imageGeneration}:null
    };
  }

  function openLibraryEditor(cardId){
    const card=getCard(cardId);
    if(!card)return;
    state.libraryEditor={
      cardId:card.id,
      originalWord:card.word||"",
      originalPhonetic:card.phonetic||"",
      originalMeaningZh:card.meaningZh||"",
      imageGenerating:false,
      draft:libraryEditorBaseDraft(card)
    };
    state.route="library-edit";
    render();
  }

  function captureLibraryEditorDraft(){
    const editor=state.libraryEditor;
    const card=editor&&getCard(editor.cardId);
    if(!editor||!card)return null;
    const current=editor.draft||libraryEditorBaseDraft(card);
    const read=(id,fallback)=>document.getElementById(id)?.value??fallback;
    editor.draft={
      ...current,
      word:String(read("library-edit-word",current.word)||"").trim(),
      phonetic:String(read("library-edit-phonetic",current.phonetic)||"").trim(),
      pos:String(read("library-edit-pos",current.pos)||"").trim(),
      meaningZh:String(read("library-edit-meaning",current.meaningZh)||"").trim(),
      exampleEn:String(read("library-edit-example-en",current.exampleEn)||"").trim(),
      exampleZh:String(read("library-edit-example-zh",current.exampleZh)||"").trim(),
      visualNote:String(read("library-edit-visual-note",current.visualNote)||"").trim()
    };
    return editor.draft;
  }

  function libraryEditPage(){
    const editor=state.libraryEditor;
    const card=editor&&getCard(editor.cardId);
    if(!editor||!card)return libraryPage();
    const d=editor.draft||libraryEditorBaseDraft(card);
    const image=d.imageData||d.imageUrl||"";
    const generating=Boolean(editor.imageGenerating);
    return shell(
      header("","编辑单词卡","修改会保留原来的学习阶段、复习次数和下次复习时间。",`<button class="btn" data-action="library-edit-back">← 返回单词库</button>`)
      + `<div class="library-editor-grid">
        <section class="card pad library-editor-form">
          <div class="library-editor-section-head"><div><h2>单词内容</h2><p>这些内容会直接用于后续记忆和复习。</p></div></div>
          <div class="library-editor-form-grid compact-two">
            <div class="field"><label>单词</label><input class="input" id="library-edit-word" value="${escapeHtml(d.word)}" /></div>
            <div class="field"><label>音标</label><input class="input" id="library-edit-phonetic" value="${escapeHtml(d.phonetic)}" placeholder="留空可重新获取" /></div>
          </div>
          <div class="library-editor-form-grid compact-two">
            <div class="field"><label>词性</label><input class="input" id="library-edit-pos" value="${escapeHtml(d.pos)}" placeholder="noun / verb / adjective" /></div>
            <div class="field"><label>中文释义</label><input class="input" id="library-edit-meaning" value="${escapeHtml(d.meaningZh)}" /></div>
          </div>
          <div class="field"><label>英文例句</label><textarea class="textarea library-editor-textarea" id="library-edit-example-en">${escapeHtml(d.exampleEn)}</textarea></div>
          <div class="field"><label>中文例句</label><textarea class="textarea library-editor-textarea" id="library-edit-example-zh">${escapeHtml(d.exampleZh)}</textarea></div>
          <div class="library-editor-divider"></div>
          <div class="field"><label>联想场景 <span>可选</span></label><textarea class="textarea library-editor-scene" id="library-edit-visual-note" placeholder="例如：我把钥匙留在玄关柜上。留空也可以直接重新生成图片。">${escapeHtml(d.visualNote)}</textarea></div>
          <div class="library-editor-savebar"><button class="btn" data-action="library-edit-back">取消</button><button class="btn primary" data-action="save-library-card">保存修改</button></div>
        </section>

        <aside class="card pad library-editor-image-panel">
          <div class="library-editor-section-head"><div><h2>联想图</h2><p>重新生成或上传图片，保存卡片后一起生效。</p></div></div>
          <div class="library-editor-image-frame ${image?"has-image":""}">
            ${image?`<img class="library-editor-image" src="${image}" alt="${escapeHtml(d.word)} 联想图" />`:`<div class="library-editor-image-empty"><span>✦</span><strong>暂无联想图</strong></div>`}
            ${generating?`<div class="library-editor-image-loading"><span class="mini-spinner"></span><strong>正在生成新图片</strong><small>可以稍等片刻，不会修改当前已保存内容。</small></div>`:""}
          </div>
          <div class="library-editor-image-actions">
            <button class="btn primary" data-action="regenerate-library-image" ${generating?"disabled":""}>${generating?"生成中…":image?"✦ 重新生成":"✦ AI 生成图片"}</button>
            <label class="btn" for="library-image-file">上传图片</label>
            ${image?`<button class="btn ghost" data-action="clear-library-image" ${generating?"disabled":""}>移除图片</button>`:""}
          </div>
          <input id="library-image-file" type="file" accept="image/png,image/jpeg,image/webp" style="display:none" />
          <div class="library-editor-tip">图片只是记忆辅助，不会改变复习进度。</div>
        </aside>
      </div>`
    );
  }

  function statsPage(){'''

pattern = re.compile(r'  function libraryPage\(\)\{.*?\n  \}\n\n  function statsPage\(\)\{', re.S)
text, count = pattern.subn(library_block, text, count=1)
if count != 1:
    raise SystemExit(f"library block replacement count={count}")

replace_once(
    '    else if(state.route==="library") html=libraryPage();\n    else if(state.route==="stats") html=statsPage();',
    '    else if(state.route==="library") html=libraryPage();\n    else if(state.route==="library-edit") html=libraryEditPage();\n    else if(state.route==="stats") html=statsPage();',
    "library edit route",
)

replace_once(
    '      state.route=el.dataset.route;\n      if(state.route!=="study"&&state.route!=="review-session") state.study=null;',
    '      state.route=el.dataset.route;\n      if(state.route!=="library-edit") state.libraryEditor=null;\n      if(state.route!=="study"&&state.route!=="review-session") state.study=null;',
    "route cleanup",
)

row_bind = r'''
    document.querySelectorAll("[data-library-card]").forEach(row=>{
      const open=()=>openLibraryEditor(row.dataset.libraryCard);
      row.addEventListener("click",e=>{
        if(e.target.closest("button,a,input,label,textarea,select"))return;
        open();
      });
      row.addEventListener("keydown",e=>{
        if((e.key==="Enter"||e.key===" ")&&!e.target.closest("button,a,input,label,textarea,select")){
          e.preventDefault();
          open();
        }
      });
    });

    const libraryImageFile=document.getElementById("library-image-file");
    if(libraryImageFile) libraryImageFile.addEventListener("change",e=>{
      const file=e.target.files?.[0];if(!file)return;
      if(file.size>900*1024){showNotice("图片太大","请选择小于 900KB 的 PNG、JPG 或 WebP 图片。","warn");return;}
      const editor=state.libraryEditor;
      if(!editor)return;
      const cardId=editor.cardId;
      const draft=captureLibraryEditorDraft();
      const reader=new FileReader();
      reader.onload=async()=>{
        try{
          const payload=await api("/api/images/local",{method:"POST",body:{dataUrl:String(reader.result||"")}});
          if(state.libraryEditor?.cardId!==cardId)return;
          state.libraryEditor.draft={
            ...draft,
            imageData:"",
            imageUrl:payload.image.url,
            generatedVisualScene:"",
            imageGeneration:{status:"success",message:"已选择本地图片。",code:"LOCAL_UPLOAD",finishedAt:new Date().toISOString()}
          };
          render();
        }catch(err){
          if(state.libraryEditor?.cardId===cardId)showErrorNotice(err,"图片没有保存成功");
        }
      };
      reader.readAsDataURL(file);
    });

    document.querySelectorAll(".library-editor-image").forEach(img=>img.addEventListener("error",()=>{
      const editor=state.libraryEditor;
      if(!editor)return;
      const card=getCard(editor.cardId);
      const draft=editor.draft||libraryEditorBaseDraft(card);
      editor.draft={...draft,imageData:"",imageUrl:"",imageGeneration:{status:"error",message:"原图片文件已不在本机。",code:"IMAGE_MISSING",finishedAt:new Date().toISOString()}};
      render();
    }));
'''

replace_once(
    '    const modelSelect=document.getElementById("codex-model-select");',
    row_bind + '\n    const modelSelect=document.getElementById("codex-model-select");',
    "library editor bindings",
)

handle_insert = r'''    if(action==="open-library-editor"){openLibraryEditor(el.dataset.cardId);return;}
    if(action==="library-edit-back"){state.libraryEditor=null;state.route="library";render();return;}
    if(action==="clear-library-image"){
      const draft=captureLibraryEditorDraft();
      if(state.libraryEditor&&draft){
        state.libraryEditor.draft={...draft,imageData:"",imageUrl:"",generatedVisualScene:"",imageGeneration:null};
        render();
      }
      return;
    }
    if(action==="save-library-card"){
      const editor=state.libraryEditor;
      const card=editor&&getCard(editor.cardId);
      const draft=card&&captureLibraryEditorDraft();
      if(!editor||!card||!draft)return;
      if(!/^[A-Za-z][A-Za-z\s'-]*$/.test(draft.word)){
        showNotice("单词格式不正确","请输入英文单词或常见英文短语。","warn");
        return;
      }
      if(!draft.pos||!draft.meaningZh||!draft.exampleEn||!draft.exampleZh){
        showNotice("还有内容没有填写","词性、中文释义和中英文例句都需要保留。","warn");
        return;
      }
      const duplicate=state.data.cards.find(c=>c.id!==card.id&&c.word.toLowerCase()===draft.word.toLowerCase()&&normalizeSearchText(c.meaningZh)===normalizeSearchText(draft.meaningZh));
      if(duplicate){
        showNotice("已经有相同卡片","这个单词和中文释义已经存在，不需要再保存一张重复卡片。","warn");
        return;
      }
      const oldWord=String(card.word||"");
      const oldPhonetic=String(card.phonetic||"");
      const oldMeaning=String(card.meaningZh||"");
      const wordChanged=normalizeSearchText(oldWord)!==normalizeSearchText(draft.word);
      const meaningChanged=normalizeSearchText(oldMeaning)!==normalizeSearchText(draft.meaningZh);
      card.word=draft.word;
      card.pos=draft.pos;
      card.meaningZh=draft.meaningZh;
      card.exampleEn=draft.exampleEn;
      card.exampleZh=draft.exampleZh;
      card.visualNote=draft.visualNote;
      card.imageData=draft.imageData||"";
      card.imageUrl=draft.imageUrl||"";
      card.generatedVisualScene=draft.generatedVisualScene||"";
      card.imageGeneration=draft.imageGeneration||null;
      card.phonetic=wordChanged&&draft.phonetic===oldPhonetic?"":draft.phonetic;
      if(wordChanged){
        card.audioUrl="";
        card.sourceQuery=draft.word;
      }
      if(meaningChanged){
        card.senseIntentEn="";
        card.avoidVisualEn=[];
      }
      card.updatedAt=new Date().toISOString();
      saveData();
      state.libraryEditor=null;
      state.route="library";
      toast("单词卡已更新");
      if(wordChanged&&!card.phonetic)setTimeout(()=>void ensureCardPronunciation(card),0);
      return;
    }
    if(action==="regenerate-library-image"){
      const editor=state.libraryEditor;
      const card=editor&&getCard(editor.cardId);
      if(!editor||!card||editor.imageGenerating)return;
      const draft=captureLibraryEditorDraft();
      if(!draft?.word||!draft.meaningZh){showNotice("先补全单词和释义","图片生成至少需要单词和中文释义。","warn");return;}
      const cardId=card.id;
      const scene=draft.visualNote||`围绕“${draft.meaningZh}”设计一个具体、清晰、生活化的记忆场景，突出 ${draft.word} 的当前含义。`;
      editor.imageGenerating=true;
      render();
      try{
        const payload=await api("/api/ai/image",{method:"POST",body:{
          word:draft.word,
          meaningZh:draft.meaningZh,
          exampleEn:draft.exampleEn,
          visualNote:scene,
          suggestedScene:"",
          sourceQuery:draft.word,
          senseIntentEn:normalizeSearchText(draft.meaningZh)===normalizeSearchText(card.meaningZh)?card.senseIntentEn||"":"",
          avoidVisualEn:normalizeSearchText(draft.meaningZh)===normalizeSearchText(card.meaningZh)?card.avoidVisualEn||[]:[]
        }});
        if(state.libraryEditor?.cardId!==cardId)return;
        state.libraryEditor.draft={
          ...draft,
          imageData:"",
          imageUrl:payload.image.url,
          generatedVisualScene:String(payload.image.visualNote||scene||"").trim(),
          imageGeneration:{status:"success",phase:"done",message:"联想图已重新生成。",code:"",finishedAt:new Date().toISOString()}
        };
        state.libraryEditor.imageGenerating=false;
        render();
      }catch(err){
        if(state.libraryEditor?.cardId!==cardId)return;
        state.libraryEditor.imageGenerating=false;
        showErrorNotice(err,"图片没有生成成功");
      }
      return;
    }
'''

replace_once(
    '    if(action==="dismiss-notice"){state.notice=null;render();return;}\n',
    '    if(action==="dismiss-notice"){state.notice=null;render();return;}\n' + handle_insert,
    "library editor actions",
)

APP.write_text(text, encoding="utf-8")

css = CSS.read_text(encoding="utf-8")
css += r'''

/* v0.8.1 — editable library cards */
.library-row{cursor:pointer;transition:background .14s ease,box-shadow .14s ease}
.library-row:hover{background:#f8faff}
.library-row:focus-visible{outline:2px solid #b9cdf5;outline-offset:-2px}
.library-actions{display:flex;justify-content:flex-end;gap:7px;white-space:nowrap}
.library-editor-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(300px,.65fr);gap:18px;align-items:start}
.library-editor-form,.library-editor-image-panel{box-shadow:var(--shadow)}
.library-editor-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:18px}
.library-editor-section-head h2{margin:0;color:#17243a;font-size:18px;letter-spacing:-.02em}
.library-editor-section-head p{margin:5px 0 0;color:#8390a3;font-size:11px;line-height:1.55}
.library-editor-form-grid{display:grid;gap:14px;margin-bottom:14px}.library-editor-form-grid.compact-two{grid-template-columns:1fr 1fr}
.library-editor-form>.field{margin-bottom:14px}.library-editor-form .field label{display:flex;gap:6px;align-items:center;margin-bottom:7px;color:#516078;font-size:12px;font-weight:800}.library-editor-form .field label span{color:#9aa5b5;font-size:10px;font-weight:650}
.library-editor-textarea{min-height:86px;resize:vertical}.library-editor-scene{min-height:108px;resize:vertical}
.library-editor-divider{height:1px;margin:4px 0 18px;background:#edf1f5}
.library-editor-savebar{display:flex;justify-content:flex-end;gap:9px;margin-top:6px;padding-top:16px;border-top:1px solid #edf1f5}
.library-editor-image-panel{position:sticky;top:24px}
.library-editor-image-frame{position:relative;overflow:hidden;width:100%;aspect-ratio:4/3;border:1px solid #e4e9f0;border-radius:15px;background:#f7f9fc;display:grid;place-items:center}
.library-editor-image-frame.has-image{background:#eef2f6}.library-editor-image{width:100%;height:100%;object-fit:cover;display:block}
.library-editor-image-empty{display:grid;place-items:center;gap:8px;color:#8996a8}.library-editor-image-empty span{font-size:25px;color:#6f8fd8}.library-editor-image-empty strong{font-size:12px}
.library-editor-image-loading{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:18px;text-align:center;background:rgba(248,250,253,.92);backdrop-filter:blur(3px)}.library-editor-image-loading strong{font-size:13px;color:#34445d}.library-editor-image-loading small{max-width:220px;color:#8190a4;font-size:10px;line-height:1.55}
.library-editor-image-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:13px}.library-editor-image-actions .btn{flex:1 1 auto}
.library-editor-tip{margin-top:12px;color:#94a0b0;font-size:10px;line-height:1.5}
@media(max-width:900px){.library-editor-grid{grid-template-columns:1fr}.library-editor-image-panel{position:static}.library-editor-form-grid.compact-two{grid-template-columns:1fr}}

/* v0.8.1 — calmer right-to-left card switching */
.study-depth-motion.study-depth-forward>.study-card{animation:lexiDepthForward .40s cubic-bezier(.22,.78,.22,1) both}
.study-depth-motion.study-depth-backward>.study-card{animation:lexiDepthBackward .40s cubic-bezier(.22,.78,.22,1) both}
.study-depth-motion .study-stack-layer{animation:none!important}
.study-depth-motion .study-kicker,.study-depth-motion .study-center,.study-depth-motion .visual-learning-stage,.study-depth-motion .apply-learning-stage{animation:lexiStageContentIn .28s .04s ease-out both}
.study-stepper-motion .study-stepper-item.active .study-stepper-dot{animation:lexiStepPop .28s ease-out both}
@keyframes lexiDepthForward{0%{opacity:.28;transform:translate3d(48px,0,-38px) rotateY(-1deg) scale(.994);filter:none}100%{opacity:1;transform:translate3d(0,0,0) rotateY(0) scale(1);filter:none}}
@keyframes lexiDepthBackward{0%{opacity:.28;transform:translate3d(-42px,0,-34px) rotateY(.9deg) scale(.995);filter:none}100%{opacity:1;transform:translate3d(0,0,0) rotateY(0) scale(1);filter:none}}
@keyframes lexiStageContentIn{0%{opacity:.55;transform:translateY(2px)}100%{opacity:1;transform:translateY(0)}}
@keyframes lexiStepPop{0%{transform:scale(.94)}65%{transform:scale(1.02)}100%{transform:scale(1)}}
::view-transition-group(lexi-study-card){animation-duration:.40s;animation-timing-function:cubic-bezier(.22,.78,.22,1)}
html[data-study-motion="forward"]::view-transition-old(lexi-study-card){animation:lexiViewOldForward .36s ease-in both}
html[data-study-motion="forward"]::view-transition-new(lexi-study-card){animation:lexiViewNewForward .40s cubic-bezier(.22,.78,.22,1) both}
html[data-study-motion="backward"]::view-transition-old(lexi-study-card){animation:lexiViewOldBackward .36s ease-in both}
html[data-study-motion="backward"]::view-transition-new(lexi-study-card){animation:lexiViewNewBackward .40s cubic-bezier(.22,.78,.22,1) both}
@keyframes lexiViewOldForward{from{opacity:1;transform:perspective(1400px) translate3d(0,0,0) rotateY(0) scale(1);filter:none}to{opacity:.08;transform:perspective(1400px) translate3d(-52px,0,-34px) rotateY(1deg) scale(.992);filter:none}}
@keyframes lexiViewNewForward{from{opacity:.24;transform:perspective(1400px) translate3d(52px,0,-34px) rotateY(-1deg) scale(.994);filter:none}to{opacity:1;transform:perspective(1400px) translate3d(0,0,0) rotateY(0) scale(1);filter:none}}
@keyframes lexiViewOldBackward{from{opacity:1;transform:perspective(1400px) translate3d(0,0,0) rotateY(0) scale(1);filter:none}to{opacity:.08;transform:perspective(1400px) translate3d(46px,0,-32px) rotateY(-.9deg) scale(.993);filter:none}}
@keyframes lexiViewNewBackward{from{opacity:.24;transform:perspective(1400px) translate3d(-46px,0,-32px) rotateY(.9deg) scale(.995);filter:none}to{opacity:1;transform:perspective(1400px) translate3d(0,0,0) rotateY(0) scale(1);filter:none}}
html[data-study-motion]::view-transition-old(lexi-study-progress){animation:lexiProgressOut .16s ease both}
html[data-study-motion]::view-transition-new(lexi-study-progress){animation:lexiProgressIn .24s ease both}
@keyframes lexiProgressOut{from{opacity:1}to{opacity:.35}}
@keyframes lexiProgressIn{from{opacity:.45}to{opacity:1}}
'''
CSS.write_text(css, encoding="utf-8")

package = Path("package.json")
pkg = package.read_text(encoding="utf-8")
if '"version": "0.8.0"' not in pkg:
    raise SystemExit("unexpected package version")
package.write_text(pkg.replace('"version": "0.8.0"', '"version": "0.8.1"', 1), encoding="utf-8")

print("patched v0.8.1")
