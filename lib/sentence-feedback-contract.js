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

function diagnosticTokens(value) {
  const source = String(value || "");
  const tokens = [];
  const pattern = /[A-Za-z]+(?:['’-][A-Za-z]+)*|\d+(?:\.\d+)?|[^\sA-Za-z\d]/g;
  for (const match of source.matchAll(pattern)) {
    tokens.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  }
  return tokens;
}

function atomicReplacementHunks(from, to) {
  const before = String(from || "");
  const after = String(to || "");
  const a = diagnosticTokens(before);
  const b = diagnosticTokens(after);
  if (!a.length || !b.length) return [];

  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i].text === b[j].text
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i].text === b[j].text) {
      ops.push({ type: "equal", a: i, b: j });
      i += 1; j += 1;
    } else if (i < a.length && (j >= b.length || dp[i + 1][j] >= dp[i][j + 1])) {
      ops.push({ type: "delete", a: i });
      i += 1;
    } else {
      ops.push({ type: "insert", b: j });
      j += 1;
    }
  }

  const groups = [];
  let current = [];
  const flush = () => {
    if (!current.length) return;
    const oldIndexes = current.filter(op => Number.isInteger(op.a)).map(op => op.a);
    const newIndexes = current.filter(op => Number.isInteger(op.b)).map(op => op.b);
    if (oldIndexes.length && newIndexes.length) {
      const oldStart = Math.min(...oldIndexes), oldEnd = Math.max(...oldIndexes);
      const newStart = Math.min(...newIndexes), newEnd = Math.max(...newIndexes);
      groups.push({
        span: before.slice(a[oldStart].start, a[oldEnd].end),
        replacement: after.slice(b[newStart].start, b[newEnd].end),
        start: a[oldStart].start,
        end: a[oldEnd].end,
      });
    }
    current = [];
  };
  for (const op of ops) {
    if (op.type === "equal") flush();
    else current.push(op);
  }
  flush();
  return groups;
}

function reasonPieces(value) {
  return normalizeFeedbackCopy(value)
    .split(/[；。！？]+/)
    .map(piece => piece.trim())
    .filter(Boolean);
}

function bestReasonPiece(reason, from, to) {
  const pieces = reasonPieces(reason);
  if (!pieces.length) return "";
  const fromText = String(from || "").toLowerCase();
  const toText = String(to || "").toLowerCase();
  const refs = [...new Set([
    fromText,
    toText,
    ...diagnosticTokens(fromText).map(token => token.text.toLowerCase()),
    ...diagnosticTokens(toText).map(token => token.text.toLowerCase()),
  ].filter(value => value.length > 1))];
  let best = "", bestScore = 0;
  for (const piece of pieces) {
    const lower = piece.toLowerCase();
    let score = 0;
    if (fromText && lower.includes(fromText)) score += 5;
    if (toText && lower.includes(toText)) score += 5;
    for (const ref of refs) if (lower.includes(ref)) score += 1;
    if (score > bestScore) { best = piece; bestScore = score; }
  }
  return bestScore ? best : "";
}

function isSentenceStart(sentence, index) {
  const before = String(sentence || "").slice(0, Math.max(0, index)).trimEnd();
  return !before || /[.!?][\"'”’)}\]]*$/.test(before);
}

function canonicalMechanicalReason(sentence, absoluteStart, from, to) {
  const before = String(from || "");
  const after = String(to || "");
  if (before === "i" && after === "I") {
    return {
      reason: "英语第一人称单数代词 “I” 无论位于句中何处都必须大写",
      hint: "把人称代词 “i” 改为 “I”",
    };
  }
  if (before && after && before !== after && before.toLowerCase() === after.toLowerCase()) {
    return isSentenceStart(sentence, absoluteStart)
      ? { reason: "这里位于句首，需要使用正确的首字母大小写", hint: `改为 “${after}”` }
      : { reason: "这里需要调整字母大小写；这不是由句首位置触发的修改", hint: `改为 “${after}”` };
  }
  return null;
}

function splitBlockingDiagnostic(sentence, item) {
  const source = String(sentence || "");
  const span = String(item?.span || "").trim();
  const replacement = String(item?.replacement || "").trim();
  const range = feedbackSpanRange(source, span);
  const severity = feedbackSeverity(item?.severity, item?.blocking, true);
  if (!range || severity !== "error" || !replacement) return [item];
  const hunks = atomicReplacementHunks(span, replacement);
  if (hunks.length < 2 || hunks.some(hunk => !hunk.span || !hunk.replacement)) return [item];

  return hunks.map(hunk => {
    const absoluteStart = range.start + hunk.start;
    const mechanical = canonicalMechanicalReason(source, absoluteStart, hunk.span, hunk.replacement);
    const reason = mechanical?.reason || bestReasonPiece(item?.reason, hunk.span, hunk.replacement)
      || `“${hunk.span}”需要改为“${hunk.replacement}”`;
    return {
      ...item,
      span: hunk.span,
      replacement: hunk.replacement,
      reason,
      hint: mechanical?.hint || `改为 “${hunk.replacement}”`,
      source: `${String(item?.source || "issue")}:atomic`,
    };
  });
}

function detectEnglishMechanics(sentence) {
  const source = String(sentence || "");
  const issues = [];
  const occupied = [];

  function pushIssue(start, end, issue) {
    if (occupied.some(range => start < range.end && end > range.start)) return;
    occupied.push({ start, end });
    issues.push(issue);
  }

  const standaloneLowerI = /\bi\b/g;
  for (const match of source.matchAll(standaloneLowerI)) {
    pushIssue(match.index, match.index + 1, {
      span: "i",
      reason: "英语第一人称单数代词 “I” 无论位于句中何处都必须大写",
      hint: "把人称代词 “i” 改为 “I”",
      replacement: "I",
      severity: "error",
      blocking: true,
      source: "mechanics",
    });
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
  const expandedIssues = (Array.isArray(issues) ? issues : []).flatMap(item => splitBlockingDiagnostic(source, item));
  const normalizedIssues = expandedIssues.map(item => {
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
  }).filter(Boolean).flatMap(candidate => splitBlockingDiagnostic(source, candidate).map(item => ({
    ...item,
    _range: feedbackSpanRange(source, item?.span),
    _source: String(item?._source || item?.source || "change"),
  })).filter(item => item._range));

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

  const blocking = merged.filter(item => item.blocking).slice(0, 3);
  const optionalSlots = Math.max(0, 3 - blocking.length);
  const optional = merged.filter(item => !item.blocking).slice(0, optionalSlots);
  return [...blocking, ...optional].map(({ _range, _source, ...item }) => item);
}

module.exports = {
  normalizeFeedbackCopy,
  joinReasonFragments,
  feedbackSpanRange,
  feedbackRangesOverlap,
  feedbackSeverity,
  detectEnglishMechanics,
  atomicReplacementHunks,
  splitBlockingDiagnostic,
  normalizeSentenceDiagnostics,
};
