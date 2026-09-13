(() => {
  "use strict";

  let scheduled = false;

  function clean(value){ return String(value || "").trim(); }
  function setText(node,value){ if(node && node.textContent !== value) node.textContent = value; }
  function settingsPage(){
    const title = document.querySelector(".page-head h1");
    return clean(title?.textContent) === "设置" ? document.querySelector(".content") : null;
  }
  function rows(){ return Array.from(document.querySelectorAll(".settings-list > .setting-row")); }
  function rowByTitle(title){ return rows().find(row => clean(row.querySelector("h3")?.textContent) === title) || null; }
  function firstDescription(row){ return row?.querySelector("div > p") || row?.querySelector("p") || null; }

  function simplifyVoice(){
    const row = rowByTitle("本地自然发音") || rowByTitle("自然发音");
    if(!row) return;
    setText(row.querySelector("h3"),"自然发音");
    setText(firstDescription(row),"优先播放真人词典发音；没有真人音频时，使用你选择的自然合成音。首次准备完成后可离线使用。");
    const textCol = row.querySelector(":scope > div:first-child");
    if(textCol) Array.from(textCol.querySelectorAll(":scope > p")).slice(1).forEach(p => p.remove());
  }

  function buildAdvancedSection(){
    const list = document.querySelector(".settings-list");
    if(!list) return;
    const modelRow = rowByTitle("模型与思考强度") || rowByTitle("AI 高级配置");
    const imageRow = rowByTitle("图片生成");
    imageRow?.remove();
    if(!modelRow) return;

    setText(modelRow.querySelector("h3"),"AI 高级配置");
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
    simplifyVoice();
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
