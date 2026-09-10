from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
app_path=ROOT/'public'/'app.js'
css_path=ROOT/'public'/'styles.css'


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing patch anchor: {label}')
    return text.replace(old,new,1)

app=app_path.read_text(encoding='utf-8')
old='''  function studyMotionSnapshot(){
    if(state.route!=="study"||!state.study?.cardId)return null;
    const card=getCard(state.study.cardId);
    if(!card)return null;
    return {
      key:`${card.id}:${card.stage}`,
      cardId:card.id,
      order:stageIndex(card.stage)
    };
  }'''
new='''  function studyMotionSnapshot(){
    if(state.route==="study"&&state.study?.cardId){
      const card=getCard(state.study.cardId);
      if(!card)return null;
      return {
        key:`study:${card.id}:${card.stage}`,
        cardId:card.id,
        order:stageIndex(card.stage)
      };
    }
    if(state.route==="review-session"){
      const cardId=state.reviewQueue[state.reviewIndex];
      const card=cardId&&getCard(cardId);
      if(!card)return null;
      return {
        key:`review:${state.reviewIndex}:${card.id}`,
        cardId:card.id,
        order:state.reviewIndex
      };
    }
    return null;
  }'''
app=replace_once(app,old,new,'review-aware motion snapshot')

old_review='''      + `<div class="card study-card"><div class="study-kicker">主动回忆</div><div class="study-center">
        ${wordIdentity(card,{size:"hero",showPos:true,center:true})}<div class="prompt-small">先回忆中文释义，再查看答案。</div>
        ${state.study?.revealed?`<div class="answer-box"><strong>${escapeHtml(card.meaningZh)}</strong>${sentenceExample(card.exampleEn,"answer-example-en")}<p>${escapeHtml(card.exampleZh)}</p></div>
        <div class="rating-row"><button class="btn" data-action="review-rate" data-quality="again">没记住 · 明天再复习</button><button class="btn primary" data-action="review-rate" data-quality="good">记住了 · 3 天后复习</button></div>`
        :`<button class="btn primary" style="margin-top:22px" data-action="review-reveal">查看答案</button>`}
      </div></div>`'''
new_review='''      + `<div class="review-depth-stage"><div class="study-depth-shell"><span class="study-stack-layer study-stack-layer-far" aria-hidden="true"></span><span class="study-stack-layer study-stack-layer-near" aria-hidden="true"></span><div class="card study-card"><div class="study-kicker">主动回忆</div><div class="study-center">
        ${wordIdentity(card,{size:"hero",showPos:true,center:true})}<div class="prompt-small">先回忆中文释义，再查看答案。</div>
        ${state.study?.revealed?`<div class="answer-box"><strong>${escapeHtml(card.meaningZh)}</strong>${sentenceExample(card.exampleEn,"answer-example-en")}<p>${escapeHtml(card.exampleZh)}</p></div>
        <div class="rating-row"><button class="btn" data-action="review-rate" data-quality="again">没记住 · 明天再复习</button><button class="btn primary" data-action="review-rate" data-quality="good">记住了 · 3 天后复习</button></div>`
        :`<button class="btn primary" style="margin-top:22px" data-action="review-reveal">查看答案</button>`}
      </div></div></div></div>`'''
app=replace_once(app,old_review,new_review,'review depth shell')
app_path.write_text(app,encoding='utf-8')

css=css_path.read_text(encoding='utf-8')
append=r'''

/* Keep non-card chrome stable during native card snapshots; review cards share the same depth language. */
.review-depth-stage{max-width:1080px;margin:0 auto;padding:2px 0 12px}
::view-transition-old(root){animation:none!important;opacity:0}
::view-transition-new(root){animation:none!important;opacity:1}
@media(max-width:760px){.review-depth-stage{padding-bottom:8px}}
'''
if 'review cards share the same depth language' in css:
    raise SystemExit('review depth CSS already present')
css_path.write_text(css+append,encoding='utf-8')
print('Review-session depth transitions added')
