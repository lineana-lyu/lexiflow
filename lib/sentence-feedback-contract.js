"use strict";

function normalizeFeedbackCopy(value) {
  return String(value || "")
    .trim()
    .replace(/\s+([，。！？；：])/g, "$1")
    .replace(/([，。！？；：])\s+/g, "$1")
    .replace(/([。！？；])\s*[。；]+/g, "$1");
}

function reasonFragment(value) {
  return normalizeFeedbackCopy(value).replace(/[，。！？；：,.;!?]+$/g, "").trim();
}

function joinReasonFragments(values) {
  const items = (Array.isArray(values) ? values : [values])
    .map(reasonFragment)
    .filter(Boolean);
  return items.filter((value, index) => items.indexOf(value) === index).join("；");
}

function feedbackSpanRange(sentence, span) {
  const source = String(sentence || "");
  const target = String(span || "").trim();
  if (!source || !target) return null;
  let start = source.indexOf(target);
  if (start < 0) start = source.toLowerCase().indexOf(target.toLowerCase());
  return start < 0 ? null : { start, end: start + target.length };
}

function feedbackRangesOverlap(a, b) {
  return Boolean(a && b && a.start < b.end && b.start < a.end);
}

function feedbackSeverity(value, blocking, fallbackBlocking = true) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "error" || raw === "improve" || raw === "polish") return raw;
  if (blocking === false) return "improve";
  return fallbackBlocking ? "error" : "improve";
}

const PUNCTUATION_NAMES = {
  ",": "逗号",
  ";": "分号",
  ":": "冒号",
  ".": "句号",
  "!": "感叹号",
  "?": "问号",
};

function detectEnglishMechanics(sentence) {
  const source = String(sentence || "");
  const issues = [];
  const occupied = [];

  function pushIssue(start, end, issue) {
    if (occupied.some(range => start < range.end && end > range.start)) return;
    occupied.push({ start, end });
    issues.push(issue);
  }

  const missingAfter = /\b([A-Za-z][A-Za-z'-]*)([,;:])([A-Za-z][A-Za-z'-]*)\b/g;
  for (const match of source.matchAll(missingAfter)) {
    const span = match[0];
    const mark = match[2];
    const replacement = `${match[1]}${mark} ${match[3]}`;
    pushIssue(match.index, match.index + span.length, {
      span,
      reason: `英文${PUNCTUATION_NAMES[mark]}后通常需要空格，这里标点和后面的单词连在了一起`,
      hint: `在${PUNCTUATION_NAMES[mark]}后加一个空格`,
      replacement,
      severity: "error",
      blocking: true,
      source: "mechanics",
    });
  }

  const spaceBefore = /\b([A-Za-z][A-Za-z'-]*)\s+([,;:.!?])(?=\s|$)/g;
  for (const match of source.matchAll(spaceBefore)) {
    const span = match[0];
    const mark = match[2];
    const replacement = `${match[1]}${mark}`;
    pushIssue(match.index, match.index + span.length, {
      span,
      reason: `英文${PUNCTUATION_NAMES[mark]}前不应留空格`,
      hint: `删除${PUNCTUATION_NAMES[mark]}前的空格`,
      replacement,
      severity: "error",
      blocking: true,
      source: "mechanics",
    });
  }

  return issues;
}

function choosePrimaryDiagnostic(current, candidate) {
  if (current.blocking !== candidate.blocking) return current.blocking ? current : candidate;
  const currentActionable = Boolean(String(current.replacement || "").trim());
  const candidateActionable = Boolean(String(candidate.replacement || "").trim());
  if (currentActionable !== candidateActionable) return candidateActionable ? candidate : current;
  const currentLength = current._range.end - current._range.start;
  const candidateLength = candidate._range.end - candidate._range.start;
  return candidateLength > currentLength ? candidate : current;
}

function normalizeSentenceDiagnostics(sentence, issues, changes, approved, level) {
  const source = String(sentence || "");
  const normalizedIssues = (Array.isArray(issues) ? issues : []).map(item => {
    const range = feedbackSpanRange(source, item?.span);
    if (!range) return null;
    const severity = feedbackSeverity(item?.severity, item?.blocking, approved === false || level !== "good");
    return {
      span: String(item?.span || "").trim(),
      reason: normalizeFeedbackCopy(item?.reason),
      hint: normalizeFeedbackCopy(item?.hint),
      replacement: String(item?.replacement || "").trim(),
      severity,
      blocking: severity === "error",
      _range: range,
      _source: String(item?.source || "issue"),
    };
  }).filter(Boolean);

  const hasBlockingIssue = normalizedIssues.some(item => item.blocking);
  const changeCandidates = (Array.isArray(changes) ? changes : []).map(change => {
    const from = String(change?.from || "").trim();
    const to = String(change?.to || "").trim();
    const range = feedbackSpanRange(source, from);
    if (!range || !to || from.toLowerCase() === to.toLowerCase()) return null;
    const related = normalizedIssues.filter(item => feedbackRangesOverlap(range, item._range));
    const relatedBlocking = related.some(item => item.blocking);
    const explicitSeverity = String(change?.severity || "").trim().toLowerCase();
    const severity = ["error", "improve", "polish"].includes(explicitSeverity)
      ? explicitSeverity
      : related.length
        ? (relatedBlocking ? "error" : related[0].severity)
        : (hasBlockingIssue ? "improve" : feedbackSeverity("", change?.blocking, approved === false || level !== "good"));
    return {
      span: from,
      reason: normalizeFeedbackCopy(change?.reason),
      hint: to ? `建议改为 “${to}”` : "",
      replacement: to,
      severity,
      blocking: severity === "error",
      _range: range,
      _source: "change",
    };
  }).filter(Boolean);

  const candidates = [...normalizedIssues, ...changeCandidates]
    .sort((a, b) => a._range.start - b._range.start || (b._range.end - b._range.start) - (a._range.end - a._range.start));

  const merged = [];
  for (const candidate of candidates) {
    const existingIndex = merged.findIndex(item => feedbackRangesOverlap(item._range, candidate._range));
    if (existingIndex < 0) {
      merged.push(candidate);
      continue;
    }
    const current = merged[existingIndex];
    const primary = choosePrimaryDiagnostic(current, candidate);
    const secondary = primary === current ? candidate : current;
    const blocking = Boolean(current.blocking || candidate.blocking);
    merged[existingIndex] = {
      ...primary,
      reason: joinReasonFragments([primary.reason, secondary.reason]),
      hint: normalizeFeedbackCopy(primary.hint || secondary.hint),
      replacement: String(primary.replacement || secondary.replacement || "").trim(),
      severity: blocking ? "error" : (primary.severity === "polish" && secondary.severity === "polish" ? "polish" : "improve"),
      blocking,
    };
  }

  const blocking = merged.filter(item => item.blocking).slice(0, 2);
  const optional = merged.filter(item => !item.blocking).slice(0, 1);
  return [...blocking, ...optional].map(({ _range, _source, ...item }) => item);
}

module.exports = {
  normalizeFeedbackCopy,
  joinReasonFragments,
  feedbackSpanRange,
  feedbackRangesOverlap,
  feedbackSeverity,
  detectEnglishMechanics,
  normalizeSentenceDiagnostics,
};
