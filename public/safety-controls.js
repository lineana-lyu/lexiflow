(() => {
  "use strict";

  function strengthenResetModal(){
    const modal=document.querySelector(".modal");
    if(!modal)return;
    const title=modal.querySelector("h2");
    const action=modal.querySelector('[data-action="reset-data"]');
    if(!title||!action||!title.textContent.includes("清空"))return;
    title.textContent="高风险操作：清空全部学习数据";
    const p=modal.querySelector("p");
    if(p)p.innerHTML="将永久删除全部单词卡、学习进度、复习记录、造句和统计数据。<strong>此操作无法撤销，也无法从 LexiFlow 恢复。</strong><br><br>建议先导出 JSON 备份。点击下方按钮后，还需要输入“清空”进行二次确认。";
    action.textContent="永久清空全部数据";
  }

  const observer=new MutationObserver(strengthenResetModal);
  observer.observe(document.documentElement,{subtree:true,childList:true});

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