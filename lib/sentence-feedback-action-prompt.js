"use strict";

function compactIssues(issues) {
  return (Array.isArray(issues) ? issues : []).map(issue => ({
    id: String(issue?.id || ""),
    span: String(issue?.span || ""),
    start: Number(issue?.start),
    end: Number(issue?.end),
    category: String(issue?.category || ""),
    severity: String(issue?.severity || ""),
    reason: String(issue?.reason || ""),
  }));
}

function buildSentenceActionPrompt({ sentence, word, meaningZh, issues }) {
  return `你是英语学习应用的“修复动作规划器”。诊断已经完成；你不能新增、删除或改写诊断本身。你的唯一任务是为每条诊断设计一个最小、安全、可直接执行的文本编辑动作。

目标词：${String(word || "").trim()}
当前词义：${String(meaningZh || "").trim()}
用户原句：${String(sentence || "").trim()}
诊断：${JSON.stringify(compactIssues(issues))}

规则：
1. 每个 action 必须引用一个现有 issueId，不得创建新问题。
2. action.start/end 是真正要编辑的最小字符区间，可以比诊断 start/end 更窄，但必须完全位于该诊断区间内部。
3. before 必须严格等于原句 slice(start,end)；replacement 只替换这个区间，原句其他字符必须原样保留。
4. 优先保留原句里已经正确的介词、连词、冠词、助动词和其他结构词。不要因为拼写相近就顺便修改一个本来正确的结构词。
5. replacement 只修当前诊断。不要顺便做单复数、时态、语气、风格或自然度优化，除非它们就是当前诊断本身。
6. 先在内部把 replacement 应用到原句，再检查得到的 resultSentence 是否仍然语法成立、语义基本不变、目标词仍按当前词义使用。
7. 如果无法给出一个你能确认安全的局部修复，返回 null action，而不是猜一个一键修改。
8. 不要输出完整改写建议，不要解释过程。

只输出 JSON：
{"actions":[{"issueId":"issue-1","start":0,"end":1,"before":"x","replacement":"y","resultSentence":"应用后的完整句子"}]}`;
}

function buildSentenceActionValidationPrompt({ sentence, word, meaningZh, issues, actions }) {
  return `你是英语学习应用的“代码动作验证器”。你不负责重新诊断，也不负责提出新修改；只判断给定的一键修复是否安全。

目标词：${String(word || "").trim()}
当前词义：${String(meaningZh || "").trim()}
用户原句：${String(sentence || "").trim()}
诊断：${JSON.stringify(compactIssues(issues))}
候选动作：${JSON.stringify(Array.isArray(actions) ? actions : [])}

对每个候选动作逐条检查：
1. 它是否真正修复对应诊断，而不是修改了另一个问题。
2. 应用动作后的完整句子是否语法成立。
3. 动作是否误删、误改了原本正确的介词、连词、冠词、助动词或其他结构词。
4. 动作是否引入了新的同级或更严重错误。
5. 动作是否擅自加强、减弱或改变用户原意。
6. 目标词及其当前学习词义是否仍然保持。
只有以上全部满足才 valid=true。拿不准时必须 false。

只输出 JSON：
{"verdicts":[{"issueId":"issue-1","valid":true,"reason":"简短内部验证理由"}]}`;
}

module.exports = {
  buildSentenceActionPrompt,
  buildSentenceActionValidationPrompt,
};
