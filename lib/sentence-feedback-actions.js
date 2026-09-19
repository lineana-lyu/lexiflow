"use strict";

function applyTextEdit(sentence, start, end, replacement) {
  const source = String(sentence || "");
  const from = Number(start);
  const to = Number(end);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > source.length) return null;
  return source.slice(0, from) + String(replacement || "") + source.slice(to);
}

function actionWithinIssue(issue, start, end) {
  return Number.isInteger(issue?.start)
    && Number.isInteger(issue?.end)
    && Number.isInteger(start)
    && Number.isInteger(end)
    && start >= issue.start
    && end <= issue.end
    && end >= start;
}

function normalizeActionCandidate(sentence, issue, candidate) {
  if (!issue || !candidate) return null;
  const issueId = String(candidate.issueId || candidate.id || "").trim();
  if (!issueId || issueId !== String(issue.id || "")) return null;

  const start = Number(candidate.start);
  const end = Number(candidate.end);
  if (!actionWithinIssue(issue, start, end)) return null;

  const source = String(sentence || "");
  const before = source.slice(start, end);
  if (String(candidate.before ?? before) !== before) return null;

  const replacement = String(candidate.replacement ?? "");
  if (replacement === before) return null;

  const resultSentence = applyTextEdit(source, start, end, replacement);
  if (!resultSentence) return null;
  if (candidate.resultSentence && String(candidate.resultSentence) !== resultSentence) return null;

  return {
    issueId,
    start,
    end,
    before,
    replacement,
    resultSentence,
    source: "generated",
    verified: false,
  };
}

function deterministicActionForIssue(sentence, issue) {
  if (!issue) return null;
  const category = String(issue.category || "");
  const trusted = category === "pronoun_case"
    || (category === "spelling" && issue.blocking === true);
  if (!trusted || !String(issue.replacement || "")) return null;

  const candidate = {
    issueId: String(issue.id || ""),
    start: issue.start,
    end: issue.end,
    before: String(sentence || "").slice(issue.start, issue.end),
    replacement: String(issue.replacement || ""),
  };
  const normalized = normalizeActionCandidate(sentence, issue, candidate);
  return normalized ? { ...normalized, source: "deterministic", verified: true } : null;
}

function finalizeVerifiedActions(candidates, verdicts) {
  const verdictMap = new Map(
    (Array.isArray(verdicts) ? verdicts : [])
      .filter(item => item && item.valid === true)
      .map(item => [String(item.issueId || ""), item])
  );

  return (Array.isArray(candidates) ? candidates : [])
    .filter(Boolean)
    .map(candidate => {
      if (candidate.verified === true) return candidate;
      const verdict = verdictMap.get(String(candidate.issueId || ""));
      return verdict ? { ...candidate, verified: true, source: "verified-ai" } : null;
    })
    .filter(Boolean);
}

module.exports = {
  applyTextEdit,
  actionWithinIssue,
  normalizeActionCandidate,
  deterministicActionForIssue,
  finalizeVerifiedActions,
};
