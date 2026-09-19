(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before apply-stage-v3.js");

  let data=null;
  let queued=false;
  let refreshing=false;
  const sessions=new Map();

  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const norm=value=>String(value||"").trim();
  const feedbackCopy=value=>norm(value)
    .replace(/\s+([，。！？；：])/g,"$1")
    .replace(/([，。！？；：])\s+/g,"$1")
    .replace(/([。！？；])\s*[。；]+/g,"$1");
  const joinFeedbackReasons=values=>{
    const parts=(Array.isArray(values)?values:[values]).map(value=>feedbackCopy(value).replace(/[，。！？；：,.;!?]+$/g,"").trim()).filter(Boolean);
    return parts.filter((value,index)=>parts.indexOf(value)===index).join("；");
  };
  const copyNorm=value=>norm(value).toLowerCase().replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/[.,!?;:()[\]{}"']/g," ").replace(/\s+/g," ").trim();
  const surfaceNorm=value=>String(value??"").replace(/\r\n?/g,"\n");
  const hasSurfaceEdit=(from,to)=>Boolean(norm(to))&&surfaceNorm(from)!==surfaceNorm(to);
  const phonetic=value=>{const s=norm(value);return !s?"暂无音标":((s.startsWith("/")&&s.endsWith("/"))||(s.startsWith("[")&&s.endsWith("]")))?s:`/${s}/`;};
  const escapeRe=value=>String(value||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");

  function targetForms(word){
    const w=norm(word).toLowerCase();if(!w)return[];
    if(w.includes(" "))return[w];
    const set=new Set([w]);
    if(w.endsWith("y")&&w.length>2){set.add(`${w.slice(0,-1)}ies`);set.add(`${w.slice(0,-1)}ied`);}
    if(w.endsWith("e")){set.add(`${w}s`);set.add(`${w}d`);set.add(`${w.slice(0,-1)}ing`);}else{set.add(`${w}s`);set.add(`${w}es`);set.add(`${w}ed`);set.add(`${w}ing`);}
    const irregular={keep:["kept"],run:["ran","running"],write:["wrote","written","writing"],go:["went","gone"],have:["has","had"],do:["does","did","done"],make:["made"],take:["took","taken"],see:["saw","seen"],come:["came"],get:["got","gotten"],give:["gave","given"],eat:["ate","eaten"],buy:["bought"],bring:["brought"],think:["thought"],say:["said"]};
    (irregular[w]||[]).forEach(item=>set.add(item));return[...set];
  }
  function usesTarget(text,word){
    const value=String(text||"");const target=norm(word).toLowerCase();if(!target)return false;
    if(target.includes(" "))return value.toLowerCase().includes(target);
    return targetForms(target).some(form=>new RegExp(`\\b${escapeRe(form)}\\b`,"i").test(value));
  }

  function syncFromGateway(){
    try{
      const current=window.LexiFlowLearningDataGatewayV3?.current?.();
      if(!current?.cards)return false;
      data=core.normalizeData(current);
      return true;
    }catch{return false;}
  }

  async function loadData(force=false){
    if(!force&&syncFromGateway())return data;
    const response=await fetch("/api/learning-data",{cache:"no-store"});
    if(!response.ok)throw new Error("LOAD_FAILED");
    const payload=await response.json();
    data=payload?.data?core.normalizeData(payload.data):null;
    return data;
  }
  async function refresh(force=false){if(!force&&syncFromGateway())return data;if(refreshing)return data;refreshing=true;try{return await loadData(true);}catch{return data;}finally{refreshing=false;}}
  async function persist(next){
    const normalized=core.normalizeData(next);
    const response=await fetch("/api/learning-data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data:normalized,applyStageAuthority:"v3"})});
    if(!response.ok)throw new Error("SAVE_FAILED");
    if(!syncFromGateway())data=normalized;return data||normalized;
  }

  function currentCardId(){return String(window.LexiFlowStudyRenderer?.currentCardId?.()||"");}
  function currentCard(){
    const id=currentCardId();if(!id||!Array.isArray(data?.cards))return null;
    const card=data.cards.find(item=>String(item.id)===id)||null;
    return card&&core.canonicalStage(card)==="apply"?card:null;
  }
  function beginApplyWrite(cardId,now=new Date()){
    const transition=window.LexiFlowStageTransitionV3;
    const write=transition?.beginStageWrite?.(cardId,"apply",now);
    return write?{transition,write}:null;
  }
  function restorableDraft(card){
    const savedAt=String(card?.applyDraftSavedAt||"").trim();
    return savedAt?String(card?.applyDraft||""):"";
  }
  function session(card){
    let value=sessions.get(card.id);
    if(!value){value={text:restorableDraft(card),feedback:null,checkError:null,submitting:false,originalText:"",approved:false,suggestionApproved:false,promptLoading:false,lastFix:null,editing:true,pendingIssues:[]};sessions.set(card.id,value);}
    return value;
  }
  function currentState(){
    syncFromGateway();
    const card=currentCard();if(!card)return null;
    const s=session(card);
    return Object.freeze({
      cardId:String(card.id||""),
      word:String(card.word||""),
      meaningZh:String(card.meaningZh||""),
      text:String(s.text||""),
      approved:Boolean(s.approved),
      suggestionApproved:Boolean(s.suggestionApproved),
      submitting:Boolean(s.submitting),
      editing:Boolean(s.editing),
      feedback:s.feedback||null,
      checkError:s.checkError||null,
      pendingIssueCount:Array.isArray(s.pendingIssues)?s.pendingIssues.length:0,
    });
  }

  function injectStyle(){
    if(document.getElementById("lexi-apply-stage-v3-style"))return;
    const style=document.createElement("style");style.id="lexi-apply-stage-v3-style";
    style.textContent=`
      .lexi-apply-stage-v3{min-height:500px;padding:4px;display:grid;gap:18px}.lexi-apply-v3-head{text-align:center;display:grid;gap:6px}.lexi-apply-v3-word{display:flex;align-items:center;justify-content:center;gap:9px}.lexi-apply-v3-word strong{font-size:40px;line-height:1.1}.lexi-apply-v3-word button{border:0;background:transparent;cursor:pointer;font-size:19px}.lexi-apply-v3-meta{font-size:13px;color:var(--muted)}.lexi-apply-v3-meaning{font-size:17px;font-weight:750}.lexi-apply-v3-prompt{width:min(700px,100%);margin:0 auto;padding:13px 15px;border-radius:15px;background:rgba(120,140,132,.05);display:flex;align-items:center;justify-content:space-between;gap:14px}.lexi-apply-v3-prompt div{display:grid;gap:3px}.lexi-apply-v3-prompt small{color:var(--muted)}.lexi-apply-v3-composer{width:min(700px,100%);margin:0 auto}.lexi-apply-v3-composer textarea{min-height:125px;font-size:16px;line-height:1.7}.lexi-apply-v3-composer-bottom{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:9px}.lexi-apply-v3-composer-bottom span{font-size:11px;color:var(--muted)}.lexi-apply-v3-warning{width:min(700px,100%);margin:0 auto;padding:10px 12px;border:1px solid var(--line);border-radius:12px;color:var(--muted);font-size:12px;line-height:1.6}.lexi-apply-v3-feedback{width:min(700px,100%);margin:0 auto;border:1px solid var(--line);border-radius:18px;padding:16px;display:grid;gap:12px;background:var(--surface)}.lexi-apply-v3-feedback.good{background:rgba(78,128,103,.045)}.lexi-apply-v3-feedback.error{background:rgba(174,86,67,.045);border-color:rgba(174,86,67,.16)}.lexi-apply-v3-error-message{margin:0;color:var(--muted);font-size:13px;line-height:1.65}.lexi-apply-v3-error-code{font-size:11px;color:var(--muted)}.lexi-apply-v3-feedback-head{display:flex;justify-content:space-between;gap:12px}.lexi-apply-v3-feedback-head div{display:grid;gap:2px}.lexi-apply-v3-feedback-head small{color:var(--muted)}.lexi-apply-v3-suggestion{font-size:16px;line-height:1.7;padding:12px;border-radius:13px;background:rgba(120,140,132,.05)}.lexi-apply-v3-changes{display:grid;gap:8px;padding:12px 13px;border-radius:13px;background:rgba(91,118,105,.045);border:1px solid rgba(91,118,105,.09)}.lexi-apply-v3-changes>strong{font-size:12px;color:var(--muted);letter-spacing:.02em}.lexi-apply-v3-change{display:grid;gap:3px}.lexi-apply-v3-change-line{font-size:13px;font-weight:700;color:var(--text)}.lexi-apply-v3-change p{margin:0;font-size:12px;line-height:1.55;color:var(--muted)}.lexi-apply-v3-diagnostic{display:grid;gap:7px;padding:12px 13px;border-radius:14px;background:rgba(255,255,255,.72);border:1px solid rgba(139,109,72,.10)}.lexi-apply-v3-diagnostic>small{color:var(--muted);font-size:11px}.lexi-apply-v3-diagnostic-line{font-size:16px;line-height:1.9;white-space:pre-wrap;overflow-wrap:anywhere}.lexi-apply-v3-review-composer{padding:18px 20px;border:1px solid var(--line);border-radius:18px;background:#fff;min-height:125px;display:grid;align-content:space-between;gap:18px}.lexi-apply-v3-review-label{font-size:11px;color:var(--muted)}.lexi-apply-v3-review-sentence{font-size:16px;line-height:1.9;white-space:pre-wrap;overflow-wrap:anywhere}.lexi-apply-v3-inline-issue{appearance:none;border:0;padding:1px 3px;margin:0;color:var(--text);font:inherit;line-height:inherit;border-radius:5px;cursor:pointer}.lexi-apply-v3-inline-issue.blocking{background:rgba(201,73,73,.12);box-shadow:inset 0 0 0 1px rgba(201,73,73,.13);animation:lexi-apply-issue-in .28s ease both}.lexi-apply-v3-inline-issue.blocking:hover{background:rgba(201,73,73,.18);box-shadow:inset 0 0 0 1px rgba(201,73,73,.22)}.lexi-apply-v3-inline-issue.optional{background:rgba(210,159,54,.14);box-shadow:inset 0 0 0 1px rgba(210,159,54,.16)}.lexi-apply-v3-inline-issue.optional:hover{background:rgba(210,159,54,.20)}.lexi-apply-v3-inline-fixed{padding:1px 3px;border-radius:5px;background:rgba(70,139,94,.12);color:#39734d;box-shadow:inset 0 0 0 1px rgba(70,139,94,.10)}.lexi-apply-v3-issues{display:grid;gap:8px}.lexi-apply-v3-issue{display:grid;gap:6px;padding:10px 12px;border-radius:12px;border:1px solid rgba(139,109,72,.10);transition:border-color .18s ease,box-shadow .18s ease}.lexi-apply-v3-issue.blocking{background:rgba(201,73,73,.045);border-color:rgba(201,73,73,.13)}.lexi-apply-v3-issue.optional{background:rgba(210,159,54,.055);border-color:rgba(210,159,54,.16)}.lexi-apply-v3-issue.active{box-shadow:0 0 0 3px rgba(110,122,114,.07)}.lexi-apply-v3-issue strong{font-size:12.5px;color:var(--text)}.lexi-apply-v3-issue p,.lexi-apply-v3-issue small{margin:0;line-height:1.55}.lexi-apply-v3-issue p{font-size:12.5px;color:var(--muted)}.lexi-apply-v3-issue small{font-size:11.5px;color:#7c887f}.lexi-apply-v3-severity{font-size:10.5px;font-weight:750;letter-spacing:.03em}.lexi-apply-v3-issue.blocking .lexi-apply-v3-severity{color:#a84f4f}.lexi-apply-v3-issue.optional .lexi-apply-v3-severity{color:#9a7527}.lexi-apply-v3-issue-fix{justify-self:start;margin-top:2px}.lexi-apply-v3-complete-label{font-size:11px;color:var(--muted);margin-bottom:-5px}@keyframes lexi-apply-issue-in{0%{background:rgba(201,73,73,0);box-shadow:inset 0 0 0 1px rgba(201,73,73,0)}100%{background:rgba(201,73,73,.12);box-shadow:inset 0 0 0 1px rgba(201,73,73,.13)}}.lexi-apply-v3-tips{display:grid;gap:6px;color:var(--muted);font-size:13px}.lexi-apply-v3-actions{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.lexi-apply-stage-v3 .lexi-apply-actions-v3{width:min(700px,100%);margin:0 auto!important}.lexi-apply-v3-undo{width:min(700px,100%);margin:0 auto;text-align:left}@media(max-width:700px){.lexi-apply-v3-prompt{align-items:flex-start;flex-direction:column}.lexi-apply-v3-composer-bottom{align-items:stretch;flex-direction:column}.lexi-apply-v3-composer-bottom .btn{width:100%}.lexi-apply-v3-actions .btn{flex:1}}
    `;document.head.appendChild(style);
  }

  function feedbackChanges(fb){
    return Array.isArray(fb?.changes)?fb.changes.slice(0,3).map(item=>({
      from:norm(item?.from),to:norm(item?.to),reason:feedbackCopy(item?.reason),
      category:norm(item?.category).toLowerCase(),severity:norm(item?.severity).toLowerCase(),
      blocking:item?.blocking===true,
    })).filter(item=>item.from||item.to||item.reason):[];
  }
  function normalizedSeverity(value){
    const raw=norm(value).toLowerCase();
    if(raw==="error"||raw==="warning"||raw==="suggestion")return raw;
    if(raw==="improve")return"warning";
    if(raw==="polish")return"suggestion";
    return"warning";
  }
  function normalizeIssue(item){
    const severity=normalizedSeverity(item?.severity);
    return{
      span:norm(item?.span),
      reason:feedbackCopy(item?.reason),
      hint:feedbackCopy(item?.hint),
      replacement:norm(item?.replacement),
      category:norm(item?.category).toLowerCase(),
      severity,
      blocking:item?.blocking===true||severity==="error",
    };
  }
  function feedbackIssues(fb){
    const direct=Array.isArray(fb?.issues)?fb.issues.slice(0,3).map(normalizeIssue).filter(item=>item.span||item.reason||item.hint||item.replacement):[];
    if(direct.length)return direct;
    return feedbackChanges(fb).map(change=>normalizeIssue({
      span:change.from,
      reason:change.reason||"这部分表达可以调整。",
      hint:change.to?`建议改为 “${change.to}”`:"",
      replacement:change.to,
      category:change.category,
      severity:change.severity,
      blocking:change.blocking,
    })).filter(item=>item.span&&item.replacement);
  }
  function blockingIssues(issues){return (Array.isArray(issues)?issues:[]).filter(issue=>issue?.blocking===true);}
  function optionalIssues(issues){return (Array.isArray(issues)?issues:[]).filter(issue=>issue?.blocking!==true);}
  function issueReplacement(issue,changes){
    const direct=norm(issue?.replacement);if(direct)return direct;
    const span=norm(issue?.span).toLowerCase();
    const match=(changes||[]).find(change=>norm(change.from).toLowerCase()===span&&norm(change.to));
    return norm(match?.to);
  }
  function issueRange(text,span){
    const source=String(text||""),target=norm(span);if(!source||!target)return null;
    let start=source.indexOf(target);
    if(start<0)start=source.toLowerCase().indexOf(target.toLowerCase());
    return start<0?null:{start,end:start+target.length};
  }
  function survivingIssues(text,issues=[]){
    return (Array.isArray(issues)?issues:[]).filter(issue=>issueRange(text,issue?.span));
  }
  function coalesceIssues(text,issues=[]){
    const prepared=(Array.isArray(issues)?issues:[]).map(issue=>{
      const range=issueRange(text,issue?.span);return range?{...issue,_range:range}:null;
    }).filter(Boolean).sort((a,b)=>a._range.start-b._range.start||((b._range.end-b._range.start)-(a._range.end-a._range.start)));
    const result=[];
    for(const candidate of prepared){
      const overlapIndex=result.findIndex(item=>candidate._range.start<item._range.end&&candidate._range.end>item._range.start);
      if(overlapIndex<0){result.push(candidate);continue;}
      const current=result[overlapIndex];
      const currentLength=current._range.end-current._range.start;
      const candidateLength=candidate._range.end-candidate._range.start;
      const currentActionable=Boolean(norm(current.replacement));
      const candidateActionable=Boolean(norm(candidate.replacement));
      const primary=(current.blocking!==candidate.blocking)
        ?(current.blocking?current:candidate)
        :(currentActionable!==candidateActionable)
          ?(candidateActionable?candidate:current)
          :(candidateLength>currentLength?candidate:current);
      const secondary=primary===current?candidate:current;
      result[overlapIndex]={
        ...primary,
        reason:feedbackCopy(primary.reason||secondary.reason),
        hint:feedbackCopy(primary.hint||secondary.hint),
        replacement:norm(primary.replacement||secondary.replacement),
        blocking:Boolean(current.blocking||candidate.blocking),
        severity:(current.blocking||candidate.blocking)?"error":(primary.severity==="warning"||secondary.severity==="warning"?"warning":"suggestion"),
      };
    }
    return result.map(({_range,...issue})=>issue).slice(0,3);
  }
  function mergeBlockingIssues(text,fresh=[],carryover=[]){
    return coalesceIssues(text,[
      ...blockingIssues(fresh),
      ...survivingIssues(text,blockingIssues(carryover)),
    ]).filter(issue=>issue.blocking).slice(0,3);
  }
  function mergeDisplayIssues(text,blocking,optional){
    const merged=coalesceIssues(text,[...(Array.isArray(blocking)?blocking:[]),...(Array.isArray(optional)?optional:[])]);
    const required=blockingIssues(merged).slice(0,3);
    const suggestions=optionalIssues(merged).slice(0,Math.max(0,3-required.length));
    return [...required,...suggestions];
  }
  function diagnosticSentenceHtml(text,issues,lastFix=null){
    const source=String(text||""),ranges=[];
    for(let index=0;index<(issues||[]).length;index+=1){
      const range=issueRange(source,issues[index]?.span);
      if(range&&!ranges.some(item=>range.start<item.end&&range.end>item.start))ranges.push({...range,type:"issue",index});
    }
    if(lastFix&&Number.isInteger(lastFix.start)&&Number.isInteger(lastFix.end)&&lastFix.start>=0&&lastFix.end>lastFix.start&&lastFix.end<=source.length){
      const overlapsIssue=ranges.some(item=>lastFix.start<item.end&&lastFix.end>item.start);
      if(!overlapsIssue)ranges.push({start:lastFix.start,end:lastFix.end,type:"fixed",index:-1});
    }
    if(!ranges.length)return esc(source);
    ranges.sort((a,b)=>a.start-b.start||a.end-b.end);
    let out="",cursor=0;
    for(const range of ranges){
      if(range.start<cursor)continue;
      out+=esc(source.slice(cursor,range.start));
      const piece=esc(source.slice(range.start,range.end));
      if(range.type==="issue"){const issue=issues[range.index]||{};const tone=issue.blocking?"blocking":"optional";const label=issue.blocking?"查看必须修改的问题":"查看可选表达建议";out+=`<button type="button" class="lexi-apply-v3-inline-issue ${tone}" data-apply-stage-v3="focus-issue" data-issue-index="${range.index}" aria-label="${label}：${piece}">${piece}</button>`;}
      else out+=`<span class="lexi-apply-v3-inline-fixed">${piece}</span>`;
      cursor=range.end;
    }
    return out+esc(source.slice(cursor));
  }

  function normalizeCheckError(err){
    const code=norm(err?.code)||"APPLY_CHECK_FAILED";
    const title=norm(err?.title)||"AI 检查没有完成";
    const message=norm(err?.userMessage||err?.message)||"这次检查没有返回可用结果。你的句子已经保留，可以直接重试。";
    return {code,title,message};
  }

  async function requestApplyCheck(body){
    let response;
    try{
      response=await fetch("/api/ai/text",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    }catch(cause){
      const err=new Error("LexiFlow 没有连接到本地 AI 服务。请确认应用仍在运行，然后再试一次。");
      err.code="APPLY_CHECK_NETWORK";err.title="无法连接本地 AI";err.cause=cause;throw err;
    }
    let payload=null;
    try{payload=await response.json();}catch{}
    if(!response.ok||payload?.ok===false){
      const user=payload?.userError||{};
      const err=new Error(norm(user.message||payload?.error)||`AI 检查请求失败（HTTP ${response.status}）。`);
      err.code=norm(user.code||payload?.code)||`HTTP_${response.status}`;
      err.title=norm(user.title)||"AI 检查没有完成";
      err.userMessage=norm(user.message||payload?.error)||err.message;
      throw err;
    }
    if(!payload?.feedback){
      const err=new Error("AI 已响应，但没有返回可用于检查的反馈数据。请直接再检查一次。");
      err.code="APPLY_CHECK_INVALID_RESPONSE";err.title="AI 返回结果不完整";throw err;
    }
    return payload;
  }

  function feedbackHtml(card,s){
    if(s.submitting){
      const checkingCopy=s.lastFix?"AI 正在重新检查你的表达":"AI 正在检查你的表达";
      return `<div class="lexi-apply-v3-feedback"><div class="lexi-apply-v3-feedback-head"><div><small>正在检查</small><strong>${checkingCopy}</strong></div><span class="mini-spinner"></span></div><div style="color:var(--muted);font-size:13px">检查完成后，红色错误必须处理；黄色建议可以保留原句。</div></div>`;
    }
    if(s.checkError){
      const error=s.checkError;
      return `<div class="lexi-apply-v3-feedback error ai-feedback-panel warn">
        <div class="lexi-apply-v3-feedback-head"><div><small>检查未完成</small><strong>${esc(error.title)}</strong></div></div>
        <p class="lexi-apply-v3-error-message"><b>原因：</b>${esc(error.message)}</p>
        ${error.code?`<span class="lexi-apply-v3-error-code">错误代码：${esc(error.code)}</span>`:""}
        <div class="lexi-apply-v3-actions"><button class="btn primary" type="button" data-apply-stage-v3="retry">再检查一次</button><button class="text-action" type="button" data-apply-stage-v3="edit">继续修改</button></div>
      </div>`;
    }
    const fb=s.feedback;if(!fb)return"";
    const suggestion=norm(fb.suggestion);
    const tips=Array.isArray(fb.tips)?fb.tips.map(String).filter(Boolean):[];
    const changes=feedbackChanges(fb);
    const issues=feedbackIssues(fb);
    const blockers=blockingIssues(issues);
    const optional=optionalIssues(issues);
    const good=Boolean(s.approved&&blockers.length===0);
    const hasUnactionableBlocking=blockers.some(issue=>!issueReplacement(issue,changes));
    const showFallback=Boolean(suggestion&&!s.approved&&(!issues.length||hasUnactionableBlocking));
    const title=blockers.length
      ?`发现 ${blockers.length} 处必须修改`
      :optional.length
        ?`表达可以使用 · 有 ${optional.length} 条优化建议`
        :(good?"表达可以使用":String(fb.title||"这句话还需要调整"));
    const panelTone=blockers.length?"warn":(optional.length?"suggest":"good");
    return `<div class="lexi-apply-v3-feedback ${panelTone} ai-feedback-panel ${panelTone}">
      <div class="lexi-apply-v3-feedback-head"><div><small>${blockers.length?"需要修改":optional.length?"可选优化":"检查结果"}</small><strong>${esc(title)}</strong></div></div>
      ${issues.length?`<div class="lexi-apply-v3-issues">${issues.map((issue,index)=>{const replacement=issueReplacement(issue,changes);const tone=issue.blocking?"blocking":"optional";const label=issue.blocking?"必须修改":(issue.severity==="warning"?"书写提醒":"表达建议");const actionText=issue.blocking?"一键改为":(issue.severity==="warning"?"一键修正":"一键优化为");return `<div class="lexi-apply-v3-issue ${tone}" data-issue-card="${index}"><span class="lexi-apply-v3-severity">${label}</span>${issue.span?`<strong>${esc(issue.span)}</strong>`:""}${issue.reason?`<p><b>原因：</b>${esc(issue.reason)}</p>`:""}${issue.hint?`<small><b>${issue.blocking?"怎么改":"可选方案"}：</b>${esc(issue.hint)}</small>`:""}${hasSurfaceEdit(issue.span,replacement)?`<button class="btn lexi-apply-v3-issue-fix" type="button" data-apply-stage-v3="fix-issue" data-issue-index="${index}">${actionText} ${esc(replacement)}</button>`:""}</div>`;}).join("")}</div>`:""}
      ${showFallback?`<div class="lexi-apply-v3-complete-label">AI 无法安全拆成局部修改，给出完整修正版</div><div class="lexi-apply-v3-suggestion">${esc(suggestion)}</div>`:""}
      ${showFallback&&changes.length?`<div class="lexi-apply-v3-changes"><strong>修改原因</strong>${changes.map(change=>{const line=change.from&&change.to?`${change.from} → ${change.to}`:(change.to||change.from);return `<div class="lexi-apply-v3-change">${line?`<div class="lexi-apply-v3-change-line">${esc(line)}</div>`:""}${change.reason?`<p>${esc(change.reason)}</p>`:""}</div>`;}).join("")}</div>`:""}
      ${!issues.length&&tips.length?`<div class="lexi-apply-v3-tips">${tips.map(tip=>`<span>• ${esc(tip)}</span>`).join("")}</div>`:""}
      <div class="lexi-apply-v3-actions">
        ${showFallback?`<button class="btn" type="button" data-apply-stage-v3="adopt" ${s.suggestionApproved||s.promptLoading?"":"disabled"}>采用完整修正版</button>`:""}
        ${s.approved?`<button class="btn primary" type="button" data-action="pass-apply" ${s.promptLoading?"disabled title=\"正在保存新的练习话题\"":""}>${s.promptLoading?"正在保存当前阶段…":optional.length?"保留原句 · 明天首次复习":"确认这句话 · 明天首次复习"}</button>`:""}
        ${issues.length?`<button class="text-action" type="button" data-apply-stage-v3="edit">自己继续修改</button>`:""}
      </div>
    </div>`;
  }
  function html(card){
    const s=session(card);const text=String(s.text||"");
    const prompt=String(card.practicePrompt?.question||`想一个和你自己有关的场景，用“${card.word}”表达一句你真正会说的话。`);
    const chinese=/[\u3400-\u9fff]/.test(text);
    const missing=Boolean(text.trim()&&!chinese&&!usesTarget(text,card.word));
    const issues=feedbackIssues(s.feedback);
    const blockers=blockingIssues(issues);
    const optional=optionalIssues(issues);
    const reviewMode=Boolean(!s.editing&&(s.submitting||s.feedback||s.checkError||s.lastFix||s.approved));
    const reviewSentence=diagnosticSentenceHtml(text,issues,s.lastFix);
    const reviewLabel=s.submitting
      ?(s.lastFix?"已修改 · 正在自动复检":"正在检查")
      :(s.checkError?"检查未完成":blockers.length?"AI 已标出必须修改的位置":optional.length?"检查通过 · 有可选表达建议":s.approved?"检查通过":"检查完成");
    const reviewHint=s.submitting
      ?"请稍候…"
      :(s.checkError?"句子已保留，可以直接重新检查或继续修改。":blockers.length?"浅红色位置必须处理后才能继续。":optional.length?"浅黄色建议可选，不影响继续学习。":s.approved?"这句话已经通过检查。":"如需调整，可以继续修改。");
    const composer=reviewMode
      ?`<div class="lexi-apply-v3-composer lexi-apply-v3-review-composer apply-composer"><div><div class="lexi-apply-v3-review-label">${reviewLabel}</div><div class="lexi-apply-v3-review-sentence">${reviewSentence}</div></div><div class="lexi-apply-v3-composer-bottom"><span>${reviewHint}</span><button class="btn" type="button" data-apply-stage-v3="edit">继续修改</button></div></div>`
      :`<div class="lexi-apply-v3-composer apply-composer"><textarea class="textarea apply-composer-input" id="apply-text" spellcheck="false" data-lexiflow-render-lock="study-editor" data-lexiflow-render-route="study" data-lexiflow-render-card="${esc(card.id)}" data-lexiflow-render-stage="apply" placeholder="中文或英文都可以，先写你真正想表达的话…">${esc(text)}</textarea><div class="lexi-apply-v3-composer-bottom"><span>Enter 检查 · Shift + Enter 换行</span><button class="btn primary" type="button" data-action="submit-apply" data-apply-stage-v3="submit" ${s.submitting||!text.trim()?"disabled":""}>${s.submitting?"AI 正在检查…":"检查表达"}</button></div></div>`;
    return `<div class="apply-learning-stage lexi-apply-stage-v3" data-apply-stage-v3-root="${esc(card.id)}">
      <div class="lexi-apply-v3-head apply-word-hero"><div class="lexi-apply-v3-word"><strong class="target-word-text">${esc(card.word)}</strong><button type="button" class="speaker" data-apply-stage-v3="speak-word" aria-label="播放发音">🔊</button></div><div class="lexi-apply-v3-meta">${esc(phonetic(card.phonetic))}${card.pos?` · ${esc(card.pos)}`:""}</div><span class="lexi-apply-v3-meaning">${esc(card.meaningZh||"")}</span></div>
      <div class="lexi-apply-v3-prompt ai-practice-prompt"><div><small>先自己表达，再让 AI 检查</small><strong>${esc(prompt)}</strong></div><button class="text-action" type="button" data-apply-stage-v3="refresh-prompt" ${s.promptLoading||s.submitting?"disabled":""}>${s.promptLoading?"正在换一个…":"换一个话题"}</button></div>
      ${composer}
      <div id="apply-keyword-warning" class="lexi-apply-v3-warning apply-keyword-warning" ${missing?"":"hidden"}>还没有用到目标词 “${esc(card.word)}”。先自己尝试把它自然地放进句子里。</div>
      ${s.originalText?`<div class="lexi-apply-v3-undo"><button class="text-action" type="button" data-apply-stage-v3="restore">↶ 恢复我原来写的句子</button></div>`:""}
      ${feedbackHtml(card,s)}
    </div>`;
  }
  function activeEditor(card,s){
    const input=document.getElementById("apply-text");
    if(!input||document.activeElement!==input||!s?.editing||s.submitting||s.promptLoading)return null;
    const root=input.closest("[data-apply-stage-v3-root]");
    return String(root?.dataset?.applyStageV3Root||"")===String(card?.id||"")?input:null;
  }
  function render(){
    injectStyle();const host=document.querySelector(".study-card-focus"),card=currentCard();if(!host||!card)return;
    const s=session(card);
    // Keep the native textarea node mounted while it owns focus. app.js also
    // honors the render-lock marker, so background shell updates cannot replace
    // this editor from above.
    if(activeEditor(card,s))return;
    const signature=JSON.stringify({id:card.id,text:s.text,feedback:s.feedback,checkError:s.checkError,submitting:s.submitting,originalText:s.originalText,approved:s.approved,suggestionApproved:s.suggestionApproved,prompt:card.practicePrompt?.question||"",promptLoading:s.promptLoading,editing:s.editing,lastFix:s.lastFix});
    if(host.dataset.applyStageV3===signature)return;
    host.dataset.applyStageV3=signature;host.innerHTML=html(card);
    if(!s.submitting&&!s.promptLoading)requestAnimationFrame(()=>document.getElementById("apply-text")?.focus());
  }

  async function saveCardPatch(cardId,mutate){
    const latest=await loadData(true);const card=latest?.cards?.find(item=>String(item.id)===String(cardId));
    if(!card||core.canonicalStage(card)!=="apply")return null;
    mutate(card,latest);card.updatedAt=new Date().toISOString();await persist(latest);return data?.cards?.find(item=>String(item.id)===String(cardId))||card;
  }

  async function speak(card){
    const value=norm(card?.word);if(!value)return;
    try{
      const pronunciation=window.LexiFlowPronunciationV3;
      if(typeof pronunciation?.playWord==="function"){
        await pronunciation.playWord(value,{audioUrl:card.audioUrl||"",audioUrls:Array.isArray(card.audioUrls)?card.audioUrls:[]});
        return;
      }
    }catch{}
    try{if(typeof window.LexiFlowNaturalTts?.play==="function"&&await window.LexiFlowNaturalTts.play(value))return;}catch{}
    try{const utterance=new SpeechSynthesisUtterance(value);utterance.lang="en-US";speechSynthesis.cancel();speechSynthesis.speak(utterance);}catch{}
  }

  async function submit(){
    const card=currentCard();if(!card)return;const s=session(card);
    const text=norm(document.getElementById("apply-text")?.value??s.text);if(!text||s.submitting)return;
    if(copyNorm(text)&&copyNorm(text)===copyNorm(card.exampleEn||"")){
      s.text=text;s.approved=false;s.suggestionApproved=false;s.checkError=null;s.feedback={level:"warn",title:"不要直接照抄参考例句",tips:["换成一个与你自己有关的真实场景，再用这个词表达一次。"],suggestion:""};render();return;
    }
    s.text=text;s.submitting=true;s.feedback=null;s.checkError=null;s.approved=false;s.suggestionApproved=false;s.editing=false;render();
    try{
      const rawPayload=await requestApplyCheck({cardId:card.id,word:card.word,meaningZh:card.meaningZh,sentence:text});
      const payload=window.LexiFlowApplyQualityV3?.processFeedback?.(rawPayload,{cardId:card.id,word:card.word,meaningZh:card.meaningZh,sentence:text})||rawPayload;
      const fb=payload.feedback||{};const suggestion=norm(fb.suggestion);const inputLanguage=fb.inputLanguage==="zh"||/[\u3400-\u9fff]/.test(text)?"zh":"en";
      const keyword=norm(fb.keyword||card.word)||card.word;
      const originalKeywordOk=usesTarget(text,keyword)||usesTarget(text,card.word);
      const suggestionKeywordOk=Boolean(suggestion&&(usesTarget(suggestion,keyword)||usesTarget(suggestion,card.word)));
      const freshIssues=feedbackIssues(fb);
      const mergedBlocking=mergeBlockingIssues(text,freshIssues,s.pendingIssues);
      const freshOptional=optionalIssues(freshIssues);
      const displayIssues=mergeDisplayIssues(text,mergedBlocking,freshOptional);
      const originalApproved=Boolean(inputLanguage==="en"&&fb.approved!==false&&fb.level==="good"&&originalKeywordOk&&mergedBlocking.length===0);
      s.pendingIssues=mergedBlocking;
      s.approved=originalApproved;
      s.suggestionApproved=Boolean(suggestion&&suggestionKeywordOk);
      s.feedback={...fb,approved:originalApproved,inputLanguage,keyword,issues:displayIssues,level:originalApproved?"good":"warn",suggestion};s.checkError=null;
    }catch(err){
      console.error("Apply Stage V3 check failed",err);
      s.feedback=null;s.checkError=normalizeCheckError(err);s.approved=false;s.suggestionApproved=false;
    }finally{s.submitting=false;render();}
  }

  function editSentence(){
    const card=currentCard();if(!card)return;const s=session(card);
    s.editing=true;s.lastFix=null;s.checkError=null;render();
    requestAnimationFrame(()=>document.getElementById("apply-text")?.focus());
  }

  function focusIssue(index){
    const card=document.querySelector(`[data-issue-card="${index}"]`);if(!card)return;
    document.querySelectorAll("[data-issue-card].active").forEach(item=>item.classList.remove("active"));
    card.classList.add("active");
    card.scrollIntoView({behavior:"smooth",block:"nearest"});
    setTimeout(()=>card.classList.remove("active"),1200);
  }

  function applyIssueFix(index){
    const card=currentCard();if(!card)return;const s=session(card);
    const issues=feedbackIssues(s.feedback),changes=feedbackChanges(s.feedback),issue=issues[Number(index)];
    if(!issue)return;
    const replacement=issueReplacement(issue,changes),range=issueRange(s.text,issue.span);
    if(!replacement||!range||!hasSurfaceEdit(issue.span,replacement))return;
    if(s.text&&!s.originalText)s.originalText=s.text;

    // One AI check creates one correction transaction. Applying an AI-proposed
    // local fix consumes that issue from the same transaction; it must not
    // silently start a fresh generative review and move the goalposts.
    const next=s.text.slice(0,range.start)+replacement+s.text.slice(range.end);
    const unresolved=issues.filter((_,itemIndex)=>itemIndex!==Number(index));
    const surviving=survivingIssues(next,unresolved);
    const remainingBlocking=blockingIssues(surviving);
    const remainingOptional=optionalIssues(surviving);
    const keyword=norm(s.feedback?.keyword||card.word)||card.word;
    const keywordOk=usesTarget(next,keyword)||usesTarget(next,card.word);
    const english=!/[\u3400-\u9fff]/.test(next);
    const approved=Boolean(english&&keywordOk&&remainingBlocking.length===0);
    const remainingChanges=changes.filter(change=>issueRange(next,change.from));

    s.pendingIssues=remainingBlocking;
    s.text=next;
    s.approved=approved;
    s.suggestionApproved=Boolean(!approved&&s.suggestionApproved);
    s.checkError=null;
    s.editing=false;
    s.lastFix={start:range.start,end:range.start+replacement.length,from:issue.span,to:replacement,at:Date.now()};
    s.feedback={
      ...(s.feedback||{}),
      approved,
      level:approved?"good":"warn",
      issues:[...remainingBlocking,...remainingOptional],
      changes:remainingChanges,
      tips:[],
      suggestion:approved?"":norm(s.feedback?.suggestion),
    };
    render();
  }

  function adopt(){
    const card=currentCard();if(!card)return;const s=session(card);const suggestion=norm(s.feedback?.suggestion);if(!suggestion||!s.suggestionApproved)return;
    if(s.text&&!s.originalText)s.originalText=s.text;
    s.text=suggestion;s.approved=true;s.feedback={...s.feedback,title:"已采用通过检查的修改建议",suggestion:"",issues:[],changes:[],tips:[]};s.suggestionApproved=false;s.editing=false;s.lastFix=null;s.pendingIssues=[];render();
  }

  function restore(){
    const card=currentCard();if(!card)return;const s=session(card);if(!s.originalText)return;
    s.text=s.originalText;s.originalText="";s.feedback=null;s.approved=false;s.suggestionApproved=false;s.editing=true;s.lastFix=null;s.pendingIssues=[];render();
  }

  async function refreshPrompt(){
    const card=currentCard();if(!card)return;const s=session(card);if(s.promptLoading||s.submitting)return;
    const authority=window.LexiFlowAiAssistV3?.practicePrompt;
    if(typeof authority!=="function"){console.error("Apply V3 prompt authority unavailable");return;}
    const guard=beginApplyWrite(card.id);if(!guard)return;
    s.promptLoading=true;render();
    try{
      const previous=String(card.practicePrompt?.question||"");
      const payload=await authority({word:card.word,meaningZh:card.meaningZh,exampleEn:card.exampleEn,previousQuestion:previous});
      const question=norm(payload?.prompt?.question);if(question)await saveCardPatch(card.id,c=>{c.practicePrompt={question};});
    }catch(err){console.error("Apply Stage V3 prompt refresh failed",err);}
    finally{s.promptLoading=false;guard.transition?.endStageWrite?.(guard.write);syncFromGateway();render();}
  }

  function handleComposerInput(input){
    if(input?.id!=="apply-text")return;const card=currentCard();if(!card)return;const s=session(card);
    s.text=String(input.value||"");s.feedback=null;s.checkError=null;s.approved=false;s.suggestionApproved=false;s.lastFix=null;s.editing=true;s.pendingIssues=[];
    const root=input.closest("[data-apply-stage-v3-root]");
    root?.querySelector?.(".lexi-apply-v3-feedback")?.remove();
    const warning=document.getElementById("apply-keyword-warning");const text=s.text;const missing=Boolean(text.trim()&&!/[\u3400-\u9fff]/.test(text)&&!usesTarget(text,card.word));if(warning)warning.hidden=!missing;
    const submitButton=root?.querySelector?.('[data-apply-stage-v3="submit"]')||document.querySelector('[data-apply-stage-v3="submit"]');if(submitButton)submitButton.disabled=!text.trim()||s.submitting;
  }

  document.addEventListener("input",event=>{
    if(event.target?.id!=="apply-text")return;handleComposerInput(event.target);
  },true);

  document.addEventListener("keydown",event=>{
    if(event.target?.id!=="apply-text"||event.key!=="Enter"||event.shiftKey||event.isComposing)return;
    event.preventDefault();void submit();
  },true);

  document.addEventListener("click",event=>{
    const button=event.target?.closest?.("[data-apply-stage-v3]");if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();const action=button.dataset.applyStageV3;
    const card=currentCard();
    if(action==="speak-word"&&card)void speak(card);
    if(action==="submit"||action==="retry")void submit();
    if(action==="adopt")adopt();
    if(action==="fix-issue")applyIssueFix(button.dataset.issueIndex);
    if(action==="focus-issue")focusIssue(button.dataset.issueIndex);
    if(action==="edit")editSentence();
    if(action==="restore")restore();
    if(action==="refresh-prompt")void refreshPrompt();
  },true);

  function schedule(){
    if(queued)return;
    const card=currentCard();
    if(card&&activeEditor(card,session(card)))return;
    queued=true;requestAnimationFrame(()=>{queued=false;syncFromGateway();render();});
  }
  function start(){
    const app=document.getElementById("app");if(!app)return;
    injectStyle();syncFromGateway();if(data)render();else void refresh(true).then(render);
    new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
    window.addEventListener("lexiflow:today-plan-data",schedule);
  }
  window.LexiFlowApplyStageV3=Object.freeze({
    isBusy(){const card=currentCard();return Boolean(card&&session(card).promptLoading);},
    currentState,
  });
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
