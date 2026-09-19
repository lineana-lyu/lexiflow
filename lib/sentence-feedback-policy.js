"use strict";

const CATEGORIES = Object.freeze([
  "target_usage",
  "grammar",
  "word_form",
  "meaning",
  "completeness",
  "collocation",
  "spelling",
  "capitalization",
  "punctuation",
  "spacing",
  "typography",
  "fluency",
  "style",
]);

const BLOCKING_ELIGIBLE = new Set([
  "target_usage",
  "grammar",
  "word_form",
  "meaning",
  "completeness",
  "collocation",
  "spelling",
]);

const SILENT_CATEGORIES = new Set([
  "capitalization",
  "punctuation",
  "spacing",
  "typography",
]);

const STYLE_CATEGORIES = new Set(["fluency", "style"]);

function normalizeCategory(value) {
  const raw = String(value || "").trim().toLowerCase();
  return CATEGORIES.includes(raw) ? raw : "unknown";
}

function normalizeRequestedSeverity(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "error" || raw === "warning" || raw === "suggestion") return raw;
  if (raw === "improve") return "warning";
  if (raw === "polish") return "suggestion";
  return "warning";
}

function applyDiagnosticPolicy({ category, severity, evidence } = {}) {
  const normalizedCategory = normalizeCategory(category);
  const requested = normalizeRequestedSeverity(severity);

  if (normalizedCategory === "unknown") {
    return { category: normalizedCategory, severity: "suggestion", blocking: false, report: false };
  }

  if (SILENT_CATEGORIES.has(normalizedCategory)) {
    return { category: normalizedCategory, severity: "suggestion", blocking: false, report: false };
  }

  if (STYLE_CATEGORIES.has(normalizedCategory)) {
    return { category: normalizedCategory, severity: "suggestion", blocking: false, report: true };
  }

  if (normalizedCategory === "spelling") {
    const verified = evidence?.spellingVerified === true;
    return {
      category: normalizedCategory,
      severity: verified ? "error" : "warning",
      blocking: verified,
      report: verified,
    };
  }

  const effective = requested === "error" ? "error" : requested;
  return {
    category: normalizedCategory,
    severity: effective,
    blocking: effective === "error" && BLOCKING_ELIGIBLE.has(normalizedCategory),
    report: true,
  };
}

function sortSeverity(value) {
  return value === "error" ? 0 : value === "warning" ? 1 : 2;
}

module.exports = {
  CATEGORIES,
  BLOCKING_ELIGIBLE,
  SILENT_CATEGORIES,
  STYLE_CATEGORIES,
  normalizeCategory,
  normalizeRequestedSeverity,
  applyDiagnosticPolicy,
  sortSeverity,
};
