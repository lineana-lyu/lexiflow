"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CANDIDATE_FILE = path.join(ROOT, "data", "morpheme-candidates.json");
const AUTHORITY_FILE = path.join(ROOT, "data", "morpheme-authority.json");
const TRANSMISSION_FILE = path.join(ROOT, "data", "morpheme-transmission.json");
const DECISION_FILE = path.join(ROOT, "data", "morpheme-candidate-decisions.json");

const ALLOWED_DISPOSITIONS = new Set([
  "closed_not_publish",
  "deferred_needs_evidence",
]);

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

function buildDecisionIndex(decisions, candidates, authority) {
  assert(
    decisions?.schema === "lexiflow-morpheme-candidate-decisions-v1",
    "Unsupported candidate decision schema"
  );

  const candidateMap = new Map(
    [...(candidates.ecdictCandidates || []), ...(candidates.legacyCandidates || [])]
      .map(candidate => [candidate.id, candidate])
  );
  const authorityIds = new Set((authority.morphemes || []).map(item => item.id));
  const authoritySourceIds = new Set((authority.sources || []).map(source => source.id));
  const index = new Map();
  const decisionIds = new Set();

  for (const decision of decisions.decisions || []) {
    const id = clean(decision.id);
    const candidateId = clean(decision.candidateId);
    const form = normalizeForm(decision.form);
    const disposition = clean(decision.disposition);

    assert(id, "Candidate decision id is required");
    assert(!decisionIds.has(id), `Duplicate candidate decision id: ${id}`);
    decisionIds.add(id);

    assert(candidateMap.has(candidateId), `Unknown candidateId in decision ${id}: ${candidateId}`);
    assert(ALLOWED_DISPOSITIONS.has(disposition), `Unsupported candidate disposition: ${id}`);
    assert(form, `Candidate decision form is required: ${id}`);
    assert(clean(decision.reason), `Candidate decision reason is required: ${id}`);

    const candidateForms = new Set(splitCandidateForms(candidateMap.get(candidateId).root));
    assert(candidateForms.has(form), `Decision form ${form} is not part of candidate ${candidateId}`);

    for (const authorityId of decision.relatedAuthorityIds || []) {
      assert(authorityIds.has(authorityId), `Unknown relatedAuthorityId ${authorityId} in ${id}`);
    }
    for (const sourceId of decision.sourceIds || []) {
      assert(authoritySourceIds.has(sourceId), `Unknown authority sourceId ${sourceId} in ${id}`);
    }

    const key = `${candidateId}::${form}`;
    assert(!index.has(key), `Duplicate decision for candidate form: ${key}`);
    index.set(key, decision);
  }

  return index;
}

function assessCandidate(candidate, index, decisionIndex, legacySignalByForm = new Map()) {
  const forms = splitCandidateForms(candidate.root);
  const authorityMatches = [];
  const transmissionMatches = [];
  const unresolvedForms = [];
  const actionableUnresolvedForms = [];
  const closedForms = [];
  const deferredForms = [];
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

    if (!authorityIds.length && !transmissionIds.length) {
      unresolvedForms.push(form);
      const decision = decisionIndex.get(`${candidate.id}::${form}`);
      if (decision?.disposition === "closed_not_publish") {
        closedForms.push({ form, decisionId: decision.id, reason: decision.reason });
      } else if (decision?.disposition === "deferred_needs_evidence") {
        deferredForms.push({ form, decisionId: decision.id, reason: decision.reason });
      } else {
        actionableUnresolvedForms.push(form);
      }
    }
  }

  const matchedCount = forms.length - unresolvedForms.length;
  const coverageState =
    forms.length > 0 && unresolvedForms.length === 0
      ? "covered"
      : matchedCount > 0
        ? "partial"
        : "missing";

  let workflowState = "complete";
  if (actionableUnresolvedForms.length > 0) {
    workflowState = "actionable";
  } else if (deferredForms.length > 0) {
    workflowState = "deferred_only";
  } else if (closedForms.length > 0) {
    workflowState = "closed_complete";
  }

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
  if (closedForms.length) riskFlags.push("candidate_forms_intentionally_unpublished");
  if (deferredForms.length) riskFlags.push("candidate_forms_deferred");

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
    workflowState,
    authorityMatches,
    transmissionMatches,
    unresolvedForms,
    actionableUnresolvedForms,
    closedForms,
    deferredForms,
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

function countWorkflowStates(rows) {
  const out = { complete: 0, closed_complete: 0, deferred_only: 0, actionable: 0 };
  for (const row of rows) out[row.workflowState] += 1;
  return out;
}

function auditCoverage(candidates, authority, transmission, decisions) {
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
  assert(
    clean(ecdictSource?.snapshotUrl) && !clean(ecdictSource?.snapshotUrl).includes("undefined"),
    "ECDICT pinned snapshot URL is required"
  );
  assert(clean(ecdictSource?.url), "ECDICT discovery source URL is required");

  const index = buildPublishedIndex(authority, transmission);
  const decisionIndex = buildDecisionIndex(decisions, candidates, authority);
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
    assessCandidate(candidate, index, decisionIndex, legacySignalByForm)
  );
  const ecdictRows = (candidates.ecdictCandidates || []).map(candidate =>
    assessCandidate(candidate, index, decisionIndex, legacySignalByForm)
  );

  const topGaps = ecdictRows
    .filter(row => row.actionableUnresolvedForms.length > 0)
    .sort((a, b) =>
      b.priorityScore - a.priorityScore ||
      b.exampleCount - a.exampleCount ||
      a.root.localeCompare(b.root)
    )
    .slice(0, 60);

  const actionableRows = ecdictRows.filter(row => row.actionableUnresolvedForms.length > 0);

  return {
    generatedAt: "2026-09-22",
    authorityCount: (authority.morphemes || []).length,
    authoritySourceCount: (authority.sources || []).length,
    transmissionCount: (transmission.mappings || []).length,
    transmissionSourceCount: (transmission.sources || []).length,
    candidateDecisionCount: (decisions.decisions || []).length,
    candidateCounts: {
      legacy: legacyRows.length,
      ecdict: ecdictRows.length,
    },
    rawCoverage: {
      legacy: countStates(legacyRows),
      ecdict: countStates(ecdictRows),
    },
    workflow: {
      legacy: countWorkflowStates(legacyRows),
      ecdict: countWorkflowStates(ecdictRows),
    },
    actionablePriorityCounts: {
      P0: actionableRows.filter(r => r.priorityBand === "P0").length,
      P1: actionableRows.filter(r => r.priorityBand === "P1").length,
      P2: actionableRows.filter(r => r.priorityBand === "P2").length,
    },
    decisionCounts: {
      closed_not_publish: (decisions.decisions || []).filter(d => d.disposition === "closed_not_publish").length,
      deferred_needs_evidence: (decisions.decisions || []).filter(d => d.disposition === "deferred_needs_evidence").length,
    },
    legacyRows,
    topGaps,
  };
}

function formatSummary(result) {
  const lines = [
    "Morpheme coverage audit passed.",
    `Authority: ${result.authorityCount} morphemes / ${result.authoritySourceCount} sources; transmission: ${result.transmissionCount} mappings / ${result.transmissionSourceCount} sources.`,
    `Legacy raw coverage: covered ${result.rawCoverage.legacy.covered}, partial ${result.rawCoverage.legacy.partial}, missing ${result.rawCoverage.legacy.missing}.`,
    `ECDICT raw coverage: covered ${result.rawCoverage.ecdict.covered}, partial ${result.rawCoverage.ecdict.partial}, missing ${result.rawCoverage.ecdict.missing}.`,
    `ECDICT workflow: complete ${result.workflow.ecdict.complete}, closed ${result.workflow.ecdict.closed_complete}, deferred ${result.workflow.ecdict.deferred_only}, actionable ${result.workflow.ecdict.actionable}.`,
    `Candidate decisions: closed ${result.decisionCounts.closed_not_publish}, deferred ${result.decisionCounts.deferred_needs_evidence}.`,
    `Actionable priority bands: P0 ${result.actionablePriorityCounts.P0}, P1 ${result.actionablePriorityCounts.P1}, P2 ${result.actionablePriorityCounts.P2}.`,
    "",
    "Top actionable candidates (priority is coverage value, not factual confidence):",
  ];
  for (const row of result.topGaps.slice(0, 20)) {
    lines.push(
      `- ${row.priorityBand} ${row.root} [${row.originHint}; ${row.class}] examples=${row.exampleCount}, raw=${row.coverageState}, actionable=${row.actionableUnresolvedForms.join("/") || "-"}, deferred=${row.deferredForms.map(x => x.form).join("/") || "-"}, closed=${row.closedForms.map(x => x.form).join("/") || "-"}`
    );
  }
  return lines.join("\n");
}

if (require.main === module) {
  try {
    const candidates = JSON.parse(fs.readFileSync(CANDIDATE_FILE, "utf8"));
    const authority = JSON.parse(fs.readFileSync(AUTHORITY_FILE, "utf8"));
    const transmission = JSON.parse(fs.readFileSync(TRANSMISSION_FILE, "utf8"));
    const decisions = JSON.parse(fs.readFileSync(DECISION_FILE, "utf8"));
    const result = auditCoverage(candidates, authority, transmission, decisions);
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
  DECISION_FILE,
};
