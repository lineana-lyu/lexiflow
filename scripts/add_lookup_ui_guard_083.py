from pathlib import Path
p=Path('public/app.js')
a=p.read_text(encoding='utf-8')

def once(old,new,label):
    global a
    if old not in a: raise SystemExit(f'missing anchor: {label}')
    a=a.replace(old,new,1)

once('''    const primarySense=senses.find(s=>s.id===state.selectedSenseId)||senses[0]||null;
    const resolvedNote =''','''    const primarySense=senses.find(s=>s.id===state.selectedSenseId)||senses[0]||null;
    const targetExampleMismatch=Boolean(primarySense?.exampleEn && !learningExampleUsesTarget(primarySense.exampleEn,r.word));
    const resolvedNote =''','render mismatch state')

once('''      ${r.translationNeedsReview?`<div class="feedback warn"><h4>建议检查中文释义</h4><ul><li>当前释义置信度较低，保存前建议快速确认或手动编辑。</li></ul></div>`:""}
      ${r.mode==="expanded"?expandedView:primaryView}''','''      ${r.translationNeedsReview?`<div class="feedback warn"><h4>建议检查中文释义</h4><ul><li>当前释义置信度较低，保存前建议快速确认或手动编辑。</li></ul></div>`:""}
      ${targetExampleMismatch?`<div class="feedback warn lookup-consistency-warning"><h4>结果需要重新确认</h4><ul><li>例句没有使用当前目标词“${escapeHtml(r.word)}”，为避免把不一致内容保存进单词库，当前不能保存。</li></ul></div>`:""}
      ${r.mode==="expanded"?expandedView:primaryView}''','render mismatch warning')

once('''        <button class="btn primary save-learning-card" data-action="save-card">保存并开始学习</button>''','''        <button class="btn primary save-learning-card" data-action="save-card" ${targetExampleMismatch?"disabled":""}>保存并开始学习</button>''','disable inconsistent save')

once('''  function sentenceUsesTargetWord(text,word){
    return targetWordForms(word).some(form=>textContainsKeyword(text,form));
  }''','''  function sentenceUsesTargetWord(text,word){
    return targetWordForms(word).some(form=>textContainsKeyword(text,form));
  }

  function learningExampleUsesTarget(text,word){
    const example=String(text||"").trim().toLowerCase().replace(/\\s+/g," ");
    const target=String(word||"").trim().toLowerCase().replace(/\\s+/g," ");
    if(!example||!target)return false;
    if(target.includes(" "))return example.includes(target);
    return sentenceUsesTargetWord(example,target);
  }''','target/example helper')

once('''      if(!draft.exampleEn||!draft.exampleZh){
        showNotice("例句还没有填写完整","请保留一组对应的中英文例句。","warn");
        return;
      }
      // Fixed lexical identity:''','''      if(!draft.exampleEn||!draft.exampleZh){
        showNotice("例句还没有填写完整","请保留一组对应的中英文例句。","warn");
        return;
      }
      if(!learningExampleUsesTarget(draft.exampleEn,card.word)){
        showNotice("例句没有使用当前词","英文例句需要实际包含当前学习词或常见词形，再保存修改。","warn");
        return;
      }
      // Fixed lexical identity:''','library editor example guard')

once('''      if(!s.meaningZh?.trim()||!s.exampleEn?.trim()||!s.exampleZh?.trim()){state.addDraft=JSON.parse(JSON.stringify(s));toast("保存前请补全中文释义和中英文例句");render();return;}
      const exists=''','''      if(!s.meaningZh?.trim()||!s.exampleEn?.trim()||!s.exampleZh?.trim()){state.addDraft=JSON.parse(JSON.stringify(s));toast("保存前请补全中文释义和中英文例句");render();return;}
      if(!learningExampleUsesTarget(s.exampleEn,r.word)){
        showNotice("这张卡片还不能保存",`例句没有使用当前目标词“${r.word}”。请重新识别结果，或修改例句后再保存。`,"warn");
        return;
      }
      const exists=''','save card example guard')

p.write_text(a,encoding='utf-8')
