(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before apply-guard-v3.js");

  let data=null;
  let queued=false;
  let refreshing=false;

  const containsChinese=value=>/[\u3400-\u9fff]/.test(String(value||""));
  const escapeRe=value=>String(value||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");

  function forms(word){
    const value=String(word||"").trim().toLowerCase();
    if(!value)return[];
    if(value.includes(" "))return[value];
    const result=new Set([value]);
    if(value.endsWith("y")&&value.length>2){result.add(value.slice(0,-1)+"ies");result.add(value.slice(0,-1)+"ied");}
    if(value.endsWith("e")){result.add(value+"s");result.add(value+"d");result.add(value.slice(0,-1)+"ing");}
    else{result.add(value+"s");result.add(value+"es");result.add(value+"ed");result.add(value+"ing");}
    const irregular={keep:["kept"],run:["ran","running"],write:["wrote","written","writing"],go:["went","gone"],have:["has","had"],do:["does","did","done"],make:["made"],take:["took","taken"],see:["saw","seen"],come:["came"],get:["got","gotten"],give:["gave","given"],eat:["ate","eaten"],buy:["bought"],bring:["brought"],think:["thought"],say:["said"]};
    (irregular[value]||[]).forEach(item=>result.add(item));
    return [...result];
  }

  function uses(text,target){
    if(!target)return false;
    if(target.includes(" "))return String(text||"").toLowerCase().includes(target.toLowerCase());
    return forms(target).some(form=>new RegExp(`\\b${escapeRe(form)}\\b`,"i").test(String(text||"")));
  }

  async function refresh(){
    if(refreshing)return data;
    refreshing=true;
    try{
      const response=await fetch("/api/learning-data",{cache:"no-store"});
      if(response.ok){
        const payload=await response.json();
        if(payload?.data?.cards)data=core.normalizeData(payload.data);
      }
    }catch{}
    finally{refreshing=false;}
    return data;
  }

  function currentCard(){
    const id=String(window.LexiFlowStudyRenderer?.currentCardId?.()||"");
    if(!id||!Array.isArray(data?.cards))return null;
    const card=data.cards.find(item=>String(item.id)===id)||null;
    return card&&core.canonicalStage(card)==="apply"?card:null;
  }

  function status(){
    const input=document.getElementById("apply-text");
    const card=currentCard();
    const value=String(input?.value||"").trim();
    if(!card)return{ok:false,msg:"当前学习卡还没有准备好，请稍后重试。"};
    if(!value)return{ok:false,msg:"先写一句你真正想表达的话。"};
    if(containsChinese(value))return{ok:false,msg:"最后需要用英文完成这句话。可以采用 AI 的英文建议，或自己改写后再继续。"};
    if(!uses(value,card.word))return{ok:false,msg:`最后的英文句子需要自然使用目标词 “${card.word}” 或它的常见词形。`};
    return{ok:true,msg:""};
  }

  function warning(message){
    const composer=document.querySelector(".apply-composer");
    if(!composer)return;
    let box=document.querySelector(".lexi-apply-final-warning");
    if(!message){box?.remove();return;}
    if(!box){
      box=document.createElement("div");
      box.className="lexi-apply-final-warning";
      box.style.cssText="margin-top:10px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;color:var(--muted);font-size:13px;line-height:1.6";
      composer.insertAdjacentElement("afterend",box);
    }
    box.textContent=message;
  }

  function decorate(){
    const input=document.getElementById("apply-text");
    if(!input)return;
    const result=status();
    document.querySelectorAll('[data-action="pass-apply"]').forEach(button=>{
      if(!result.ok){
        button.disabled=true;
        button.title=result.msg;
        if(containsChinese(input.value))button.textContent="先完成英文表达";
        else if(input.value.trim())button.textContent="先使用目标词";
      }else{
        button.title="";
      }
    });
    if(result.ok)warning("");
  }

  document.addEventListener("click",event=>{
    const button=event.target?.closest?.('[data-action="pass-apply"]');
    if(!button)return;
    const result=status();
    if(result.ok)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    warning(result.msg);
    document.getElementById("apply-text")?.focus();
  },true);

  document.addEventListener("input",event=>{
    if(event.target?.id!=="apply-text")return;
    warning("");
    schedule(false);
  },true);

  function schedule(refreshData=true){
    if(queued)return;
    queued=true;
    requestAnimationFrame(async()=>{
      queued=false;
      if(refreshData)await refresh();
      decorate();
    });
  }

  function start(){
    const app=document.getElementById("app");
    if(!app)return;
    void refresh().then(decorate);
    new MutationObserver(()=>schedule(true)).observe(app,{childList:true,subtree:true});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();