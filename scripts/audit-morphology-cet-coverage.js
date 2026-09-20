"use strict";

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_ECDICT = path.join(ROOT, "resources", "ecdict.sqlite");
const DEFAULT_MORPHOLOGY = path.join(ROOT, "resources", "morphology.sqlite");

function clean(value) {
  return String(value ?? "").trim();
}

function parseArgs(argv) {
  const args = {
    ecdict: DEFAULT_ECDICT,
    morphology: DEFAULT_MORPHOLOGY,
    top: 500,
    backlog: 40,
    format: "markdown",
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--ecdict") args.ecdict = path.resolve(argv[++i]);
    else if (argv[i] === "--morphology") args.morphology = path.resolve(argv[++i]);
    else if (argv[i] === "--top") args.top = Math.max(10, Number(argv[++i]) || 500);
    else if (argv[i] === "--backlog") args.backlog = Math.max(10, Number(argv[++i]) || 40);
    else if (argv[i] === "--json") args.format = "json";
    else if (argv[i] === "--markdown") args.format = "markdown";
  }
  return args;
}

function assertReadable(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function alphaWord(word) {
  return /^[a-z][a-z'-]*$/i.test(clean(word));
}

function rankValue(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? n : Number.MAX_SAFE_INTEGER;
}

function priorityCompare(a, b) {
  const afr = rankValue(a.frq);
  const bfr = rankValue(b.frq);
  if (afr !== bfr) return afr - bfr;

  const ab = rankValue(a.bnc);
  const bb = rankValue(b.bnc);
  if (ab !== bb) return ab - bb;

  const ac = Number(a.collins || 0);
  const bc = Number(b.collins || 0);
  if (ac !== bc) return bc - ac;

  const ao = Number(a.oxford || 0);
  const bo = Number(b.oxford || 0);
  if (ao !== bo) return bo - ao;

  return String(a.word).localeCompare(String(b.word));
}

function exchangeLemma(value) {
  for (const part of clean(value).split("/")) {
    const index = part.indexOf(":");
    if (index <= 0) continue;
    const type = part.slice(0, index).trim();
    const form = part.slice(index + 1).trim().toLowerCase();
    if (type === "0" && alphaWord(form)) return form;
  }
  return "";
}

function examRows(db, tag) {
  return db.prepare(`
    SELECT word, tag, frq, bnc, collins, oxford, exchange
    FROM entries
    WHERE (' ' || lower(tag) || ' ') LIKE ?
  `).all(`% ${tag.toLowerCase()} %`)
    .filter(row => alphaWord(row.word))
    .map(row => {
      const word = clean(row.word).toLowerCase();
      return { ...row, word, lemma: exchangeLemma(row.exchange) || word };
    })
    .sort(priorityCompare);
}

function morphologyWords(db) {
  return new Set(
    db.prepare("SELECT word FROM word_morphology WHERE confidence <> 'uncertain'")
      .all()
      .map(row => clean(row.word).toLowerCase())
      .filter(Boolean)
  );
}

function percent(part, whole) {
  if (!whole) return 0;
  return Number((part / whole * 100).toFixed(1));
}

function isCovered(row, covered) {
  return covered.has(row.word) || covered.has(row.lemma);
}

function cohort(rows, covered, limit) {
  const scoped = rows.slice(0, Math.min(limit, rows.length));
  const matched = scoped.filter(row => isCovered(row, covered));
  return {
    size: scoped.length,
    covered: matched.length,
    coveragePct: percent(matched.length, scoped.length),
  };
}

function auditExam(rows, covered, { top, backlog }) {
  const matched = rows.filter(row => isCovered(row, covered));
  const uncovered = rows.filter(row => !isCovered(row, covered));
  const viaLemma = matched.filter(row => !covered.has(row.word) && covered.has(row.lemma));
  return {
    totalTaggedWords: rows.length,
    coveredWords: matched.length,
    coveredViaLemma: viaLemma.length,
    coveragePct: percent(matched.length, rows.length),
    top100: cohort(rows, covered, 100),
    top300: cohort(rows, covered, 300),
    topN: cohort(rows, covered, top),
    backlog: uncovered.slice(0, backlog).map(row => ({
      word: row.word,
      lemma: row.lemma !== row.word ? row.lemma : "",
      frq: Number(row.frq || 0),
      bnc: Number(row.bnc || 0),
      collins: Number(row.collins || 0),
      oxford: Number(row.oxford || 0),
    })),
  };
}

function metadata(db) {
  try {
    return Object.fromEntries(db.prepare("SELECT key,value FROM metadata").all().map(row => [row.key, row.value]));
  } catch {
    return {};
  }
}

function buildAudit(ecdictPath, morphologyPath, options) {
  assertReadable(ecdictPath, "ECDICT database");
  assertReadable(morphologyPath, "Morphology database");

  const ecdict = new DatabaseSync(ecdictPath, { readOnly: true });
  const morphology = new DatabaseSync(morphologyPath, { readOnly: true });
  try {
    const covered = morphologyWords(morphology);
    const cet4Rows = examRows(ecdict, "cet4");
    const cet6Rows = examRows(ecdict, "cet6");
    return {
      generatedAt: new Date().toISOString(),
      methodology: {
        examSource: "ECDICT tag tokens: cet4 / cet6",
        ranking: "positive frq ascending, then positive bnc ascending, then Collins stars and Oxford 3000 flags",
        coverageDefinition: "surface word or ECDICT exchange lemma has a non-uncertain LexiFlow morphology record, matching runtime lookup behavior",
        backlogDefinition: "highest-ranked uncovered exam-tagged words after lemma resolution; candidates only, not automatic morphology eligibility",
      },
      morphology: {
        words: covered.size,
        metadata: metadata(morphology),
      },
      ecdict: {
        metadata: metadata(ecdict),
      },
      cet4: auditExam(cet4Rows, covered, options),
      cet6: auditExam(cet6Rows, covered, options),
    };
  } finally {
    ecdict.close();
    morphology.close();
  }
}

function scoreLine(label, value) {
  return `| ${label} | ${value.covered} / ${value.size} | ${value.coveragePct}% |`;
}

function backlogTable(items) {
  if (!items.length) return "_No uncovered candidates in this slice._";
  return [
    "| Word | Lemma | FRQ rank | BNC rank | Collins | Oxford 3000 |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
    ...items.map(item => `| ${item.word} | ${item.lemma || "—"} | ${item.frq || "—"} | ${item.bnc || "—"} | ${item.collins || "—"} | ${item.oxford ? "yes" : "—"} |`),
  ].join("\n");
}

function markdown(audit, top) {
  const blocks = [
    "# LexiFlow Morphology CET Coverage Audit",
    "",
    "> This is a product-coverage signal, not a linguistic eligibility score. An uncovered word is only a review candidate; it must still pass LexiFlow's source-verification policy before morphology can be published.",
    "",
    "## Method",
    "",
    `- Exam membership: ${audit.methodology.examSource}.`,
    `- Priority order: ${audit.methodology.ranking}.`,
    `- Coverage: ${audit.methodology.coverageDefinition}.`,
    "",
  ];

  for (const [label, key] of [["CET-4", "cet4"], ["CET-6", "cet6"]]) {
    const item = audit[key];
    blocks.push(
      `## ${label}`,
      "",
      `Runtime-aligned coverage: **${item.coveredWords} / ${item.totalTaggedWords} (${item.coveragePct}%)**; ${item.coveredViaLemma} are inherited through ECDICT lemma resolution.`,
      "",
      "| Priority slice | Covered | Coverage |",
      "| --- | ---: | ---: |",
      scoreLine("Top 100", item.top100),
      scoreLine("Top 300", item.top300),
      scoreLine(`Top ${top}`, item.topN),
      "",
      "### Highest-priority uncovered candidates",
      "",
      backlogTable(item.backlog),
      ""
    );
  }

  blocks.push(
    "## Interpretation",
    "",
    "- Use Top-100 / Top-300 coverage to decide the next editorial batch; these are more actionable than whole-list coverage.",
    "- Do not convert the uncovered list directly into root stories. Each candidate still needs classical-language and English-etymology evidence.",
    "- Words with opaque historical spelling changes should use root-family association rather than a fake modern letter split.",
    ""
  );

  return blocks.join("\n");
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const audit = buildAudit(args.ecdict, args.morphology, args);
    if (args.format === "json") {
      process.stdout.write(JSON.stringify(audit, null, 2) + "\n");
    } else {
      process.stdout.write(markdown(audit, args.top) + "\n");
    }
  } catch (err) {
    console.error("Morphology coverage audit failed:", err.message || err);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  exchangeLemma,
  isCovered,
  priorityCompare,
  buildAudit,
  markdown,
};
