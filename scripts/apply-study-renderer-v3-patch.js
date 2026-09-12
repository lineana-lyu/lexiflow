const fs=require("fs");
const path=require("path");

const file=path.join(__dirname,"..","public","app.js");
let source=fs.readFileSync(file,"utf8");

function replaceOnce(from,to,label){
  const first=source.indexOf(from);
  if(first<0)throw new Error(`${label}: source fragment not found`);
  if(source.indexOf(from,first+from.length)>=0)throw new Error(`${label}: source fragment is not unique`);
  source=source.slice(0,first)+to+source.slice(first+from.length);
}

replaceOnce(
`  function startStudy(cardId){
    const card=cardId?getCard(cardId):activeLearningCards()[0];
    if(!card){toast("当前没有首次学习任务");state.route="home";render();return;}`,
`  function startStudy(cardId){
    const explicitId=String(cardId||"").trim();
    const card=explicitId?getCard(explicitId):null;
    if(!card){toast("当前没有可打开的学习任务");state.route="home";render();return false;}
    if(card.inboxPending||card.stage==="review"||card.stage==="mastered"){
      toast("这张卡片当前不能进入首次学习");
      state.route="home";
      render();
      return false;
    }`,
"make startStudy explicit-card only"
);

replaceOnce(
`    render();
    void ensureCardPronunciation(card);
  }

  function studyPage(){`,
`    render();
    void ensureCardPronunciation(card);
    return true;
  }

  // Narrow rendering bridge for Study Session V3. The renderer may display one
  // explicit card, but it does not choose Today membership, ordering or timing.
  window.LexiFlowStudyRenderer=Object.freeze({
    openCard(cardId){return startStudy(String(cardId||""));},
    currentCardId(){return state.route==="study"?String(state.study?.cardId||""):"";},
    hasCard(cardId){return Boolean(getCard(String(cardId||"")));}
  });

  function studyPage(){`,
"expose narrow Study renderer bridge"
);

replaceOnce(
`    if(action==="continue-learning"){startStudy();return;}`,
`    if(action==="continue-learning"){
      if(window.LexiFlowStudySessionV3?.open){window.LexiFlowStudySessionV3.open();return;}
      showNotice("学习会话还没有准备好","Today Plan 会决定下一张学习卡。请稍后重试，不会自动打开旧队列。","warn");
      return;
    }`,
"retire no-argument legacy Study entry"
);

fs.writeFileSync(file,source,"utf8");
console.log("Study renderer bridge patch applied.");
