"use strict";

const fs = require("fs");
const path = require("path");

const AUTHORITY_PATH = path.join(__dirname, "..", "data", "morpheme-authority.json");

let cache = null;

function load() {
  if (cache) return cache;
  const raw = JSON.parse(fs.readFileSync(AUTHORITY_PATH, "utf8"));
  const byId = new Map();
  const byTeachingForm = new Map();
  for (const item of raw.morphemes || []) {
    byId.set(item.id, item);
    for (const form of item.teachingForms || []) {
      const key = String(form || "").trim().toUpperCase();
      if (!key) continue;
      if (!byTeachingForm.has(key)) byTeachingForm.set(key, []);
      byTeachingForm.get(key).push(item);
    }
  }
  cache = { raw, byId, byTeachingForm };
  return cache;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function getById(id) {
  return clone(load().byId.get(String(id || "").trim()) || null);
}

function findByTeachingForm(form, options = {}) {
  const key = String(form || "").trim().toUpperCase();
  if (!key) return [];
  const items = load().byTeachingForm.get(key) || [];
  const kind = String(options.kind || "").trim();
  return clone(kind ? items.filter(item => item.kind === kind) : items);
}

function getSources(sourceIds) {
  const ids = new Set((sourceIds || []).map(value => String(value || "").trim()).filter(Boolean));
  return clone((load().raw.sources || []).filter(source => ids.has(source.id)));
}

function evidenceFor(id) {
  const item = load().byId.get(String(id || "").trim());
  if (!item) return null;
  const ids = new Set();
  for (const values of Object.values(item.claimSources || {})) {
    for (const sourceId of Array.isArray(values) ? values : []) ids.add(sourceId);
  }
  return {
    morpheme: clone(item),
    sources: getSources([...ids]),
  };
}

function resetForTests() {
  cache = null;
}

module.exports = {
  AUTHORITY_PATH,
  getById,
  findByTeachingForm,
  evidenceFor,
  resetForTests,
};
