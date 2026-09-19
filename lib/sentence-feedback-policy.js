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
]);

const SURFACE_CATEGORIES = new Set([
  "spelling",
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

function normalizeRequestedSeverity(value, blockingHint = null) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "error" || raw === "warning" || raw === "suggestion") return raw;
  if (raw === "improve") return "warning";
  if (raw === "polish") return "suggestion";
  if (blockingHint === true) return "error";
  if (blockingHint === false) return "warning";
  return "warning";
}

function applySeverityPolicy({ category, severity, blocking } = {}) {
  const normalizedCategory = normalizeCategory(category);
  const requested = normalizeRequestedSeverity(severity, blocking);

  let effective = requested;
  if (SURFACE_CATEGORIES.has(normalizedCategory) && requested === "error") {
    effective = "warning";
  } else if (STYLE_CATEGORIES.has(normalizedCategory)) {
    effective = "suggestion";
  } else if (!BLOCKING_ELIGIBLE.has(normalizedCategory) && normalizedCategory !== "unknown" && requested === "error") {
    effective = "warning";
  } else if (normalizedCategory === "unknown" && requested === "error") {
    // Unknown diagnostics are advisory. A model omission must never create a
    // learning gate.
    effective = "warning";
  }

  return {
    category: normalizedCategory,
    severity: effective,
    blocking: effective === "error" && BLOCKING_ELIGIBLE.has(normalizedCategory),
  };
}

function sortSeverity(value) {
  return value === "error" ? 0 : value === "warning" ? 1 : 2;
}

module.exports = {
  CATEGORIES,
  BLOCKING_ELIGIBLE,
  SURFACE_CATEGORIES,
  STYLE_CATEGORIES,
  normalizeCategory,
  normalizeRequestedSeverity,
  applySeverityPolicy,
  sortSeverity,
};
