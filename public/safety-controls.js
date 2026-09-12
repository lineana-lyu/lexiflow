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
    "lexiflow-new-user-defaults-v3",
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
    const descriptionText="永久删除全部单词卡、学习进度、复习记录、造句、统计数据和学习过程中生成/上传的图片。应用设置会保留。";
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
    if(p)p.innerHTML='将永久删除全部单词卡、学习进度、复习记录、造句、统计数据和学习图片。<strong>此操作无法撤销。</strong><br><br>应用设置会保留；如需备份，请先导出 JSON。';
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

  async function resetLearningData(){
    const response=await fetch(apiUrl("/api/learning-data/reset"),{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:"{}",
    });
    let payload={};
    try{payload=await response.json();}catch{}
    if(!response.ok||payload.ok!==true)throw new Error(payload.code||`RESET_FAILED_${response.status}`);
    return payload;
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
      const result=await resetLearningData();
      const verified=await readLearningData();
      if((verified.cards||[]).length!==0||(verified.activities||[]).length!==0){
        throw new Error("RESET_VERIFICATION_FAILED");
      }
      clearLocalLearningState();
      if(result.cleanupComplete===false){
        window.alert(`学习记录已经清除，但有 ${Number(result.imageCleanupFailed||0)} 个历史图片文件未能删除。关闭占用这些文件的程序后，再次执行“清除所有学习数据”即可。`);
      }
      button.textContent=result.cleanupComplete===false?"学习记录已清除":"已全部清除";
      setTimeout(()=>location.reload(),160);
    }catch(err){
      console.error("learning data reset failed",err);
      button.disabled=false;
      button.textContent=original;
      window.alert("学习数据没有完整清除成功。请保持 LexiFlow 本地服务运行后重试；不会把失败的操作显示成已清除。");
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