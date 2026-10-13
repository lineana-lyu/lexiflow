"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "public", "memorize-stage-v3.js"), "utf8");
const handlers = new Map();
const storage = new Map();
const host = { dataset: {}, innerHTML: "" };
const card = {
  id: "memorize-forget-card",
  stage: "memorize",
  word: "lubricant",
  meaningZh: "润滑油",
  exampleEn: "Use lubricant.",
  exampleZh: "使用润滑油。",
};
const data = { cards: [card], activities: [] };
const window = {
  LexiFlowLearningCore: { normalizeData: value => value, canonicalStage: value => value.stage },
  LexiFlowLearningDataGatewayV3: { current: () => data },
  LexiFlowStudyRenderer: { currentCardId: () => card.id },
  addEventListener() {},
};
const document = {
  readyState: "loading",
  addEventListener(name, handler) { handlers.set(name, handler); },
  getElementById(id) { return id === "app" ? {} : null; },
  createElement() { return {}; },
  head: { appendChild() {} },
  querySelector(selector) { return selector === ".study-card-focus" ? host : null; },
};
const localStorage = {
  getItem(key) { return storage.get(key) ?? null; },
  setItem(key, value) { storage.set(key, value); },
};
const sandbox = {
  window,
  document,
  localStorage,
  crypto: { randomUUID: () => "test-id" },
  fetch: async () => { throw new Error("Unexpected fetch"); },
  requestAnimationFrame() {},
  MutationObserver: class { observe() {} },
  location: { reload() {} },
  console,
};
vm.runInNewContext(source, sandbox, { filename: "memorize-stage-v3.js" });
handlers.get("DOMContentLoaded")();

function click(action, extra = {}) {
  const button = { dataset: { m2: action, ...extra } };
  handlers.get("click")({
    target: { closest: () => button },
    preventDefault() {},
    stopImmediatePropagation() {},
  });
}
function session() {
  return JSON.parse(storage.get("lexiflow-memorize-v2"))[card.id];
}

click("reveal");
click("rate", { ok: "1" });
assert.match(host.innerHTML, /data-m2="forget"/, "Chinese-to-English recall must offer Forget");
click("forget");
assert.equal(session().checked, true);
assert.equal(session().correct, false);
assert.equal(session().results[1].zh, false);
assert.match(host.innerHTML, /正确答案/);
assert.match(host.innerHTML, /lubricant/);
click("continue");
assert.equal(session().phase, "reinforce", "first-round forgetting must lead to reinforcement");
console.log("Memorize forget checks passed.");
