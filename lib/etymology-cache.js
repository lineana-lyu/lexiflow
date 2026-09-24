"use strict";

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");

const CACHE_SCHEMA = "lexiflow-etymology-cache-v1";
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 400;

function clean(value) {
  return String(value ?? "").trim();
}

class PersistentEtymologyCache {
  constructor({
    filePath = path.join(process.env.LEXIFLOW_DATA_DIR || path.join(os.homedir(), ".lexiflow"), "etymology-cache-v1.json"),
    ttlMs = DEFAULT_TTL_MS,
    maxEntries = DEFAULT_MAX_ENTRIES,
  } = {}) {
    this.filePath = filePath;
    this.ttlMs = Math.max(60 * 1000, Number(ttlMs) || DEFAULT_TTL_MS);
    this.maxEntries = Math.max(10, Number(maxEntries) || DEFAULT_MAX_ENTRIES);
    this.loaded = false;
    this.data = { schema: CACHE_SCHEMA, entries: {} };
    this.writeQueue = Promise.resolve();
  }

  async load() {
    if (this.loaded) return this.data;
    this.loaded = true;
    try {
      const parsed = JSON.parse(await fsp.readFile(this.filePath, "utf8"));
      if (parsed?.schema === CACHE_SCHEMA && parsed.entries && typeof parsed.entries === "object") {
        this.data = parsed;
      }
    } catch {}
    return this.data;
  }

  isFresh(entry) {
    const savedAt = Number(entry?.savedAt || 0);
    return savedAt > 0 && Date.now() - savedAt <= this.ttlMs;
  }

  async get(key) {
    const normalizedKey = clean(key);
    if (!normalizedKey) return null;
    const data = await this.load();
    const entry = data.entries[normalizedKey];
    if (!entry) return null;
    if (!this.isFresh(entry) || !entry.result || typeof entry.result !== "object") {
      delete data.entries[normalizedKey];
      void this.flush();
      return null;
    }
    return JSON.parse(JSON.stringify(entry.result));
  }

  async set(key, result) {
    const normalizedKey = clean(key);
    if (!normalizedKey || !result || typeof result !== "object") return;
    const data = await this.load();
    data.entries[normalizedKey] = {
      savedAt: Date.now(),
      result: JSON.parse(JSON.stringify(result)),
    };
    this.trim();
    await this.flush();
  }

  trim() {
    const entries = Object.entries(this.data.entries || {});
    if (entries.length <= this.maxEntries) return;
    entries
      .sort((a, b) => Number(a[1]?.savedAt || 0) - Number(b[1]?.savedAt || 0))
      .slice(0, entries.length - this.maxEntries)
      .forEach(([key]) => delete this.data.entries[key]);
  }

  async flush() {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.writeQueue = this.writeQueue
      .catch(() => {})
      .then(async () => {
        await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
        const temp = `${this.filePath}.${process.pid}.tmp`;
        await fsp.writeFile(temp, snapshot, "utf8");
        await fsp.rename(temp, this.filePath);
      })
      .catch(err => {
        console.warn("etymology cache write failed:", err?.message || err);
      });
    return this.writeQueue;
  }

  async clear() {
    this.loaded = true;
    this.data = { schema: CACHE_SCHEMA, entries: {} };
    try {
      if (fs.existsSync(this.filePath)) await fsp.unlink(this.filePath);
    } catch {}
  }
}

module.exports = {
  PersistentEtymologyCache,
  CACHE_SCHEMA,
  DEFAULT_TTL_MS,
  DEFAULT_MAX_ENTRIES,
};
