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
  assert(summary.morphemeCount >= 61, "Expected at least 61 verified root stories");
  assert(summary.wordCount >= 241, "Expected at least 241 verified word mappings");

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

  const transport = morphology.lookup("transport");
  assert(transport?.parts?.map(part => part.text).join("+") === "trans-+port", "transport decomposition mismatch");
  assert(transport.rootStories?.[0]?.id === "port", "transport must attach PORT");

  const prescribe = morphology.lookup("prescribe");
  assert(prescribe?.rootStories?.[0]?.id === "scrib", "prescribe must attach SCRIB/SCRIPT");

  const incredible = morphology.lookup("incredible");
  assert(incredible?.rootStories?.[0]?.id === "cred", "incredible must attach CRED");

  const visible = morphology.lookup("visible");
  assert(visible?.rootStories?.[0]?.id === "vid", "visible must attach VID/VIS");

  const audible = morphology.lookup("audible");
  assert(audible?.rootStories?.[0]?.id === "aud", "audible must attach AUD");

  const transmit = morphology.lookup("transmit");
  assert(transmit?.rootStories?.[0]?.id === "mit", "transmit must attach MIT/MISS");

  const receive = morphology.lookup("receive");
  assert(receive?.mode === "association", "receive must not be naively split by modern spelling");
  assert(receive?.rootStories?.[0]?.id === "cap", "receive must attach CAP/CEPT/CEIV");

  const perfect = morphology.lookup("perfect");
  assert(perfect?.rootStories?.[0]?.id === "fac", "perfect must attach FAC/FIC/FECT");

  const depend = morphology.lookup("depend");
  assert(depend?.literalZh.includes("悬挂"), "depend must preserve the hanging metaphor");
  assert(depend?.rootStories?.[0]?.id === "pend", "depend must attach PEND");

  const project = morphology.lookup("project");
  assert(project?.parts?.map(part => part.text).join("+") === "pro-+ject", "project decomposition mismatch");
  assert(project?.rootStories?.[0]?.id === "ject", "project must attach JECT");

  const promote = morphology.lookup("promote");
  assert(promote?.rootStories?.[0]?.id === "mov", "promote must attach MOV/MOT");

  const postpone = morphology.lookup("postpone");
  assert(postpone?.rootStories?.[0]?.id === "pon", "postpone must attach PON/POS");
  assert(postpone.literalZh === "放到后面", "postpone literal bridge mismatch");

  const prevent = morphology.lookup("prevent");
  assert(prevent?.rootStories?.[0]?.id === "ven", "prevent must attach VEN/VENT");

  const contain = morphology.lookup("contain");
  assert(contain?.rootStories?.[0]?.id === "ten", "contain must attach TEN/TAIN");

  const stable = morphology.lookup("stable");
  assert(stable?.rootStories?.[0]?.id === "sta", "stable must attach STA/STAT");

  const consequence = morphology.lookup("consequence");
  assert(consequence?.rootStories?.[0]?.id === "sequ", "consequence must attach SEQU/SEC");

  const consent = morphology.lookup("consent");
  assert(consent?.rootStories?.[0]?.id === "sens", "consent must attach SENS/SENT");

  const memory = morphology.lookup("memory");
  assert(memory?.rootStories?.[0]?.id === "mem", "memory must attach MEM");

  const invoke = morphology.lookup("invoke");
  assert(invoke?.rootStories?.[0]?.id === "voc", "invoke must attach VOC/VOK");

  const manual = morphology.lookup("manual");
  assert(manual?.rootStories?.[0]?.id === "manu", "manual must attach MANU");

  const biped = morphology.lookup("biped");
  assert(biped?.rootStories?.[0]?.id === "ped", "biped must attach PED");

  const translucent = morphology.lookup("translucent");
  assert(translucent?.rootStories?.[0]?.id === "luc", "translucent must attach LUC/LUM");

  const infinite = morphology.lookup("infinite");
  assert(infinite?.rootStories?.[0]?.id === "fin", "infinite must attach FIN");

  const progress = morphology.lookup("progress");
  assert(progress?.rootStories?.[0]?.id === "grad", "progress must attach GRAD/GRESS");

  const proceed = morphology.lookup("proceed");
  assert(proceed?.rootStories?.[0]?.id === "ced", "proceed must attach CED/CEED/CESS");

  const include = morphology.lookup("include");
  assert(include?.rootStories?.[0]?.id === "clud", "include must attach CLUD/CLUS");

  const obligation = morphology.lookup("obligation");
  assert(obligation?.rootStories?.[0]?.id === "lig", "obligation must attach LIG");

  const recur = morphology.lookup("recur");
  assert(recur?.rootStories?.[0]?.id === "curr", "recur must attach CURR/CURS");

  const genetic = morphology.lookup("genetic");
  assert(genetic?.rootStories?.[0]?.id === "gen", "genetic must attach GEN");
  assert(genetic.rootStories?.[0]?.language === "Greek / Latin", "GEN must expose mixed Greek/Latin provenance");

  const revive = morphology.lookup("revive");
  assert(revive?.rootStories?.[0]?.id === "viv", "revive must attach VIV/VIT");

  const inanimate = morphology.lookup("inanimate");
  assert(inanimate?.rootStories?.[0]?.id === "anim", "inanimate must attach ANIM");

  const state = morphology.lookup("state");
  assert(state?.rootStories?.[0]?.id === "sta", "state must reuse STA/STAT rather than duplicate a root");

  const provide = morphology.lookup("provide");
  assert(provide?.rootStories?.[0]?.id === "vid", "provide must reuse VID/VIS");

  const continueWord = morphology.lookup("continue");
  assert(continueWord?.mode === "association", "continue must avoid a misleading modern spelling split");
  assert(continueWord?.rootStories?.[0]?.id === "ten", "continue must reuse TEN/TAIN");

  const national = morphology.lookup("national");
  assert(national?.rootStories?.[0]?.id === "nat", "national must attach NAT/NASC");

  const community = morphology.lookup("community");
  assert(community?.rootStories?.[0]?.id === "commun", "community must attach COMMUN");

  const president = morphology.lookup("president");
  assert(president?.rootStories?.[0]?.id === "sed", "president must attach SED/SID/SESS");

  const offer = morphology.lookup("offer");
  assert(offer?.mode === "association", "offer must not fake a modern letter split");
  assert(offer?.rootStories?.[0]?.id === "fer", "offer must attach FER");

  const requireWord = morphology.lookup("require");
  assert(requireWord?.rootStories?.[0]?.id === "quaer", "require must attach QUAER/QUIR");

  const createWord = morphology.lookup("create");
  assert(createWord?.rootStories?.[0]?.id === "cre", "create must attach CRE");

  const point = morphology.lookup("point");
  assert(point?.mode === "association", "point must be presented as historical association");
  assert(point?.rootStories?.[0]?.id === "punct", "point must attach PUNCT/PUNG");

  const major = morphology.lookup("major");
  assert(major?.rootStories?.[0]?.id === "magn", "major must attach MAGN/MAJ");

  const force = morphology.lookup("force");
  assert(force?.mode === "association", "force must use historical association");
  assert(force?.rootStories?.[0]?.id === "fort", "force must attach FORT");

  const processWord = morphology.lookup("process");
  assert(processWord?.rootStories?.[0]?.id === "ced", "process must reuse CED/CEED/CESS");

  const effectWord = morphology.lookup("effect");
  assert(effectWord?.rootStories?.[0]?.id === "fac", "effect must reuse FAC/FIC/FECT");

  const government = morphology.lookup("government");
  assert(government?.rootStories?.[0]?.id === "gubern", "government must attach GUBERN");

  const publicWord = morphology.lookup("public");
  assert(publicWord?.rootStories?.[0]?.id === "publ", "public must attach PUBL/POPUL");

  const education = morphology.lookup("education");
  assert(education?.mode === "association", "education must avoid the folk 'lead out' split");
  assert(education?.rootStories?.[0]?.id === "educ", "education must attach EDUC");

  const humanWord = morphology.lookup("human");
  assert(humanWord?.rootStories?.[0]?.id === "human", "human must attach HUM/HOM");

  const localWord = morphology.lookup("local");
  assert(localWord?.rootStories?.[0]?.id === "loc", "local must attach LOC");

  const decision = morphology.lookup("decision");
  assert(decision?.rootStories?.[0]?.id === "cid", "decision must attach CID/CIS");

  const explain = morphology.lookup("explain");
  assert(explain?.mode === "association", "explain must avoid a fake modern prefix split");
  assert(explain?.rootStories?.[0]?.id === "plan", "explain must attach PLAN");

  const actionWord = morphology.lookup("action");
  assert(actionWord?.rootStories?.[0]?.id === "act", "action must attach ACT/AG");

  const director = morphology.lookup("director");
  assert(director?.rootStories?.[0]?.id === "reg", "director must attach REG/RECT");

  const probably = morphology.lookup("probably");
  assert(probably?.rootStories?.[0]?.id === "prob", "probably must attach PROB");

  const international = morphology.lookup("international");
  assert(international?.rootStories?.[0]?.id === "nat", "international must reuse NAT/NASC");

  const voice = morphology.lookup("voice");
  assert(voice?.rootStories?.[0]?.id === "voc", "voice must reuse VOC/VOK");

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
  assert(status.available && status.words >= 241 && status.morphemes >= 61, "Morphology database status must be healthy");

  morphology.close();
  fs.rmSync(dir, { recursive:true, force:true });
  console.log("Morphology V1 checks passed.");
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
