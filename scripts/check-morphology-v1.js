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
  assert(summary.morphemeCount >= 10, "Expected at least 10 verified root stories");
  assert(summary.wordCount >= 31, "Expected at least 31 verified word mappings");

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

  const transform = morphology.lookup("transform");
  assert(transform?.parts?.some(part => part.morphemeId === "form"), "transform must attach FORM");
  assert(transform.literalZh.includes("改变形状"), "transform must explain the form-change bridge");

  const inspect = morphology.lookup("inspect");
  assert(inspect?.parts?.map(part => part.text).join("+") === "in-+spect", "inspect decomposition mismatch");
  assert(inspect.rootStories?.[0]?.id === "spect", "inspect must attach SPEC/SPECT");

  const interrupt = morphology.lookup("interrupt");
  assert(interrupt?.rootStories?.[0]?.id === "rupt", "interrupt must attach RUPT");
  assert(interrupt.literalZh === "从中间打断", "interrupt literal bridge mismatch");

  const construct = morphology.lookup("construct");
  assert(construct?.rootStories?.[0]?.id === "struct", "construct must attach STRUCT");
  assert(construct.sources.some(source => source.kind === "classical_dictionary"), "construct missing classical source");
  assert(construct.sources.some(source => source.kind === "english_etymology"), "construct missing English etymology source");

  assert(morphology.lookup("ride") === null, "Unknown words must not receive guessed morphology");

  const serverRuntime=fs.readFileSync(path.join(__dirname,"..","server-runtime.js"),"utf8");
  const server=fs.readFileSync(path.join(__dirname,"..","server.js"),"utf8");
  const app=fs.readFileSync(path.join(__dirname,"..","public","app.js"),"utf8");
  const memorize=fs.readFileSync(path.join(__dirname,"..","public","memorize-stage-v3.js"),"utf8");
  const review=fs.readFileSync(path.join(__dirname,"..","public","review-session-v3.js"),"utf8");
  const index=fs.readFileSync(path.join(__dirname,"..","public","index.html"),"utf8");
  assert(serverRuntime.includes('require("./lib/morphology")') && serverRuntime.includes("morphologyStore.lookup"), "Dictionary runtime must attach morphology");
  assert(server.includes("hydrateLearningMorphology") && server.includes("morphologyStore.lookup"), "Existing learning cards must be hydrated locally");
  assert(app.includes("morphology:r.morphology") && app.includes("LexiFlowMorphologyViewV1"), "App shell must persist and preview morphology");
  assert(memorize.includes("morphologyBlock(card)"), "Memorize stage must reveal morphology with the answer");
  assert(review.includes("morphologyBlock(card)"), "Review stage must reveal morphology only after recall");
  assert(index.includes("./morphology-view-v1.js"), "Morphology renderer must be loaded");

  const status = morphology.status();
  assert(status.available && status.words >= 31 && status.morphemes >= 10, "Morphology database status must be healthy");

  morphology.close();
  fs.rmSync(dir, { recursive:true, force:true });
  console.log("Morphology V1 checks passed.");
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
