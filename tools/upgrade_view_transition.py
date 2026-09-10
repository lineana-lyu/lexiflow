from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
app_path=ROOT/'public'/'app.js'
css_path=ROOT/'public'/'styles.css'


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing patch anchor: {label}')
    return text.replace(old,new,1)

app=app_path.read_text(encoding='utf-8')
old='''    const nextStudyMotionSnapshot=studyMotionSnapshot();
    const previousStudyMotionSnapshot=lastStudyMotionSnapshot;
    app.innerHTML=html;
    bind();
    if(nextStudyMotionSnapshot?.key!==previousStudyMotionSnapshot?.key){
      requestAnimationFrame(()=>animateStudySurface(previousStudyMotionSnapshot,nextStudyMotionSnapshot));
    }
    lastStudyMotionSnapshot=nextStudyMotionSnapshot;'''
new='''    const nextStudyMotionSnapshot=studyMotionSnapshot();
    const previousStudyMotionSnapshot=lastStudyMotionSnapshot;
    const motionChanged=nextStudyMotionSnapshot?.key!==previousStudyMotionSnapshot?.key;
    const reducedMotion=Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    const motionDirection=previousStudyMotionSnapshot&&nextStudyMotionSnapshot&&previousStudyMotionSnapshot.cardId===nextStudyMotionSnapshot.cardId&&nextStudyMotionSnapshot.order<previousStudyMotionSnapshot.order?-1:1;
    const commitDom=()=>{app.innerHTML=html;bind();};

    if(motionChanged&&!reducedMotion&&nextStudyMotionSnapshot&&typeof document.startViewTransition==="function"){
      document.documentElement.dataset.studyMotion=motionDirection<0?"backward":"forward";
      const transition=document.startViewTransition(commitDom);
      transition.finished.finally(()=>{delete document.documentElement.dataset.studyMotion;});
    }else{
      commitDom();
      if(motionChanged&&nextStudyMotionSnapshot){
        requestAnimationFrame(()=>animateStudySurface(previousStudyMotionSnapshot,nextStudyMotionSnapshot));
      }
    }
    lastStudyMotionSnapshot=nextStudyMotionSnapshot;'''
app=replace_once(app,old,new,'view transition render hook')
app_path.write_text(app,encoding='utf-8')

css=css_path.read_text(encoding='utf-8')
css_add=r'''

/* Native View Transitions: preserves the outgoing card while the next stage rises from depth. */
.study-depth-shell{view-transition-name:lexi-study-card}
.study-progress-wrap{view-transition-name:lexi-study-progress}
::view-transition-group(lexi-study-card){
  animation-duration:.62s;
  animation-timing-function:cubic-bezier(.2,.78,.2,1);
  overflow:visible;
}
::view-transition-image-pair(lexi-study-card){
  isolation:auto;
  overflow:visible;
}
::view-transition-old(lexi-study-card),
::view-transition-new(lexi-study-card){
  mix-blend-mode:normal;
  transform-origin:50% 50%;
  backface-visibility:hidden;
}
html[data-study-motion="forward"]::view-transition-old(lexi-study-card){animation:lexiViewOldForward .56s cubic-bezier(.4,0,.25,1) both}
html[data-study-motion="forward"]::view-transition-new(lexi-study-card){animation:lexiViewNewForward .62s cubic-bezier(.2,.78,.2,1) both}
html[data-study-motion="backward"]::view-transition-old(lexi-study-card){animation:lexiViewOldBackward .56s cubic-bezier(.4,0,.25,1) both}
html[data-study-motion="backward"]::view-transition-new(lexi-study-card){animation:lexiViewNewBackward .62s cubic-bezier(.2,.78,.2,1) both}
::view-transition-group(lexi-study-progress){animation-duration:.42s}
html[data-study-motion]::view-transition-old(lexi-study-progress){animation:lexiProgressOut .24s ease both}
html[data-study-motion]::view-transition-new(lexi-study-progress){animation:lexiProgressIn .42s .04s ease both}
@keyframes lexiViewOldForward{
  from{opacity:1;transform:perspective(1400px) translate3d(0,0,0) rotateY(0) scale(1);filter:none}
  to{opacity:0;transform:perspective(1400px) translate3d(-42px,8px,-180px) rotateY(6deg) scale(.962);filter:brightness(.95) blur(4px)}
}
@keyframes lexiViewNewForward{
  from{opacity:0;transform:perspective(1400px) translate3d(64px,10px,-230px) rotateY(-8deg) scale(.966);filter:brightness(.95) blur(5px)}
  62%{opacity:1;transform:perspective(1400px) translate3d(-4px,0,14px) rotateY(.7deg) scale(1.003);filter:none}
  to{opacity:1;transform:perspective(1400px) translate3d(0,0,0) rotateY(0) scale(1);filter:none}
}
@keyframes lexiViewOldBackward{
  from{opacity:1;transform:perspective(1400px) translate3d(0,0,0) rotateY(0) scale(1);filter:none}
  to{opacity:0;transform:perspective(1400px) translate3d(40px,8px,-170px) rotateY(-6deg) scale(.966);filter:brightness(.95) blur(4px)}
}
@keyframes lexiViewNewBackward{
  from{opacity:0;transform:perspective(1400px) translate3d(-58px,10px,-210px) rotateY(7deg) scale(.969);filter:brightness(.95) blur(5px)}
  62%{opacity:1;transform:perspective(1400px) translate3d(4px,0,12px) rotateY(-.7deg) scale(1.003);filter:none}
  to{opacity:1;transform:perspective(1400px) translate3d(0,0,0) rotateY(0) scale(1);filter:none}
}
@keyframes lexiProgressOut{from{opacity:1;transform:translateY(0)}to{opacity:.15;transform:translateY(-3px)}}
@keyframes lexiProgressIn{from{opacity:.15;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}
@media(prefers-reduced-motion:reduce){
  .study-depth-shell,.study-progress-wrap{view-transition-name:none}
}
'''
if 'lexiViewNewForward' in css:
    raise SystemExit('view-transition CSS already present')
css_path.write_text(css+css_add,encoding='utf-8')
print('Native view-transition upgrade applied')
