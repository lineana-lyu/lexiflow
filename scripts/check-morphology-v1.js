"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { prepareMorphologyDatabase, validateSeed, DEFAULT_SEED } = require("./prepare-morphology");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const seed = JSON.parse(fs.readFileSync(DEFAULT_SEED, "utf8"));
  const summary = validateSeed(seed);
  assert(summary.morphemeCount >= 6, "Expected verified root stories");
  assert(summary.wordCount >= 7, "Expected verified word mappings");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lexiflow-morphology-"));
  const dbPath = path.join(dir, "morphology.sqlite");
  await prepareMorphologyDatabase({ outputPath:dbPath, force:true });
  process.env.LEXIFLOW_MORPHOLOGY_DB = dbPath;

  const morphology = require("../lib/morphology");
  const retract = morphology.lookup("retract");
  assert(retract?.confidence === "verified", "retract must be verified");
  assert(retract.mode === "decomposition", "retract must use decomposition mode");
  assert(retract.parts.map(part => part.text).join("+") === "re-+tract", "retract decomposition mismatch");
  assert(retract.literalZh === "往回拉", "retract literal bridge mismatch");
  assert(retract.rootStories?.[0]?.id === "tract", "retract must attach TRACT story");
  assert(retract.sources.some(source => source.kind === "classical_dictionary"), "retract missing classical source");
  assert(retract.sources.some(source => source.kind === "english_etymology"), "retract missing English etymology source");

  const contradict = morphology.lookup("contradict");
  assert(contradict?.parts?.some(part => part.morphemeId === "dict"), "contradict must attach DICT");
  assert(/反着说/.test(contradict.literalZh), "contradict literal explanation mismatch");

  const induce = morphology.lookup("induce");
  assert(induce?.rootStories?.[0]?.display === "DUC / DUCT", "induce must attach DUC / DUCT");

  const benefit = morphology.lookup("benefit");
  assert(benefit?.mode === "association", "benefit must not pretend to be a direct modern decomposition");
  assert(benefit.rootStories?.[0]?.id === "bene", "benefit must attach BENE story");

  assert(morphology.lookup("ride") === null, "Unknown words must not receive guessed morphology");
  const status = morphology.status();
  assert(status.available && status.words >= 7, "Morphology database status must be healthy");

  morphology.close();
  fs.rmSync(dir, { recursive:true, force:true });
  console.log("Morphology V1 checks passed.");
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
