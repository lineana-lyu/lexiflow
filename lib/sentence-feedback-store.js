"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

function stableFeedbackKey({ schema, model, word, meaningZh, sentence } = {}) {
  return [
    String(schema || ""),
    String(model || ""),
    String(word || "").trim().toLowerCase(),
    String(meaningZh || "").trim(),
    String(sentence || "").trim(),
  ].join("|");
}

class PersistentSentenceFeedbackStore {
  constructor({ filePath, maxEntries = 300 } = {}) {
    this.filePath = String(filePath || "");
    this.maxEntries = Math.max(20, Number(maxEntries || 300));
    this.loaded = false;
    this.entries = {};
  }

  async load() {
    if (this.loaded) return this.entries;
    this.loaded = true;
    if (!this.filePath) return this.entries;
    try {
      const parsed = JSON.parse(await fsp.readFile(this.filePath, "utf8"));
      this.entries = parsed && typeof parsed === "object" && parsed.entries && typeof parsed.entries === "object"
        ? parsed.entries
        : {};
    } catch {
      this.entries = {};
    }
    return this.entries;
  }

  async get(key) {
    const entries = await this.load();
    const hit = entries[String(key || "")];
    return hit && hit.result ? hit.result : null;
  }

  async set(key, result) {
    const entries = await this.load();
    const cacheKey = String(key || "");
    if (!cacheKey || !result) return;
    entries[cacheKey] = { savedAt: Date.now(), result };

    const keys = Object.keys(entries);
    if (keys.length > this.maxEntries) {
      keys
        .sort((a, b) => Number(entries[a]?.savedAt || 0) - Number(entries[b]?.savedAt || 0))
        .slice(0, keys.length - this.maxEntries)
        .forEach(oldKey => delete entries[oldKey]);
    }

    await this.save();
  }

  async save() {
    if (!this.filePath) return;
    try {
      await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify({ version: 1, entries: this.entries }, null, 2), "utf8");
      await fsp.rename(tmp, this.filePath);
    } catch (err) {
      console.warn("sentence feedback cache write failed:", err?.message || err);
    }
  }
}

module.exports = {
  stableFeedbackKey,
  PersistentSentenceFeedbackStore,
};
