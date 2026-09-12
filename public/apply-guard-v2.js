(() => {
  "use strict";
  let queued=false;
  const containsChinese=v=>/[\u3400-\u9fff]/.test(String(v||""));
  const escapeRe=v=>String(v||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  function forms(word){
    const w=String(word||"").trim().toLowerCase();if(!w)return[];const s=new Set([w]);
    if(w.includes(" "))return[w];
    if(w.endsWith("y")&&w.length>2){s.add(w.slice(0,-1)+"ies");s.add(w.slice(0,-1)+"ied");}
    if(w.endsWith("e")){s.add(w+"s");s.add(w+"d");s.add(w.slice(0,-1)+"ing");}else{s.add(w+"s");s.add(w+"es");s.add(w+"ed");s.add(w+"ing");}
    const irregular={keep:["kept"],run:["ran","running"],write:["wrote","written","writing"],go:["went","gone"],have:["has","had"],do:["does","did","done"],make:["made"],take:["took","taken"],see:["saw","seen"],come:["came"],get:["got","gotten"],give:["gave","given"],eat:["ate","eaten"],buy:["bought"],bring:["brought"],think:["thought"],say:["said"]};
    (irregular[w]||[]).forEach(x=>s.add(x));return[...s];
  }
  function word(){return String(document.querySelector(".apply-word-hero .target-word-text,.study-card-focus .target-word-text")?.textContent||"").trim();}
  function uses(text,target){if(!target)return false;if(target.includes(" "))return String(text||"").toLowerCase().includes(target.toLowerCase());return forms(target).some(f=>new RegExp(`\\b${escapeRe(f)}\\b`,"i").test(String(text||"")));}
  function status(){const input=document.getElementById("apply-text"),target=word(),value=String(input?.value||"").trim();if(!value)return{ok:false,msg:"先写一句你真正想表达的话。"};if(containsChinese(value))return{ok:false,msg:"最后需要用英文完成这句话。可以采用 AI 的英文建议，或自己改写后再继续。"};if(!uses(value,target))return{ok:false,msg:`最后的英文句子需要自然使用目标词 “${target}” 或它的常见词形。`};return{ok:true,msg:""};}
  function warning(message){
    const composer=document.querySelector(".apply-composer");if(!composer)return;let box=document.querySelector(".lexi-apply-final-warning");
    if(!message){box?.remove();return;}
    if(!box){box=document.createElement("div");box.className="lexi-apply-final-warning";box.style.cssText="margin-top:10px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;color:var(--muted);font-size:13px;line-height:1.6";composer.insertAdjacentElement("afterend",box);}box.textContent=message;
  }
  function decorate(){
    const input=document.getElementById("apply-text");if(!input)return;const s=status();
    document.querySelectorAll('[data-action="pass-apply"]').forEach(btn=>{if(!s.ok){btn.disabled=true;btn.title=s.msg;if(containsChinese(input.value))btn.textContent="先完成英文表达";else if(input.value.trim())btn.textContent="先使用目标词";}else{btn.title="";}});
    if(s.ok)warning("");
  }
  document.addEventListener("click",e=>{const btn=e.target?.closest?.('[data-action="pass-apply"]');if(!btn)return;const s=status();if(s.ok)return;e.preventDefault();e.stopImmediatePropagation();warning(s.msg);document.getElementById("apply-text")?.focus();},true);
  document.addEventListener("input",e=>{if(e.target?.id!=="apply-text")return;warning("");schedule();},true);
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorate();});}
  function start(){const app=document.getElementById("app");if(!app)return;decorate();new MutationObserver(schedule).observe(app,{childList:true,subtree:true});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
