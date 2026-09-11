(() => {
  "use strict";

  function strengthenResetEntry(){
    const trigger=document.querySelector('[data-action="confirm-reset"]');
    if(!trigger||trigger.dataset.safetyEnhanced==="1")return;

    // Mark the freshly rendered node before mutating its children. The observer
    // watches childList changes, so rewriting textContent without this guard
    // would observe its own mutations forever and lock the renderer as soon as
    // the Settings page is mounted.
    trigger.dataset.safetyEnhanced="1";
    trigger.textContent="清除所有学习数据";
    trigger.classList.add("danger");
    const row=trigger.closest(".setting-row");
    const title=row?.querySelector("h3");
    const description=row?.querySelector("p");
    if(title&&title.textContent!=="清除所有学习数据 · 高风险") title.textContent="清除所有学习数据 · 高风险";
    const descriptionText="永久删除全部单词卡、学习进度、复习记录、造句和统计数据。建议先导出 JSON 备份。";
    if(description&&description.textContent!==descriptionText) description.textContent=descriptionText;
  }

  function strengthenResetModal(){
    const modal=document.querySelector(".modal");
    if(!modal)return;
    const title=modal.querySelector("h2");
    const action=modal.querySelector('[data-action="reset-data"]');
    if(!title||!action||action.dataset.safetyEnhanced==="1")return;
    if(!title.textContent.includes("清空")&&!title.textContent.includes("高风险操作"))return;

    // Same rule for the confirmation modal: decorate each rendered DOM node once.
    action.dataset.safetyEnhanced="1";
    const titleText="高风险操作：清空全部学习数据";
    if(title.textContent!==titleText) title.textContent=titleText;
    const p=modal.querySelector("p");
    const message='将永久删除全部单词卡、学习进度、复习记录、造句和统计数据。<strong>此操作无法撤销，也无法从 LexiFlow 恢复。</strong><br><br>建议先导出 JSON 备份。点击下方按钮后，还需要输入“清空”进行二次确认。';
    if(p&&p.innerHTML!==message) p.innerHTML=message;
    if(action.textContent!=="永久清空全部数据") action.textContent="永久清空全部数据";
  }

  function refresh(){strengthenResetEntry();strengthenResetModal();}
  const observer=new MutationObserver(refresh);
  observer.observe(document.documentElement,{subtree:true,childList:true});
  refresh();

  document.addEventListener("click",event=>{
    const button=event.target?.closest?.('[data-action="reset-data"]');
    if(!button||button.dataset.safetyConfirmed==="1")return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    const answer=window.prompt("这是不可恢复的高风险操作。\n\n将删除所有学习数据。若已确认，请输入：清空");
    if(answer!=="清空")return;
    button.dataset.safetyConfirmed="1";
    setTimeout(()=>button.click(),0);
  },true);
})();
