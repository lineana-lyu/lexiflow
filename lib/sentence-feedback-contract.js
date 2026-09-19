"use strict";

const {
  applyDiagnosticPolicy,
  sortSeverity,
} = require("./sentence-feedback-policy");
const {
  verifySpellingCorrection,
  normalizeWord,
} = require("./sentence-feedback-evidence");

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

function isWordLikeSpan(value) {
  return /^[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*$/.test(String(value || ""));
}

function isWordChar(char) {
  return Boolean(char && /[A-Za-z0-9'’-]/.test(char));
}

function validatedExplicitRange(sentence, span, start, end) {
  const source = String(sentence || "");
  const target = String(span || "");
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > source.length) return null;
  const slice = source.slice(start, end);
  const matches = slice === target || slice.toLowerCase() === target.toLowerCase();
  if (!matches) return null;
  if (isWordLikeSpan(target) && (isWordChar(source[start - 1]) || isWordChar(source[end]))) return null;
  return { start, end };
}

function feedbackSpanRange(sentence, span, preferred = {}) {
  const source = String(sentence || "");
  const target = String(span || "").trim();
  if (!source || !target) return null;

  const explicit = validatedExplicitRange(source, target, preferred?.start, preferred?.end);
  if (explicit) return explicit;

  const lowerSource = source.toLowerCase();
  const lowerTarget = target.toLowerCase();
  const requireTokenBoundary = isWordLikeSpan(target);
  let cursor = 0;
  while (cursor <= source.length - target.length) {
    const index = lowerSource.indexOf(lowerTarget, cursor);
    if (index < 0) break;
    const end = index + target.length;
    if (!requireTokenBoundary || (!isWordChar(source[index - 1]) && !isWordChar(source[end]))) {
      return { start: index, end };
    }
    cursor = index + 1;
  }
  return null;
}

function feedbackRangesOverlap(a, b) {
  return Boolean(a && b && a.start < b.end && b.start < a.end);
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

  for (const match of source.matchAll(/\bi\b/g)) {
    pushIssue(match.index, match.index + 1, {
      span: "i",
      start: match.index,
      end: match.index + 1,
      reason: "英语第一人称单数代词 “I” 通常写作大写",
      hint: "把 “i” 改为 “I”",
      replacement: "I",
      category: "capitalization",
      severity: "warning",
      source: "mechanics",
    });
  }

  for (const match of source.matchAll(/\b([A-Za-z][A-Za-z'-]*)([,;:])([A-Za-z][A-Za-z'-]*)\b/g)) {
    const span = match[0];
    const mark = match[2];
    pushIssue(match.index, match.index + span.length, {
      span,
      start: match.index,
      end: match.index + span.length,
      reason: `英文${PUNCTUATION_NAMES[mark]}后通常留一个空格`,
      hint: `在${PUNCTUATION_NAMES[mark]}后加一个空格`,
      replacement: `${match[1]}${mark} ${match[3]}`,
      category: "spacing",
      severity: "warning",
      source: "mechanics",
    });
  }

  for (const match of source.matchAll(/\b([A-Za-z][A-Za-z'-]*)\s+([,;:.!?])(?=\s|$)/g)) {
    const span = match[0];
    const mark = match[2];
    pushIssue(match.index, match.index + span.length, {
      span,
      start: match.index,
      end: match.index + span.length,
      reason: `英文${PUNCTUATION_NAMES[mark]}前通常不留空格`,
      hint: `删除${PUNCTUATION_NAMES[mark]}前的空格`,
      replacement: `${match[1]}${mark}`,
      category: "spacing",
      severity: "warning",
      source: "mechanics",
    });
  }

  return issues;
}

function issueEvidence(item, targetWord, spellingVerifier = verifySpellingCorrection) {
  const category = String(item?.category || "").trim().toLowerCase();
  const span = String(item?.span || "").trim();
  const replacement = String(item?.replacement || "").trim();
  const target = normalizeWord(targetWord);

  if (category === "spelling") {
    const spelling = spellingVerifier({ span, replacement });
    const replacementWord = normalizeWord(replacement);
    return {
      spellingVerified: spelling.verified,
      spellingReason: spelling.reason,
      targetWordCorrection: Boolean(target && replacementWord === target),
    };
  }

  return {};
}

function normalizeDiagnostic(sentence, item, sourceKind, targetWord, spellingVerifier) {
  const span = String(item?.span || "").trim();
  const replacement = String(item?.replacement || "").trim();
  const range = feedbackSpanRange(sentence, span, { start: item?.start, end: item?.end });
  if (!range) return null;

  let category = String(item?.category || "").trim().toLowerCase();
  const evidence = issueEvidence(item, targetWord, spellingVerifier);

  // If a spelling correction resolves directly to the current learning word,
  // it belongs to target-word correctness rather than generic orthography.
  if (category === "spelling" && evidence.targetWordCorrection) category = "target_usage";

  const policy = applyDiagnosticPolicy({
    category,
    severity: item?.severity,
    evidence,
  });
  if (!policy.report) return null;

  return {
    span,
    start: range.start,
    end: range.end,
    reason: normalizeFeedbackCopy(item?.reason),
    hint: normalizeFeedbackCopy(item?.hint || (replacement ? `建议改为 “${replacement}”` : "")),
    replacement,
    category: policy.category,
    severity: policy.severity,
    blocking: policy.blocking,
    evidence: category === "spelling" ? evidence.spellingReason || "" : "",
    _range: range,
    _source: String(item?.source || sourceKind || "issue"),
  };
}

function sameRange(a, b) {
  return Boolean(
    a?._range && b?._range &&
    a._range.start === b._range.start &&
    a._range.end === b._range.end
  );
}

function sourceRank(value) {
  const source = String(value || "");
  if (source.startsWith("mechanics")) return 30;
  if (source.startsWith("issue")) return 20;
  return 0;
}

function choosePrimaryDiagnostic(current, candidate) {
  if (sameRange(current, candidate)) {
    if (current.blocking !== candidate.blocking) return current.blocking ? current : candidate;

    const severityDiff = sortSeverity(current.severity) - sortSeverity(candidate.severity);
    if (severityDiff) return severityDiff < 0 ? current : candidate;

    const currentActionable = Boolean(String(current.replacement || "").trim());
    const candidateActionable = Boolean(String(candidate.replacement || "").trim());
    if (currentActionable !== candidateActionable) return currentActionable ? current : candidate;

    const rankDiff = sourceRank(current._source) - sourceRank(candidate._source);
    if (rankDiff) return rankDiff > 0 ? current : candidate;
    return current;
  }

  if (current.blocking !== candidate.blocking) return current.blocking ? current : candidate;

  const severityDiff = sortSeverity(current.severity) - sortSeverity(candidate.severity);
  if (severityDiff) return severityDiff < 0 ? current : candidate;

  const currentLength = current._range.end - current._range.start;
  const candidateLength = candidate._range.end - candidate._range.start;
  return candidateLength < currentLength ? candidate : current;
}

function mergeDiagnostics(candidates) {
  const merged = [];
  const sorted = [...candidates].sort(
    (a, b) => a._range.start - b._range.start || (a._range.end - a._range.start) - (b._range.end - b._range.start)
  );

  for (const candidate of sorted) {
    const overlapIndex = merged.findIndex(item => feedbackRangesOverlap(item._range, candidate._range));
    if (overlapIndex < 0) {
      merged.push(candidate);
      continue;
    }
    const current = merged[overlapIndex];
    const primary = choosePrimaryDiagnostic(current, candidate);
    const secondary = primary === current ? candidate : current;
    merged[overlapIndex] = {
      ...primary,
      reason: normalizeFeedbackCopy(primary.reason || secondary.reason),
      hint: normalizeFeedbackCopy(primary.hint || secondary.hint),
      replacement: String(primary.replacement || secondary.replacement || "").trim(),
    };
  }

  return merged;
}

function normalizeSentenceDiagnostics({ sentence, issues = [], targetWord = "", spellingVerifier = verifySpellingCorrection } = {}) {
  const source = String(sentence || "");
  const candidates = (Array.isArray(issues) ? issues : [])
    .map(item => normalizeDiagnostic(source, item, "issue", targetWord, spellingVerifier))
    .filter(Boolean);

  const merged = mergeDiagnostics(candidates);
  merged.sort((a, b) =>
    sortSeverity(a.severity) - sortSeverity(b.severity) ||
    a._range.start - b._range.start
  );

  const blocking = merged.filter(item => item.blocking).slice(0, 3);
  if (blocking.length) {
    return blocking.map(({ _range, _source, ...item }) => item);
  }

  // Apply is a speaking/usage stage, not a proofreading stage. With no
  // correctness blocker, surface at most one optional language suggestion.
  return merged
    .filter(item => !item.blocking)
    .slice(0, 1)
    .map(({ _range, _source, ...item }) => item);
}

module.exports = {
  normalizeFeedbackCopy,
  joinReasonFragments,
  feedbackSpanRange,
  validatedExplicitRange,
  feedbackRangesOverlap,
  detectEnglishMechanics,
  choosePrimaryDiagnostic,
  normalizeSentenceDiagnostics,
};
