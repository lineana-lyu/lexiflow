"use strict";

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

let database = null;
let databasePath = "";
let openError = "";

function clean(value) {
  return String(value ?? "").trim();
}

function candidatePaths() {
  return Array.from(new Set([
    process.env.LEXIFLOW_MORPHOLOGY_DB || "",
    path.join(__dirname, "..", "resources", "morphology.sqlite"),
    process.resourcesPath ? path.join(process.resourcesPath, "morphology.sqlite") : "",
  ].filter(Boolean).map(value => path.resolve(value))));
}

function resolveDatabasePath() {
  for (const candidate of candidatePaths()) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return "";
}

function close() {
  try { database?.close(); } catch {}
  database = null;
  databasePath = "";
}

function getDatabase() {
  const resolved = resolveDatabasePath();
  if (!resolved) {
    openError = "Morphology database not found";
    close();
    return null;
  }
  if (database && databasePath === resolved) return database;

  close();
  try {
    database = new DatabaseSync(resolved, { readOnly: true });
    database.exec("PRAGMA query_only = ON");
    databasePath = resolved;
    openError = "";
    return database;
  } catch (err) {
    openError = String(err?.message || err || "Morphology open failed");
    close();
    return null;
  }
}

function status() {
  const db = getDatabase();
  if (!db) return { available:false, path:resolveDatabasePath(), words:0, morphemes:0, error:openError };
  try {
    const rows = Object.fromEntries(
      db.prepare("SELECT key,value FROM metadata WHERE key IN ('word_count','morpheme_count','prepared_at','schema')")
        .all()
        .map(row => [row.key,row.value])
    );
    return {
      available:true,
      path:databasePath,
      words:Number(rows.word_count || 0),
      morphemes:Number(rows.morpheme_count || 0),
      preparedAt:rows.prepared_at || "",
      schema:rows.schema || "",
      error:"",
    };
  } catch (err) {
    return { available:true, path:databasePath, words:0, morphemes:0, error:String(err?.message || err || "") };
  }
}

function sourceRows(db, sourceIds) {
  const ids = Array.from(new Set((sourceIds || []).filter(Boolean)));
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`SELECT id,kind,name,headword,url,license FROM sources WHERE id IN (${placeholders})`).all(...ids);
  const byId = new Map(rows.map(row => [row.id,row]));
  return ids.map(id => byId.get(id)).filter(Boolean).map(row => ({
    id:row.id,
    kind:row.kind,
    name:row.name,
    headword:row.headword,
    url:row.url,
    license:row.license,
  }));
}

function rootStory(db, id) {
  const row = db.prepare(`
    SELECT id,display,type,language,meaning_en,meaning_zh,narrative_zh
    FROM morphemes WHERE id=? COLLATE NOCASE LIMIT 1
  `).get(id);
  if (!row) return null;
  const sourceIds = db.prepare("SELECT source_id FROM morpheme_sources WHERE morpheme_id=? ORDER BY source_id")
    .all(row.id)
    .map(item => item.source_id);
  return {
    id:row.id,
    display:row.display,
    type:row.type,
    language:row.language,
    meaningEn:row.meaning_en,
    meaningZh:row.meaning_zh,
    narrativeZh:row.narrative_zh,
    sources:sourceRows(db, sourceIds),
  };
}

function lookup(word) {
  const db = getDatabase();
  const normalized = clean(word).toLowerCase();
  if (!db || !/^[a-z][a-z'-]*$/.test(normalized)) return null;
  try {
    const row = db.prepare(`
      SELECT word,confidence,mode,literal_en,literal_zh,meaning_bridge_zh
      FROM word_morphology
      WHERE word=? COLLATE NOCASE
      LIMIT 1
    `).get(normalized);
    if (!row || row.confidence === "uncertain") return null;

    const parts = db.prepare(`
      SELECT position,text,role,meaning_en,meaning_zh,morpheme_id
      FROM word_parts
      WHERE word=? COLLATE NOCASE
      ORDER BY position
    `).all(normalized).map(item => ({
      text:item.text,
      role:item.role,
      meaningEn:item.meaning_en,
      meaningZh:item.meaning_zh,
      morphemeId:item.morpheme_id || "",
    }));

    const rootIds = db.prepare(`
      SELECT morpheme_id
      FROM word_roots
      WHERE word=? COLLATE NOCASE
      ORDER BY position
    `).all(normalized).map(item => item.morpheme_id);

    const relatedWords = db.prepare(`
      SELECT related_word
      FROM word_related
      WHERE word=? COLLATE NOCASE
      ORDER BY position
    `).all(normalized).map(item => item.related_word);

    const sourceIds = db.prepare(`
      SELECT source_id
      FROM word_sources
      WHERE word=? COLLATE NOCASE
      ORDER BY source_id
    `).all(normalized).map(item => item.source_id);

    return {
      word:row.word,
      confidence:row.confidence,
      mode:row.mode,
      literalEn:row.literal_en,
      literalZh:row.literal_zh,
      meaningBridgeZh:row.meaning_bridge_zh,
      parts,
      rootStories:rootIds.map(id => rootStory(db,id)).filter(Boolean),
      relatedWords,
      sources:sourceRows(db, sourceIds),
      provenancePolicy:"verified-facts-only",
    };
  } catch (err) {
    openError = String(err?.message || err || "Morphology lookup failed");
    return null;
  }
}

module.exports = {
  status,
  close,
  lookup,
};
