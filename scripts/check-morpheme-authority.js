"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_FILE = path.join(ROOT, "data", "morpheme-authority.json");

const FORBIDDEN_FIELDS = new Set([
  "story",
  "storyZh",
  "narrative",
  "narrativeZh",
  "wordBridge",
  "meaningBridgeZh",
  "relatedWords",
  "exampleWords",
  "semanticEvolution",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateAuthority(data) {
  assert(data && typeof data === "object", "Authority registry must be an object");
  assert(data.schema === "lexiflow-morpheme-authority-v1", "Unsupported authority schema");
  assert(data.scope === "morpheme-facts-only", "Authority registry scope must remain morpheme-facts-only");

  const sources = Array.isArray(data.sources) ? data.sources : [];
  const morphemes = Array.isArray(data.morphemes) ? data.morphemes : [];
  assert(sources.length > 0, "Authority registry has no sources");
  assert(morphemes.length > 0, "Authority registry has no morphemes");

  const sourceMap = new Map();
  for (const source of sources) {
    const id = clean(source.id);
    assert(id, "Source id is required");
    assert(!sourceMap.has(id), `Duplicate source id: ${id}`);
    assert(["historical_lexicon", "historical_grammar"].includes(clean(source.sourceType)), `Unsupported source type: ${id}`);
    assert(clean(source.work), `Source work is required: ${id}`);
    assert(clean(source.url).startsWith("https://"), `Source URL must be HTTPS: ${id}`);
    assert(clean(source.locator), `Source locator is required: ${id}`);
    assert(source.publicDomain === true, `Authority source must be redistributable/public-domain reference metadata: ${id}`);
    sourceMap.set(id, source);
  }

  const ids = new Set();
  for (const item of morphemes) {
    const id = clean(item.id);
    assert(id, "Morpheme id is required");
    assert(!ids.has(id), `Duplicate morpheme id: ${id}`);
    ids.add(id);

    for (const field of Object.keys(item)) {
      assert(!FORBIDDEN_FIELDS.has(field), `Authority layer must not own learner story field "${field}" on ${id}`);
    }

    assert(item.status === "verified", `Only verified morphemes may be published: ${id}`);
    assert(["root_or_combining_form", "root_family", "prefix"].includes(clean(item.kind)), `Unsupported morpheme kind: ${id}`);
    assert(clean(item.sourceLanguage), `Source language is required: ${id}`);
    assert(clean(item.sourceLemma), `Source lemma is required: ${id}`);
    assert(Array.isArray(item.teachingForms) && item.teachingForms.length > 0, `Teaching form is required: ${id}`);
    assert(Array.isArray(item.sourceForms) && item.sourceForms.length > 0, `Source forms are required: ${id}`);
    assert(Array.isArray(item.coreMeaningEn) && item.coreMeaningEn.length > 0, `English source meaning is required: ${id}`);
    assert(Array.isArray(item.coreMeaningZh) && item.coreMeaningZh.length > 0, `Chinese teaching gloss is required: ${id}`);
    assert(clean(item.formRelation), `Form relation is required: ${id}`);

    if (item.sourceLanguage === "Ancient Greek" && item.kind === "root_family") {
      const derivation = item.stemDerivation || {};
      assert(clean(item.sourceStem), `Ancient Greek root family requires sourceStem: ${id}`);
      assert(clean(derivation.sourceStem) === clean(item.sourceStem), `Greek sourceStem mismatch: ${id}`);
      assert(clean(derivation.method), `Greek stem derivation method is required: ${id}`);
      assert(Array.isArray(derivation.sources) && derivation.sources.length > 0, `Greek stem derivation evidence is required: ${id}`);
      for (const sourceId of derivation.sources) {
        assert(sourceMap.has(sourceId), `Unknown Greek stem derivation source "${sourceId}" for ${id}`);
      }
      const derivationSources = derivation.sources.map(sourceId => sourceMap.get(sourceId)).filter(Boolean);
      assert(
        derivationSources.some(source => ["historical_grammar","historical_lexicon"].includes(source.sourceType)),
        `Greek stem derivation must cite a lexicon or grammar source: ${id}`
      );
    }

    const claims = item.claimSources || {};
    for (const claim of ["lemma", "meaning", "forms"]) {
      assert(Array.isArray(claims[claim]) && claims[claim].length > 0, `Missing ${claim} evidence: ${id}`);
    }
    for (const claim of ["lemma", "meaning", "forms", "variants"]) {
      for (const sourceId of claims[claim] || []) {
        assert(sourceMap.has(sourceId), `Unknown source "${sourceId}" in ${claim} evidence for ${id}`);
      }
    }

    const variants = Array.isArray(item.variants) ? item.variants : [];
    if (variants.length) {
      assert(Array.isArray(claims.variants) && claims.variants.length > 0, `Variant claims require evidence: ${id}`);
      const variantSources = claims.variants.map(sourceId => sourceMap.get(sourceId)).filter(Boolean);
      assert(variantSources.some(source => source.sourceType === "historical_grammar"), `Variant claims require a grammar source: ${id}`);
      for (const variant of variants) {
        assert(clean(variant.form), `Variant form is required: ${id}`);
        assert(clean(variant.condition), `Variant condition is required: ${id}`);
      }
    }

    const evidenceIds = new Set([
      ...(claims.lemma || []),
      ...(claims.meaning || []),
      ...(claims.forms || []),
      ...(claims.variants || []),
    ]);
    assert(evidenceIds.size > 0, `No authority evidence attached: ${id}`);
  }

  return { sourceCount:sources.length, morphemeCount:morphemes.length };
}

if (require.main === module) {
  try {
    const file = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_FILE;
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const result = validateAuthority(data);
    console.log(`Morpheme authority checks passed: ${result.morphemeCount} morphemes, ${result.sourceCount} sources.`);
  } catch (err) {
    console.error(err.message || err);
    process.exitCode = 1;
  }
}

module.exports = { validateAuthority, DEFAULT_FILE };
