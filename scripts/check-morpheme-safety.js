"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CANDIDATE_FILE = path.join(ROOT, "data", "morpheme-candidates.json");
const AUTHORITY_FILE = path.join(ROOT, "data", "morpheme-authority.json");
const TRANSMISSION_FILE = path.join(ROOT, "data", "morpheme-transmission.json");
const DECISION_FILE = path.join(ROOT, "data", "morpheme-candidate-decisions.json");
const COLLISION_FILE = path.join(ROOT, "data", "morpheme-collisions.json");

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

function buildCollisionIndex(collisions, candidates, authority, transmission) {
  assert(
    collisions?.schema === "lexiflow-morpheme-collisions-v1",
    "Unsupported morpheme collision schema"
  );
  assert(
    collisions?.policy?.candidateBindingPrecedence === true,
    "Collision registry must give candidate bindings precedence"
  );

  const candidateMap = new Map(
    [...(candidates.ecdictCandidates || []), ...(candidates.legacyCandidates || [])]
      .map(candidate => [candidate.id, candidate])
  );
  const authorityMap = new Map((authority.morphemes || []).map(item => [item.id, item]));
  const transmissionMap = new Map((transmission.mappings || []).map(item => [item.id, item]));
  const index = new Map();
  const collisionIds = new Set();
  const collisionForms = new Set();
  let bindingCount = 0;

  for (const collision of collisions.collisions || []) {
    const id = clean(collision.id);
    const form = normalizeForm(collision.form);
    const bindings = Array.isArray(collision.bindings) ? collision.bindings : [];

    assert(id, "Collision id is required");
    assert(!collisionIds.has(id), `Duplicate collision id: ${id}`);
    collisionIds.add(id);
    assert(form, `Collision form is required: ${id}`);
    assert(!collisionForms.has(form), `Duplicate collision surface form: ${form}`);
    collisionForms.add(form);
    assert(clean(collision.reason), `Collision reason is required: ${id}`);
    assert(bindings.length >= 2, `Collision must bind at least two candidate families: ${id}`);

    for (const binding of bindings) {
      const candidateId = clean(binding.candidateId);
      assert(candidateMap.has(candidateId), `Unknown candidateId in collision ${id}: ${candidateId}`);
      const candidateForms = new Set(splitCandidateForms(candidateMap.get(candidateId).root));
      assert(candidateForms.has(form), `Collision form ${form} is not part of candidate ${candidateId}`);

      const authorityIds = [...new Set((binding.authorityIds || []).map(clean).filter(Boolean))];
      const transmissionIds = [...new Set((binding.transmissionIds || []).map(clean).filter(Boolean))];
      assert(
        authorityIds.length + transmissionIds.length > 0,
        `Collision binding must target authority or transmission: ${candidateId}::${form}`
      );

      for (const authorityId of authorityIds) {
        const item = authorityMap.get(authorityId);
        assert(item, `Unknown authorityId ${authorityId} in collision ${id}`);
        const forms = new Set((item.teachingForms || []).map(normalizeForm));
        assert(forms.has(form), `Authority ${authorityId} does not publish collision form ${form}`);
      }
      for (const transmissionId of transmissionIds) {
        const item = transmissionMap.get(transmissionId);
        assert(item, `Unknown transmissionId ${transmissionId} in collision ${id}`);
        assert(
          normalizeForm(item.englishTeachingForm) === form,
          `Transmission ${transmissionId} does not publish collision form ${form}`
        );
      }

      const key = `${candidateId}::${form}`;
      assert(!index.has(key), `Duplicate collision binding: ${key}`);
      index.set(key, { collisionId: id, form, authorityIds, transmissionIds });
      bindingCount += 1;
    }
  }

  return {
    index,
    collisionCount: (collisions.collisions || []).length,
    bindingCount,
  };
}

function assessCandidate(candidate, index, decisionIndex, collisionIndex) {
  const forms = splitCandidateForms(candidate.root);
  const authorityMatches = [];
  const transmissionMatches = [];
  const unresolvedForms = [];
  const actionableUnresolvedForms = [];
  const closedForms = [];
  const deferredForms = [];
  const ambiguousAuthorityForms = [];
  const collisionResolvedForms = [];

  for (const form of forms) {
    const decision = decisionIndex.get(`${candidate.id}::${form}`);

    // Candidate-specific review decisions take precedence over surface-form
    // matching. This is required for indexed homographs such as cap1/cap2:
    // CAP < capio ("take") must not satisfy CAP2 < caput ("head").
    if (decision?.disposition === "closed_not_publish") {
      unresolvedForms.push(form);
      closedForms.push({ form, decisionId: decision.id, reason: decision.reason });
      continue;
    }
    if (decision?.disposition === "deferred_needs_evidence") {
      unresolvedForms.push(form);
      deferredForms.push({ form, decisionId: decision.id, reason: decision.reason });
      continue;
    }

    const rawAuthorityIds = index.authorityByForm.get(form) || [];
    const rawTransmissionIds = index.transmissionByForm.get(form) || [];
    const collisionBinding = collisionIndex.get(`${candidate.id}::${form}`);

    const authorityIds = collisionBinding
      ? rawAuthorityIds.filter(id => collisionBinding.authorityIds.includes(id))
      : rawAuthorityIds;
    const transmissionIds = collisionBinding
      ? rawTransmissionIds.filter(id => collisionBinding.transmissionIds.includes(id))
      : rawTransmissionIds;

    if (collisionBinding) {
      collisionResolvedForms.push({
        form,
        collisionId: collisionBinding.collisionId,
        authorityIds,
        transmissionIds,
      });
    }

    if (authorityIds.length) {
      authorityMatches.push({ form, ids: authorityIds });
      if (authorityIds.length > 1) ambiguousAuthorityForms.push(form);
    }
    if (transmissionIds.length) {
      transmissionMatches.push({ form, ids: transmissionIds });
    }

    if (!authorityIds.length && !transmissionIds.length) {
      unresolvedForms.push(form);
      actionableUnresolvedForms.push(form);
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

  const exampleCount = Number(candidate.exampleCount || 0);

  const riskFlags = [];
  if (forms.length > 1) riskFlags.push("multi_form_family");
  if (forms.length >= 4) riskFlags.push("broad_variant_family");
  if (/\d/.test(clean(candidate.root))) riskFlags.push("indexed_homograph");
  if (/\band\b|\//i.test(clean(candidate.originHint))) riskFlags.push("mixed_origin_hint");
  if (ambiguousAuthorityForms.length) riskFlags.push("authority_form_ambiguous");
  if (collisionResolvedForms.length) riskFlags.push("collision_binding_applied");
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
    forms,
    coverageState,
    workflowState,
    authorityMatches,
    transmissionMatches,
    unresolvedForms,
    actionableUnresolvedForms,
    closedForms,
    deferredForms,
    collisionResolvedForms,
    riskFlags,
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

function checkMorphemeSafety(candidates, authority, transmission, decisions, collisions) {
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
  const collisionRegistry = buildCollisionIndex(collisions, candidates, authority, transmission);
  const collisionIndex = collisionRegistry.index;
  const legacyRows = (candidates.legacyCandidates || []).map(candidate =>
    assessCandidate(candidate, index, decisionIndex, collisionIndex)
  );
  const ecdictRows = (candidates.ecdictCandidates || []).map(candidate =>
    assessCandidate(candidate, index, decisionIndex, collisionIndex)
  );

  // Regression: indexed homographs must honor candidate-specific review
  // decisions before any surface-form match. CAP2 is the CAPUT/head family,
  // not CAP < capio "take".
  const cap2Row = ecdictRows.find(row => row.id === "ecdict:cap2, capit, cipit");
  assert(cap2Row, "CAP2 coverage regression row is required");
  assert(
    cap2Row.closedForms.some(item => item.form === "CAP" && item.decisionId === "decision-cap2-head"),
    "CAP2 must be closed by the caput-specific decision instead of matching CAP < capio"
  );
  assert(
    !cap2Row.authorityMatches.some(item => item.form === "CAP"),
    "CAP2 must not surface-match the CAP < capio authority family"
  );

  // Regression: the same normalized CID surface belongs to two distinct Latin
  // families. Candidate-specific collision bindings must keep the cut/kill
  // candidate on caedo and the fall candidate on cado.
  const cidCutRow = ecdictRows.find(row => row.id === "ecdict:cis, cid1, -cide");
  const cidFallRow = ecdictRows.find(row => row.id === "ecdict:cad, cas, cid2");
  const legacyCidRow = legacyRows.find(row => row.id === "legacy:cid");
  assert(cidCutRow && cidFallRow && legacyCidRow, "CID collision regression rows are required");

  const cutCidMatch = cidCutRow.authorityMatches.find(item => item.form === "CID");
  const fallCidMatch = cidFallRow.authorityMatches.find(item => item.form === "CID");
  const legacyCidMatch = legacyCidRow.authorityMatches.find(item => item.form === "CID");

  assert(
    cutCidMatch?.ids?.length === 1 && cutCidMatch.ids[0] === "lat-caed",
    "CID1 cut/kill candidate must resolve only to caedo authority"
  );
  assert(
    fallCidMatch?.ids?.length === 1 && fallCidMatch.ids[0] === "lat-cad",
    "CID2 fall candidate must resolve only to cado authority"
  );
  assert(
    legacyCidMatch?.ids?.length === 1 && legacyCidMatch.ids[0] === "lat-caed",
    "Legacy CID/CIS cut candidate must resolve only to caedo authority"
  );
  assert(
    cidCutRow.collisionResolvedForms.some(item => item.form === "CID" && item.collisionId === "collision-cid-caedo-cado"),
    "CID1 must be resolved through the collision registry"
  );
  assert(
    cidFallRow.collisionResolvedForms.some(item => item.form === "CID" && item.collisionId === "collision-cid-caedo-cado"),
    "CID2 must be resolved through the collision registry"
  );


  // Regression: SED is also a real homograph. The separative prefix
  // SE-/SED- "apart" must not satisfy the sedeo "sit" root candidate.
  const sedSitRow = ecdictRows.find(row => row.id === "ecdict:sed, sid, sess");
  const legacySedRow = legacyRows.find(row => row.id === "legacy:sed");
  assert(sedSitRow && legacySedRow, "SED collision regression rows are required");

  const sedSitMatch = sedSitRow.authorityMatches.find(item => item.form === "SED");
  const legacySedMatch = legacySedRow.authorityMatches.find(item => item.form === "SED");
  assert(
    sedSitMatch?.ids?.length === 1 && sedSitMatch.ids[0] === "lat-sed-sit",
    "SED/SID/SESS candidate must resolve SED only to sedeo authority"
  );
  assert(
    legacySedMatch?.ids?.length === 1 && legacySedMatch.ids[0] === "lat-sed-sit",
    "Legacy SED candidate must resolve SED only to sedeo authority"
  );
  assert(
    !sedSitRow.authorityMatches.some(item => item.form === "SED" && item.ids.includes("lat-se")),
    "SED sit candidate must not be satisfied by separative SE-/SED- authority"
  );
  assert(
    sedSitRow.collisionResolvedForms.some(item => item.form === "SED" && item.collisionId === "collision-sed-separative-sit"),
    "SED sit candidate must be resolved through the collision registry"
  );

  // Regression: MOB remains intentionally unpublished rather than being
  // promoted merely to complete the MOV/MOT/MOB discovery row.
  const mobRow = ecdictRows.find(row => row.id === "ecdict:mob, mot, mov");
  assert(mobRow, "MOV/MOT/MOB regression row is required");
  assert(
    mobRow.closedForms.some(item => item.form === "MOB" && item.decisionId === "decision-mob-move"),
    "MOB must remain closed as an unsupported pedagogical truncation"
  );
  assert(
    !mobRow.authorityMatches.some(item => item.form === "MOB"),
    "MOB must not be published through raw surface matching"
  );


  // Regression: discovery origin hints are not authority. ECDICT labels MIS-
  // as Latin, but the published authority is Old English/Germanic. The
  // misclassified candidate must be explicitly closed before surface matching.
  const misPrefixRow = ecdictRows.find(row => row.id === "ecdict:mis-");
  assert(misPrefixRow, "MIS- origin regression row is required");
  assert(
    misPrefixRow.closedForms.some(item => item.form === "MIS" && item.decisionId === "decision-mis-prefix-origin"),
    "Misclassified Latin MIS- candidate must be closed by candidate-specific provenance review"
  );
  assert(
    !misPrefixRow.authorityMatches.some(item => item.form === "MIS"),
    "Wrong-origin MIS- discovery candidate must not count Old English MIS- as Latin coverage"
  );

  const acRow = ecdictRows.find(row => row.id === "ecdict:ac-");
  assert(acRow?.coverageState === "covered", "AC- must be covered by grammar-backed Latin AD- assimilation");
  assert(
    acRow.authorityMatches.some(item => item.form === "AC" && item.ids.includes("lat-ad")),
    "AC- must resolve to the Latin AD- authority family"
  );

  const manusRow = ecdictRows.find(row => row.id === "ecdict:man, mani, manu, main");
  assert(manusRow?.coverageState === "covered", "MAN/MANI/MANU/MAIN candidate must be fully resolved");
  for (const form of ["MAN","MANI","MANU"]) {
    assert(
      manusRow.authorityMatches.some(item => item.form === form && item.ids.includes("lat-manus")),
      `${form} must resolve to Latin manus authority`
    );
  }
  assert(
    manusRow.transmissionMatches.some(item => item.form === "MAIN" && item.ids.includes("tx-main")),
    "MAIN must resolve through Romance/English transmission"
  );

  const gradeRow = ecdictRows.find(row => row.id === "ecdict:grad, -grade");
  assert(gradeRow?.coverageState === "covered", "GRAD/GRADE candidate must be fully resolved");
  assert(
    gradeRow.authorityMatches.some(item => item.form === "GRAD" && item.ids.includes("lat-grad")),
    "GRAD must remain source-language authority"
  );
  assert(
    gradeRow.transmissionMatches.some(item => item.form === "GRADE" && item.ids.includes("tx-grade")),
    "GRADE must resolve through French/English transmission"
  );

  const venRow = ecdictRows.find(row => row.id === "ecdict:veni, vent, ven, -vene");
  assert(venRow?.coverageState === "covered", "VENI/VENT/VEN/VENE candidate must be fully resolved");
  for (const form of ["VENI","VENT","VEN"]) {
    assert(
      venRow.authorityMatches.some(item => item.form === form && item.ids.includes("lat-ven")),
      `${form} must resolve to Latin venio authority`
    );
  }
  assert(
    venRow.transmissionMatches.some(item => item.form === "VENE" && item.ids.includes("tx-vene")),
    "VENE must resolve through Romance/English transmission"
  );

  return {
    generatedAt: "2026-09-22",
    authorityCount: (authority.morphemes || []).length,
    authoritySourceCount: (authority.sources || []).length,
    transmissionCount: (transmission.mappings || []).length,
    transmissionSourceCount: (transmission.sources || []).length,
    candidateDecisionCount: (decisions.decisions || []).length,
    collisionCount: collisionRegistry.collisionCount,
    collisionBindingCount: collisionRegistry.bindingCount,
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
    unresolvedDiscoveryCount: ecdictRows.filter(row => row.actionableUnresolvedForms.length > 0).length,
    unresolvedLegacyCount: legacyRows.filter(row => row.actionableUnresolvedForms.length > 0).length,
    decisionCounts: {
      closed_not_publish: (decisions.decisions || []).filter(d => d.disposition === "closed_not_publish").length,
      deferred_needs_evidence: (decisions.decisions || []).filter(d => d.disposition === "deferred_needs_evidence").length,
    },
    legacyRows,
  };
}

function formatSummary(result) {
  return [
    "Morpheme safety checks passed.",
    `Authority seed: ${result.authorityCount} verified morphemes / ${result.authoritySourceCount} sources; transmission seed: ${result.transmissionCount} mappings / ${result.transmissionSourceCount} sources.`,
    `Safety fixtures: ${result.candidateCounts.legacy} legacy families / ${result.candidateCounts.ecdict} discovery families.`,
    `Workflow decisions: closed ${result.decisionCounts.closed_not_publish}, deferred ${result.decisionCounts.deferred_needs_evidence}; collisions: ${result.collisionCount} surfaces / ${result.collisionBindingCount} bindings.`,
    `Unresolved discovery fixtures: ${result.unresolvedDiscoveryCount}; unresolved legacy fixtures: ${result.unresolvedLegacyCount}. These counts are informational safety coverage, not a product backlog or release target.`,
  ].join("\n");
}

if (require.main === module) {
  try {
    const candidates = JSON.parse(fs.readFileSync(CANDIDATE_FILE, "utf8"));
    const authority = JSON.parse(fs.readFileSync(AUTHORITY_FILE, "utf8"));
    const transmission = JSON.parse(fs.readFileSync(TRANSMISSION_FILE, "utf8"));
    const decisions = JSON.parse(fs.readFileSync(DECISION_FILE, "utf8"));
    const collisions = JSON.parse(fs.readFileSync(COLLISION_FILE, "utf8"));
    const result = checkMorphemeSafety(candidates, authority, transmission, decisions, collisions);
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
  checkMorphemeSafety,
  splitCandidateForms,
  normalizeForm,
  formatSummary,
  CANDIDATE_FILE,
  AUTHORITY_FILE,
  TRANSMISSION_FILE,
  DECISION_FILE,
  COLLISION_FILE,
};
