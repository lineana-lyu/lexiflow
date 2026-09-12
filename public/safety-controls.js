(() => {
  "use strict";

  const RESET_KEYS=[
    "lexiflow-standalone-mvp-v1",
    "lexiflow-study-session-v3",
    "lexiflow-review-session-v3",
    "lexiflow-memorize-v2",
    "lexiflow-study-drafts-v2",
    "lexiflow-study-active-v2",
    "lexiflow-review-resume-v2",
    "lexiflow-review-session-state-v2",
    "lexiflow-studyday-runtime-v2",
    "lexiflow-source-context-draft-v2",
    "lexiflow-apply-quality-v3",
  ];
  let clearing=false;

  function strengthenResetEntry(){
    const trigger=document.querySelector('[data-action="confirm-reset"]');
    if(!trigger||trigger.dataset.safetyEnhanced==="1")return;
    trigger.dataset.safetyEnhanced="1";
    trigger.textContent="清除所有学习数据";
    trigger.classList.add("danger");
    const row=trigger.closest(".setting-row");
    const title=row?.querySelector("h3");
    const description=row?.querySelector("p");
    if(title&&title.textContent!=="清除所有学习数据 · 高风险") title.textContent="清除所有学习数据 · 高风险";
    const descriptionText="永久删除全部单词卡、学习进度、复习记录、造句和统计数据。应用设置会保留。";
    if(description&&description.textContent!==descriptionText) description.textContent=descriptionText;
  }

  function strengthenResetModal(){
    const modal=document.querySelector(".modal");
    if(!modal)return;
    const title=modal.querySelector("h2");
    const action=modal.querySelector('[data-action="reset-data"]');
    if(!title||!action||action.dataset.safetyEnhanced==="1")return;
    if(!title.textContent.includes("清空")&&!title.textContent.includes("高风险操作"))return;

    action.dataset.safetyEnhanced="1";
    title.textContent="高风险操作：清空全部学习数据";
    const p=modal.querySelector("p");
    if(p)p.innerHTML='将永久删除全部单词卡、学习进度、复习记录、造句和统计数据。<strong>此操作无法撤销。</strong><br><br>应用设置会保留；如需备份，请先导出 JSON。';
    action.textContent="永久清空全部数据";
  }

  function apiUrl(path){
    return location.protocol==="file:"?`http://127.0.0.1:4177${path}`:path;
  }

  async function readLearningData(){
    const response=await fetch(apiUrl("/api/learning-data"),{cache:"no-store"});
    if(!response.ok)throw new Error(`LOAD_FAILED_${response.status}`);
    const payload=await response.json();
    return payload?.data||{};
  }

  function freshLearningData(previous={}){
    return {
      version:Number(previous.version)||1,
      cards:[],
      activities:[],
      settings:{...(previous.settings||{})},
      createdAt:new Date().toISOString(),
    };
  }

  async function writeLearningData(data){
    const response=await fetch(apiUrl("/api/learning-data"),{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({data}),
    });
    if(!response.ok)throw new Error(`SAVE_FAILED_${response.status}`);
    return response.json().catch(()=>({}));
  }

  function clearLocalLearningState(){
    for(const key of RESET_KEYS){
      try{localStorage.removeItem(key);}catch{}
    }
  }

  async function verifiedReset(button){
    if(clearing)return;
    clearing=true;
    const original=button.textContent;
    button.disabled=true;
    button.textContent="正在清除…";
    try{
      const previous=await readLearningData();
      const fresh=freshLearningData(previous);
      await writeLearningData(fresh);
      await new Promise(resolve=>setTimeout(resolve,120));
      await writeLearningData(fresh);
      const verified=await readLearningData();
      if((verified.cards||[]).length!==0||(verified.activities||[]).length!==0){
        throw new Error("RESET_VERIFICATION_FAILED");
      }
      clearLocalLearningState();
      button.textContent="已清除";
      setTimeout(()=>location.reload(),120);
    }catch(err){
      console.error("learning data reset failed",err);
      button.disabled=false;
      button.textContent=original;
      window.alert("学习数据没有清除成功。请保持 LexiFlow 本地服务运行后重试；现有数据没有被标记为已清除。");
    }finally{
      clearing=false;
    }
  }

  function refresh(){strengthenResetEntry();strengthenResetModal();}
  const observer=new MutationObserver(refresh);
  observer.observe(document.documentElement,{subtree:true,childList:true});
  refresh();

  document.addEventListener("click",event=>{
    const button=event.target?.closest?.('[data-action="reset-data"]');
    if(!button)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    void verifiedReset(button);
  },true);
})();