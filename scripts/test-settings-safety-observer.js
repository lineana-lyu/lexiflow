"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "public", "safety-controls.js"), "utf8");

function runScenario(kind) {
  const pending = [];
  let observed = false;
  let mutationCount = 0;

  class FakeNode {
    constructor(text = "") {
      this._text = text;
      this._html = "";
      this.dataset = {};
      this.classList = { add() {}, toggle() {} };
    }
    get textContent() { return this._text; }
    set textContent(value) {
      this._text = String(value);
      mutationCount += 1;
      if (observed) pending.push(observerCallback);
    }
    get innerHTML() { return this._html; }
    set innerHTML(value) {
      this._html = String(value);
      mutationCount += 1;
      if (observed) pending.push(observerCallback);
    }
  }

  const appRoot = new FakeNode();
  const trigger = new FakeNode("清空数据");
  const rowTitle = new FakeNode("清空学习数据");
  const rowDescription = new FakeNode("删除全部单词与学习记录。");
  const row = {
    querySelector(selector) {
      if (selector === "h3") return rowTitle;
      if (selector === "p") return rowDescription;
      return null;
    },
  };
  trigger.closest = selector => selector === ".setting-row" ? row : null;

  const modal = new FakeNode();
  const modalTitle = new FakeNode("确认清空全部数据？");
  const modalAction = new FakeNode("确认清空");
  const modalDescription = new FakeNode();
  modal.querySelector = selector => {
    if (selector === "h2") return modalTitle;
    if (selector === '[data-action="reset-data"]') return modalAction;
    if (selector === "p") return modalDescription;
    return null;
  };

  const document = {
    documentElement: appRoot,
    getElementById(id) { return id === "app" ? appRoot : null; },
    querySelector(selector) {
      if (kind === "settings" && selector === '[data-action="confirm-reset"]') return trigger;
      if (kind === "modal" && selector === ".modal") return modal;
      return null;
    },
    addEventListener() {},
  };

  let observerCallback = () => {};
  class FakeMutationObserver {
    constructor(callback) { observerCallback = callback; }
    observe() { observed = true; }
  }

  const context = {
    document,
    MutationObserver: FakeMutationObserver,
    window: { prompt: () => null },
    setTimeout,
    console,
  };

  vm.runInNewContext(source, context, { filename: "safety-controls.js" });

  let callbacks = 0;
  while (pending.length) {
    const callback = pending.shift();
    callback([]);
    callbacks += 1;
    if (callbacks > 50) {
      throw new Error(`${kind}: MutationObserver did not settle (possible recursive DOM rewrite)`);
    }
  }

  if (kind === "settings") {
    if (trigger.dataset.safetyHardened !== "1") throw new Error("settings: reset entry was not hardened");
    if (trigger.textContent !== "清除所有学习数据") throw new Error("settings: reset entry copy was not updated");
  } else {
    if (modalAction.dataset.safetyHardened !== "1") throw new Error("modal: reset action was not hardened");
    if (modalTitle.textContent !== "高风险操作：清空全部学习数据") throw new Error("modal: title was not updated");
  }

  if (mutationCount > 10) throw new Error(`${kind}: too many DOM mutations (${mutationCount})`);
  return { kind, callbacks, mutationCount };
}

const results = [runScenario("settings"), runScenario("modal")];
console.log("settings safety observer regression passed", results);
