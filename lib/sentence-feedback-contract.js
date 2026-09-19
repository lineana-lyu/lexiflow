"use strict";

const {
  applySeverityPolicy,
  sortSeverity,
} = require("./sentence-feedback-policy");

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
      reason: "英语第一人称单数代词 “I” 通常写作大写",
      hint: "把 “i” 改为 “I”",
      replacement: "I",
      category: "capitalization",
      severity: "warning",
      blocking: false,
      source: "mechanics",
    });
  }

  for (const match of source.matchAll(/\b([A-Za-z][A-Za-z'-]*)([,;:])([A-Za-z][A-Za-z'-]*)\b/g)) {
    const span = match[0];
    const mark = match[2];
    pushIssue(match.index, match.index + span.length, {
      span,
      reason: `英文${PUNCTUATION_NAMES[mark]}后通常留一个空格`,
      hint: `在${PUNCTUATION_NAMES[mark]}后加一个空格`,
      replacement: `${match[1]}${mark} ${match[3]}`,
      category: "spacing",
      severity: "warning",
      blocking: false,
      source: "mechanics",
    });
  }

  for (const match of source.matchAll(/\b([A-Za-z][A-Za-z'-]*)\s+([,;:.!?])(?=\s|$)/g)) {
    const span = match[0];
    const mark = match[2];
    pushIssue(match.index, match.index + span.length, {
      span,
      reason: `英文${PUNCTUATION_NAMES[mark]}前通常不留空格`,
      hint: `删除${PUNCTUATION_NAMES[mark]}前的空格`,
      replacement: `${match[1]}${mark}`,
      category: "spacing",
      severity: "warning",
      blocking: false,
      source: "mechanics",
    });
  }

  return issues;
}

function normalizeDiagnostic(sentence, item, sourceKind) {
  const span = String(item?.span ?? item?.from ?? "").trim();
  const replacement = String(item?.replacement ?? item?.to ?? "").trim();
  const range = feedbackSpanRange(sentence, span);
  if (!range) return null;

  const policy = applySeverityPolicy({
    category: item?.category,
    severity: item?.severity,
    blocking: item?.blocking,
  });

  return {
    span,
    reason: normalizeFeedbackCopy(item?.reason),
    hint: normalizeFeedbackCopy(item?.hint || (replacement ? `建议改为 “${replacement}”` : "")),
    replacement,
    category: policy.category,
    severity: policy.severity,
    blocking: policy.blocking,
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
  if (source.startsWith("change")) return 10;
  return 0;
}

function choosePrimaryDiagnostic(current, candidate) {
  if (sameRange(current, candidate)) {
    const currentMechanics = String(current._source).startsWith("mechanics");
    const candidateMechanics = String(candidate._source).startsWith("mechanics");

    // A deterministic surface diagnostic owns its exact rule. This prevents
    // an AI-provided capitalization/punctuation record from escalating it.
    if (currentMechanics !== candidateMechanics) {
      const mechanics = currentMechanics ? current : candidate;
      const other = currentMechanics ? candidate : current;
      if (mechanics.replacement === other.replacement) return mechanics;
    }

    // The change record reflects the final full-sentence suggestion. If the
    // same span has conflicting replacements, it is the single edit authority.
    if (current.replacement && candidate.replacement && current.replacement !== candidate.replacement) {
      if (String(current._source).startsWith("change")) return current;
      if (String(candidate._source).startsWith("change")) return candidate;
    }

    if (current.blocking !== candidate.blocking) return current.blocking ? current : candidate;

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

function normalizeSentenceDiagnostics({ sentence, issues = [], changes = [] } = {}) {
  const source = String(sentence || "");
  const issueCandidates = (Array.isArray(issues) ? issues : [])
    .map(item => normalizeDiagnostic(source, item, "issue"))
    .filter(Boolean);
  const changeCandidates = (Array.isArray(changes) ? changes : [])
    .map(item => normalizeDiagnostic(source, item, "change"))
    .filter(Boolean);

  const merged = mergeDiagnostics([...issueCandidates, ...changeCandidates]);
  merged.sort((a, b) =>
    sortSeverity(a.severity) - sortSeverity(b.severity) ||
    a._range.start - b._range.start
  );

  return merged.slice(0, 3).map(({ _range, _source, ...item }) => item);
}

module.exports = {
  normalizeFeedbackCopy,
  joinReasonFragments,
  feedbackSpanRange,
  feedbackRangesOverlap,
  detectEnglishMechanics,
  choosePrimaryDiagnostic,
  normalizeSentenceDiagnostics,
};
