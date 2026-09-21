"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CANDIDATE_FILE = path.join(ROOT, "data", "morpheme-candidates.json");
const AUTHORITY_FILE = path.join(ROOT, "data", "morpheme-authority.json");
const TRANSMISSION_FILE = path.join(ROOT, "data", "morpheme-transmission.json");

function clean(value) {
  return String(value ?? "").trim();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeForm(value) {
  return clean(value)
    .toUpperCase()
    .replace(/[0-9]+$/g, "")
    .replace(/[^A-Z]/g, "");
}

function splitCandidateForms(value) {
  const forms = clean(value)
    .split(/[,/;]+/)
    .map(part => part.replace(/\([^)]*\)/g, "").trim())
    .map(normalizeForm)
    .filter(Boolean);
  return [...new Set(forms)];
}

function buildPublishedIndex(authority, transmission) {
  const authorityByForm = new Map();
  for (const item of authority.morphemes || []) {
    for (const form of item.teachingForms || []) {
      const key = normalizeForm(form);
      if (!key) continue;
      if (!authorityByForm.has(key)) authorityByForm.set(key, []);
      authorityByForm.get(key).push(item.id);
    }
  }

  const transmissionByForm = new Map();
  for (const item of transmission.mappings || []) {
    const key = normalizeForm(item.englishTeachingForm);
    if (!key) continue;
    if (!transmissionByForm.has(key)) transmissionByForm.set(key, []);
    transmissionByForm.get(key).push(item.id);
  }

  return { authorityByForm, transmissionByForm };
}

function assessCandidate(candidate, index, legacySignalByForm = new Map()) {
  const forms = splitCandidateForms(candidate.root);
  const authorityMatches = [];
  const transmissionMatches = [];
  const unresolvedForms = [];
  const ambiguousAuthorityForms = [];

  for (const form of forms) {
    const authorityIds = index.authorityByForm.get(form) || [];
    const transmissionIds = index.transmissionByForm.get(form) || [];
    if (authorityIds.length) {
      authorityMatches.push({ form, ids: authorityIds });
      if (authorityIds.length > 1) ambiguousAuthorityForms.push(form);
    }
    if (transmissionIds.length) {
      transmissionMatches.push({ form, ids: transmissionIds });
    }
    if (!authorityIds.length && !transmissionIds.length) unresolvedForms.push(form);
  }

  const matchedCount = forms.length - unresolvedForms.length;
  const coverageState =
    forms.length > 0 && unresolvedForms.length === 0
      ? "covered"
      : matchedCount > 0
        ? "partial"
        : "missing";

  const legacySignal = forms.reduce(
    (max, form) => Math.max(max, Number(legacySignalByForm.get(form) || 0)),
    0
  );

  const exampleCount = Number(candidate.exampleCount || 0);
  const classBoost = candidate.class === "prefix" ? 10 : 0;
  const partialBoost = coverageState === "partial" ? 5 : 0;
  const legacyBoost = Math.min(25, legacySignal * 5);
  const priorityScore =
    Math.min(100, exampleCount) + classBoost + partialBoost + legacyBoost;

  const priorityBand =
    priorityScore >= 60 ? "P0" : priorityScore >= 30 ? "P1" : "P2";

  const riskFlags = [];
  if (forms.length > 1) riskFlags.push("multi_form_family");
  if (forms.length >= 4) riskFlags.push("broad_variant_family");
  if (/\d/.test(clean(candidate.root))) riskFlags.push("indexed_homograph");
  if (/\band\b|\//i.test(clean(candidate.originHint))) riskFlags.push("mixed_origin_hint");
  if (ambiguousAuthorityForms.length) riskFlags.push("authority_form_ambiguous");
  if (coverageState === "partial") riskFlags.push("authority_or_transmission_gap");

  return {
    id: candidate.id,
    root: candidate.root,
    class: candidate.class,
    originHint: candidate.originHint,
    candidateSource: candidate.sourceId,
    exampleCount,
    legacySignal,
    forms,
    coverageState,
    authorityMatches,
    transmissionMatches,
    unresolvedForms,
    riskFlags,
    priorityScore,
    priorityBand,
  };
}

function countStates(rows) {
  const out = { covered: 0, partial: 0, missing: 0 };
  for (const row of rows) out[row.coverageState] += 1;
  return out;
}

function auditCoverage(candidates, authority, transmission) {
  assert(candidates?.schema === "lexiflow-morpheme-candidates-v1", "Unsupported candidate schema");
  assert(candidates?.policy?.candidateOnly === true, "Candidate dataset must remain candidate-only");
  assert(candidates?.policy?.publishForbidden === true, "Candidate dataset must forbid direct publication");

  for (const item of [...(candidates.ecdictCandidates || []), ...(candidates.legacyCandidates || [])]) {
    assert(item.status === "candidate_only", `Candidate status must remain candidate_only: ${item.id}`);
  }

  const discoverySourceIds = new Set((candidates.sources || []).map(s => s.id));
  for (const source of authority.sources || []) {
    assert(!discoverySourceIds.has(source.id), `Discovery source leaked into authority evidence: ${source.id}`);
  }
  for (const source of transmission.sources || []) {
    assert(!discoverySourceIds.has(source.id), `Discovery source leaked into transmission evidence: ${source.id}`);
  }

  const ecdictSource = (candidates.sources || []).find(s => s.id === "ecdict-wordroot");
  assert(clean(ecdictSource?.snapshotDate), "ECDICT candidate snapshot date is required");
  assert(/^[0-9a-f]{40}$/i.test(clean(ecdictSource?.blobSha)), "ECDICT candidate blob SHA is required");
  assert(clean(ecdictSource?.snapshotUrl) && !clean(ecdictSource?.snapshotUrl).includes("undefined"), "ECDICT pinned snapshot URL is required");
  assert(clean(ecdictSource?.url), "ECDICT discovery source URL is required");

  const index = buildPublishedIndex(authority, transmission);
  const legacySignalByForm = new Map();
  for (const candidate of candidates.legacyCandidates || []) {
    for (const form of splitCandidateForms(candidate.root)) {
      legacySignalByForm.set(
        form,
        Math.max(Number(legacySignalByForm.get(form) || 0), Number(candidate.exampleCount || 0))
      );
    }
  }

  const legacyRows = (candidates.legacyCandidates || []).map(candidate =>
    assessCandidate(candidate, index, legacySignalByForm)
  );
  const ecdictRows = (candidates.ecdictCandidates || []).map(candidate =>
    assessCandidate(candidate, index, legacySignalByForm)
  );

  const topGaps = ecdictRows
    .filter(row => row.coverageState !== "covered")
    .sort((a, b) =>
      b.priorityScore - a.priorityScore ||
      b.exampleCount - a.exampleCount ||
      a.root.localeCompare(b.root)
    )
    .slice(0, 60);

  return {
    generatedAt: "2026-09-21",
    authorityCount: (authority.morphemes || []).length,
    transmissionCount: (transmission.mappings || []).length,
    candidateCounts: {
      legacy: legacyRows.length,
      ecdict: ecdictRows.length,
    },
    legacyCoverage: countStates(legacyRows),
    ecdictCoverage: countStates(ecdictRows),
    priorityGapCounts: {
      P0: ecdictRows.filter(r => r.coverageState !== "covered" && r.priorityBand === "P0").length,
      P1: ecdictRows.filter(r => r.coverageState !== "covered" && r.priorityBand === "P1").length,
      P2: ecdictRows.filter(r => r.coverageState !== "covered" && r.priorityBand === "P2").length,
    },
    legacyRows,
    topGaps,
  };
}

function formatSummary(result) {
  const lines = [
    "Morpheme coverage audit passed.",
    `Authority: ${result.authorityCount}; transmission: ${result.transmissionCount}.`,
    `Legacy candidates: ${result.candidateCounts.legacy} — covered ${result.legacyCoverage.covered}, partial ${result.legacyCoverage.partial}, missing ${result.legacyCoverage.missing}.`,
    `ECDICT discovery candidates: ${result.candidateCounts.ecdict} — covered ${result.ecdictCoverage.covered}, partial ${result.ecdictCoverage.partial}, missing ${result.ecdictCoverage.missing}.`,
    `Unresolved priority bands: P0 ${result.priorityGapCounts.P0}, P1 ${result.priorityGapCounts.P1}, P2 ${result.priorityGapCounts.P2}.`,
    "",
    "Top unresolved candidates (priority is coverage value, not factual confidence):",
  ];
  for (const row of result.topGaps.slice(0, 20)) {
    lines.push(
      `- ${row.priorityBand} ${row.root} [${row.originHint}; ${row.class}] examples=${row.exampleCount}, state=${row.coverageState}, unresolved=${row.unresolvedForms.join("/") || "-"}`
    );
  }
  return lines.join("\n");
}

if (require.main === module) {
  try {
    const candidates = JSON.parse(fs.readFileSync(CANDIDATE_FILE, "utf8"));
    const authority = JSON.parse(fs.readFileSync(AUTHORITY_FILE, "utf8"));
    const transmission = JSON.parse(fs.readFileSync(TRANSMISSION_FILE, "utf8"));
    const result = auditCoverage(candidates, authority, transmission);
    if (process.argv.includes("--json")) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatSummary(result));
    }
  } catch (err) {
    console.error(err.message || err);
    process.exitCode = 1;
  }
}

module.exports = {
  auditCoverage,
  splitCandidateForms,
  normalizeForm,
  formatSummary,
  CANDIDATE_FILE,
  AUTHORITY_FILE,
  TRANSMISSION_FILE,
};
