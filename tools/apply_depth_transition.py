from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
app_path = ROOT / "public" / "app.js"
css_path = ROOT / "public" / "styles.css"
pkg_path = ROOT / "package.json"
lock_path = ROOT / "package-lock.json"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing patch anchor: {label}")
    return text.replace(old, new, 1)

app = app_path.read_text(encoding="utf-8")

old_study_surface = '''      + `<div class="study-progress-wrap">${renderStageRail(card)}</div><div class="study-shell study-shell-single"><div class="card study-card study-card-focus">${renderStage(card)}</div></div>`'''
new_study_surface = '''      + `<div class="study-progress-wrap">${renderStageRail(card)}</div><div class="study-shell study-shell-single"><div class="study-depth-shell"><span class="study-stack-layer study-stack-layer-far" aria-hidden="true"></span><span class="study-stack-layer study-stack-layer-near" aria-hidden="true"></span><div class="card study-card study-card-focus">${renderStage(card)}</div></div></div>`'''
app = replace_once(app, old_study_surface, new_study_surface, "study depth surface")

render_anchor = '''  function render(){\n    const app=document.getElementById("app");'''
motion_helpers = r'''  let lastStudyMotionSnapshot=null;
  let studyMotionCleanupTimer=null;

  function studyMotionSnapshot(){
    if(state.route!=="study"||!state.study?.cardId)return null;
    const card=getCard(state.study.cardId);
    if(!card)return null;
    return {
      key:`${card.id}:${card.stage}`,
      cardId:card.id,
      order:stageIndex(card.stage)
    };
  }

  function animateStudySurface(previous,current){
    const shell=document.querySelector(".study-depth-shell");
    if(!shell||!current||previous?.key===current.key)return;
    if(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches)return;

    const direction=previous&&previous.cardId===current.cardId&&current.order<previous.order?-1:1;
    shell.classList.add("study-depth-motion",direction<0?"study-depth-backward":"study-depth-forward");
    const stepper=document.querySelector(".study-stepper");
    if(stepper)stepper.classList.add("study-stepper-motion");

    if(studyMotionCleanupTimer)clearTimeout(studyMotionCleanupTimer);
    studyMotionCleanupTimer=setTimeout(()=>{
      shell.classList.remove("study-depth-motion","study-depth-forward","study-depth-backward");
      stepper?.classList.remove("study-stepper-motion");
    },720);
  }

'''
app = replace_once(app, render_anchor, motion_helpers + render_anchor, "render motion helpers")

old_render_tail = '''    app.innerHTML=html;\n    bind();'''
new_render_tail = '''    const nextStudyMotionSnapshot=studyMotionSnapshot();
    const previousStudyMotionSnapshot=lastStudyMotionSnapshot;
    app.innerHTML=html;
    bind();
    if(nextStudyMotionSnapshot?.key!==previousStudyMotionSnapshot?.key){
      requestAnimationFrame(()=>animateStudySurface(previousStudyMotionSnapshot,nextStudyMotionSnapshot));
    }
    lastStudyMotionSnapshot=nextStudyMotionSnapshot;'''
app = replace_once(app, old_render_tail, new_render_tail, "render transition hook")

app_path.write_text(app, encoding="utf-8")

css = css_path.read_text(encoding="utf-8")
css_add = r'''

/* v0.8 — learning card depth/stack transitions inspired by React Bits */
.study-depth-shell{
  position:relative;
  width:100%;
  perspective:1400px;
  perspective-origin:50% 44%;
  transform-style:preserve-3d;
  isolation:isolate;
}
.study-stack-layer{
  position:absolute;
  left:18px;
  right:18px;
  top:10px;
  bottom:-10px;
  border:1px solid #e4eaf2;
  border-radius:18px;
  background:#fbfcfe;
  box-shadow:0 12px 28px rgba(43,61,91,.035);
  pointer-events:none;
  transform-origin:88% 88%;
  z-index:0;
}
.study-stack-layer-far{
  opacity:.34;
  transform:translate3d(18px,10px,-150px) rotateZ(1.15deg) scale(.972);
}
.study-stack-layer-near{
  opacity:.62;
  transform:translate3d(9px,6px,-72px) rotateZ(.48deg) scale(.986);
}
.study-depth-shell>.study-card{
  position:relative;
  z-index:2;
  transform-style:preserve-3d;
  backface-visibility:hidden;
  transform-origin:50% 50%;
  will-change:transform,opacity,filter;
}
.study-depth-motion.study-depth-forward>.study-card{
  animation:lexiDepthForward .62s cubic-bezier(.2,.78,.2,1) both;
}
.study-depth-motion.study-depth-backward>.study-card{
  animation:lexiDepthBackward .62s cubic-bezier(.2,.78,.2,1) both;
}
.study-depth-motion.study-depth-forward .study-stack-layer-near{
  animation:lexiStackNearForward .62s cubic-bezier(.2,.78,.2,1) both;
}
.study-depth-motion.study-depth-forward .study-stack-layer-far{
  animation:lexiStackFarForward .62s cubic-bezier(.2,.78,.2,1) both;
}
.study-depth-motion.study-depth-backward .study-stack-layer-near{
  animation:lexiStackNearBackward .62s cubic-bezier(.2,.78,.2,1) both;
}
.study-depth-motion .study-kicker,
.study-depth-motion .study-center,
.study-depth-motion .visual-learning-stage,
.study-depth-motion .apply-learning-stage{
  animation:lexiStageContentIn .46s .08s cubic-bezier(.2,.72,.2,1) both;
}
.study-stepper-motion .study-stepper-item.active .study-stepper-dot{
  animation:lexiStepPop .44s cubic-bezier(.2,.8,.2,1) both;
}
.study-stepper-motion .study-stepper-item.active>span:last-child{
  animation:lexiStepLabel .42s .05s ease both;
}
@keyframes lexiDepthForward{
  0%{opacity:0;transform:translate3d(58px,12px,-220px) rotateY(-8deg) scale(.968);filter:brightness(.95) blur(5px)}
  58%{opacity:1;transform:translate3d(-5px,0,16px) rotateY(.8deg) scale(1.004);filter:brightness(1) blur(0)}
  100%{opacity:1;transform:translate3d(0,0,0) rotateY(0) scale(1);filter:none}
}
@keyframes lexiDepthBackward{
  0%{opacity:0;transform:translate3d(-52px,10px,-190px) rotateY(7deg) scale(.972);filter:brightness(.95) blur(5px)}
  58%{opacity:1;transform:translate3d(4px,0,12px) rotateY(-.7deg) scale(1.003);filter:brightness(1) blur(0)}
  100%{opacity:1;transform:translate3d(0,0,0) rotateY(0) scale(1);filter:none}
}
@keyframes lexiStackNearForward{
  0%{opacity:.22;transform:translate3d(24px,13px,-125px) rotateZ(1.15deg) scale(.972)}
  100%{opacity:.62;transform:translate3d(9px,6px,-72px) rotateZ(.48deg) scale(.986)}
}
@keyframes lexiStackFarForward{
  0%{opacity:.12;transform:translate3d(31px,17px,-220px) rotateZ(1.8deg) scale(.954)}
  100%{opacity:.34;transform:translate3d(18px,10px,-150px) rotateZ(1.15deg) scale(.972)}
}
@keyframes lexiStackNearBackward{
  0%{opacity:.24;transform:translate3d(-16px,12px,-120px) rotateZ(-.9deg) scale(.974)}
  100%{opacity:.62;transform:translate3d(9px,6px,-72px) rotateZ(.48deg) scale(.986)}
}
@keyframes lexiStageContentIn{
  0%{opacity:0;transform:translateY(8px);filter:blur(3px)}
  100%{opacity:1;transform:translateY(0);filter:none}
}
@keyframes lexiStepPop{
  0%{transform:scale(.72);box-shadow:0 0 0 0 rgba(52,104,223,.22)}
  60%{transform:scale(1.08);box-shadow:0 0 0 8px rgba(52,104,223,0)}
  100%{transform:scale(1);box-shadow:0 6px 16px rgba(52,104,223,.18)}
}
@keyframes lexiStepLabel{
  0%{opacity:.25;transform:translateX(-4px)}
  100%{opacity:1;transform:translateX(0)}
}
@media(max-width:900px){
  .study-stack-layer{left:12px;right:12px;bottom:-7px}
  .study-stack-layer-far{transform:translate3d(10px,8px,-120px) rotateZ(.7deg) scale(.978)}
  .study-stack-layer-near{transform:translate3d(5px,4px,-60px) rotateZ(.25deg) scale(.989)}
}
@media(prefers-reduced-motion:reduce){
  .study-depth-shell>.study-card,
  .study-depth-motion .study-kicker,
  .study-depth-motion .study-center,
  .study-depth-motion .visual-learning-stage,
  .study-depth-motion .apply-learning-stage,
  .study-stepper-motion .study-stepper-dot,
  .study-stepper-motion .study-stepper-item.active>span:last-child{
    animation:none!important;
    filter:none!important;
    transform:none!important;
  }
}
'''
if "v0.8 — learning card depth/stack transitions" in css:
    raise SystemExit("depth transition CSS already present")
css_path.write_text(css + css_add, encoding="utf-8")

pkg = pkg_path.read_text(encoding="utf-8")
pkg = replace_once(pkg, '"version": "0.7.1"', '"version": "0.8.0"', "package version")
pkg_path.write_text(pkg, encoding="utf-8")

lock = lock_path.read_text(encoding="utf-8")
count = lock.count('"version": "0.7.1"')
if count < 2:
    raise SystemExit(f"unexpected package-lock version anchors: {count}")
lock = lock.replace('"version": "0.7.1"', '"version": "0.8.0"', 2)
lock_path.write_text(lock, encoding="utf-8")

print("Depth/stack study transition patch applied")
