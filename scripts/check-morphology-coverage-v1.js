"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { exchangeLemma, buildAudit } = require("./audit-morphology-cet-coverage");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lexiflow-morphology-coverage-"));
const ecdictPath = path.join(dir, "ecdict.sqlite");
const morphologyPath = path.join(dir, "morphology.sqlite");

try {
  const ecdict = new DatabaseSync(ecdictPath);
  ecdict.exec(`
    CREATE TABLE entries (
      word TEXT PRIMARY KEY,
      tag TEXT NOT NULL DEFAULT '',
      frq INTEGER NOT NULL DEFAULT 0,
      bnc INTEGER NOT NULL DEFAULT 0,
      collins INTEGER NOT NULL DEFAULT 0,
      oxford INTEGER NOT NULL DEFAULT 0,
      exchange TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  const insertEntry = ecdict.prepare("INSERT INTO entries(word,tag,frq,bnc,collins,oxford,exchange) VALUES (?,?,?,?,?,?,?)");
  insertEntry.run("actual", "cet4 cet6", 100, 120, 5, 1, "");
  insertEntry.run("actually", "cet4 cet6", 90, 110, 5, 1, "0:actual");
  insertEntry.run("unknown", "cet4", 80, 90, 4, 1, "");
  ecdict.prepare("INSERT INTO metadata(key,value) VALUES (?,?)").run("schema","fixture");
  ecdict.close();

  const morphology = new DatabaseSync(morphologyPath);
  morphology.exec(`
    CREATE TABLE word_morphology (
      word TEXT PRIMARY KEY,
      confidence TEXT NOT NULL
    );
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  morphology.prepare("INSERT INTO word_morphology(word,confidence) VALUES (?,?)").run("actual","verified");
  morphology.prepare("INSERT INTO metadata(key,value) VALUES (?,?)").run("schema","fixture");
  morphology.close();

  assert(exchangeLemma("0:actual/3:actuals") === "actual", "exchange lemma must parse type 0");
  assert(exchangeLemma("p:worked/d:worked") === "", "non-lemma exchange must stay empty");

  const audit = buildAudit(ecdictPath, morphologyPath, { top:500, backlog:20 });
  assert(audit.cet4.totalTaggedWords === 3, "CET4 fixture population mismatch");
  assert(audit.cet4.coveredWords === 2, "surface + lemma inherited coverage must both count");
  assert(audit.cet4.coveredViaLemma === 1, "lemma-inherited coverage count mismatch");
  assert(audit.cet4.backlog.length === 1 && audit.cet4.backlog[0].word === "unknown", "backlog must exclude lemma-covered words");
  assert(audit.cet6.totalTaggedWords === 2 && audit.cet6.coveredWords === 2, "CET6 lemma-aware coverage mismatch");

  console.log("Morphology CET coverage checks passed.");
} finally {
  fs.rmSync(dir, { recursive:true, force:true });
}
