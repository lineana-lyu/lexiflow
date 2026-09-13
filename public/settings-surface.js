(() => {
  "use strict";

  let scheduled = false;

  function clean(value){ return String(value || "").trim(); }
  function settingsPage(){
    const title = document.querySelector(".page-head h1");
    return clean(title?.textContent) === "设置" ? document.querySelector(".content") : null;
  }
  function rows(){ return Array.from(document.querySelectorAll(".settings-list > .setting-row")); }
  function rowByTitle(title){ return rows().find(row => clean(row.querySelector("h3")?.textContent) === title) || null; }
  function buildAdvancedSection(){
    const list = document.querySelector(".settings-list");
    if(!list) return;
    const modelRow = rowByTitle("AI 高级配置");
    if(!modelRow) return;
    let advanced = list.querySelector("[data-settings-advanced]");
    if(!advanced){
      advanced = document.createElement("details");
      advanced.dataset.settingsAdvanced = "1";
      advanced.style.cssText = "border:1px solid var(--line);border-radius:14px;background:#fff;overflow:hidden;";
      advanced.innerHTML = `<summary style="cursor:pointer;padding:16px 17px;list-style:none;display:flex;justify-content:space-between;gap:16px;align-items:center"><span><strong style="font-size:14px">高级设置</strong><span style="display:block;margin-top:4px;color:var(--muted);font-size:11px">一般无需调整</span></span><span style="color:var(--muted);font-size:12px">展开</span></summary><div data-settings-advanced-body></div>`;
      const dataRows = rows().filter(row => ["导出学习数据","导入学习数据","清空学习数据","清除所有学习数据","清除所有学习数据 · 高风险"].includes(clean(row.querySelector("h3")?.textContent)));
      if(dataRows[0]) list.insertBefore(advanced, dataRows[0]); else list.appendChild(advanced);
    }
    const body = advanced.querySelector("[data-settings-advanced-body]");
    if(body && modelRow.parentElement !== body){
      body.appendChild(modelRow);
      modelRow.style.border = "0";
      modelRow.style.borderTop = "1px solid var(--line-soft)";
      modelRow.style.borderRadius = "0";
    }
  }

  function enhance(){
    scheduled = false;
    const root = settingsPage();
    if(!root) return;
    buildAdvancedSection();
  }

  function schedule(){
    if(scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { subtree:true, childList:true });
  schedule();
})();
