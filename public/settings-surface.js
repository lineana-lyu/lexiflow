(() => {
  "use strict";

  let scheduled = false;

  function clean(value){ return String(value || "").trim(); }
  function settingsPage(){
    const title = document.querySelector(".page-head h1");
    return clean(title?.textContent) === "设置" ? document.querySelector(".content") : null;
  }
  function rows(){ return Array.from(document.querySelectorAll(".settings-list > .setting-row")); }
  function rowByTitle(title){
    return rows().find(row => clean(row.querySelector("h3")?.textContent) === title) || null;
  }
  function firstDescription(row){ return row?.querySelector("div > p") || row?.querySelector("p") || null; }

  function simplifyHeader(root){
    root.querySelector('[data-action="refresh-provider"]')?.remove();
    const banner = root.querySelector(".settings-security-banner");
    if(banner){
      banner.textContent = "连接凭据只保存在当前设备；学习内容不会发送给词典服务。";
      banner.style.fontSize = "12px";
    }
  }

  function simplifyDictionary(){
    const row = rowByTitle("英语词典") || rowByTitle("词典增强");
    if(!row) return;
    const title = row.querySelector("h3");
    if(title) title.textContent = "词典增强";
    const description = firstDescription(row);
    if(description) description.textContent = "基础查词可离线使用。连接在线词典后，可补充真人发音和更多例句。";
    const input = row.querySelector("#mw-api-key");
    if(input) input.placeholder = "输入词典服务密钥";
    const save = row.querySelector('[data-action="save-dictionary-key"]');
    if(save) save.textContent = "保存";
    const test = row.querySelector('[data-action="test-dictionary"]');
    if(test) test.textContent = "验证";
  }

  function simplifyAi(){
    const row = rowByTitle("AI 服务") || rowByTitle("AI 辅助");
    if(!row) return;
    const title = row.querySelector("h3");
    if(title) title.textContent = "AI 辅助";
    const textCol = row.querySelector(":scope > div:first-child");
    if(textCol){
      const ps = Array.from(textCol.querySelectorAll(":scope > p"));
      if(ps[0]) ps[0].textContent = "用于造句反馈、联想场景和图片生成。";
      ps.slice(1).forEach(p => p.remove());
      textCol.querySelector(".advanced-diagnostics")?.remove();
    }
    const actions = row.querySelector(".setting-actions-inline");
    if(actions){
      const pills = Array.from(actions.querySelectorAll(".pill"));
      const connected = pills[0]?.classList.contains("green");
      if(pills[0]) pills[0].textContent = connected ? "已连接" : "未连接";
      pills.slice(1).forEach(p => p.remove());
      const test = actions.querySelector('[data-action="test-codex-text"]');
      if(test){
        if(connected) test.remove();
        else test.textContent = "重新连接";
      }
    }
  }

  function simplifyVoice(){
    const row = rowByTitle("本地自然发音") || rowByTitle("自然发音");
    if(!row) return;
    const title = row.querySelector("h3");
    if(title) title.textContent = "自然发音";
    const description = firstDescription(row);
    if(description) description.textContent = "优先播放真人词典发音；没有真人音频时，使用你选择的自然合成音。首次准备完成后可离线使用。";
    const textCol = row.querySelector(":scope > div:first-child");
    if(textCol){
      Array.from(textCol.querySelectorAll(":scope > p")).slice(1).forEach(p => p.remove());
    }
  }

  function buildAdvancedSection(){
    const list = document.querySelector(".settings-list");
    if(!list) return;
    let modelRow = rowByTitle("模型与思考强度") || rowByTitle("AI 高级配置");
    const imageRow = rowByTitle("图片生成");
    if(imageRow) imageRow.remove();
    if(!modelRow) return;

    const title = modelRow.querySelector("h3");
    if(title) title.textContent = "AI 高级配置";
    let advanced = list.querySelector("[data-settings-advanced]");
    if(!advanced){
      advanced = document.createElement("details");
      advanced.dataset.settingsAdvanced = "1";
      advanced.style.cssText = "border:1px solid var(--line);border-radius:14px;background:#fff;overflow:hidden;";
      advanced.innerHTML = `<summary style="cursor:pointer;padding:16px 17px;list-style:none;display:flex;justify-content:space-between;gap:16px;align-items:center"><span><strong style="font-size:14px">高级设置</strong><span style="display:block;margin-top:4px;color:var(--muted);font-size:11px">一般无需调整</span></span><span style="color:var(--muted);font-size:12px">展开</span></summary><div data-settings-advanced-body></div>`;
      const dataRows = rows().filter(row => ["导出学习数据","导入学习数据","清空学习数据","清除所有学习数据"].includes(clean(row.querySelector("h3")?.textContent)));
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

  function polishDataLabels(){
    const exportRow = rowByTitle("导出学习数据");
    const importRow = rowByTitle("导入学习数据");
    const clearRow = rowByTitle("清空学习数据") || rowByTitle("清除所有学习数据");
    if(exportRow){ const p = firstDescription(exportRow); if(p) p.textContent = "备份单词卡、学习进度和复习记录。"; }
    if(importRow){ const p = firstDescription(importRow); if(p) p.textContent = "从此前导出的备份恢复学习数据。"; }
    if(clearRow){
      const h3 = clearRow.querySelector("h3"); if(h3) h3.textContent = "清除所有学习数据";
      const p = firstDescription(clearRow); if(p) p.textContent = "永久删除当前设备上的全部单词卡、进度、复习记录和统计。";
    }
  }

  function enhance(){
    scheduled = false;
    const root = settingsPage();
    if(!root) return;
    simplifyHeader(root);
    simplifyDictionary();
    simplifyAi();
    simplifyVoice();
    buildAdvancedSection();
    polishDataLabels();
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
