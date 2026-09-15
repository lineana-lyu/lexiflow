"use strict";

const core = require("../lib/core-lexicon");

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function timed(fn, iterations = 100) {
  const samples = [];
  let value = null;
  for (let i = 0; i < iterations; i += 1) {
    const start = process.hrtime.bigint();
    value = fn();
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    samples.push(ms);
  }
  return { value, p50: percentile(samples, 0.5), p95: percentile(samples, 0.95), max: Math.max(...samples) };
}

const status = core.status();
if (!status.available) {
  console.error("LexiFlow Core unavailable:", status.error || status.path);
  process.exit(1);
}
console.log("LexiFlow Core status:", status);

const english = ["apple", "brush", "challenge", "resilient", "accomplish", "maintain", "approach"];
for (const word of english) {
  const result = timed(() => core.lookupExact(word));
  console.log(`EN ${word.padEnd(12)} -> ${(result.value?.senses?.[0]?.meaningZh || "MISS").slice(0, 36)} | p50=${result.p50.toFixed(2)}ms p95=${result.p95.toFixed(2)}ms`);
}

const chinese = ["苹果", "笔", "键盘", "挑战", "风衣", "改善", "坚持"];
for (const query of chinese) {
  const result = timed(() => core.lookupChinese(query));
  console.log(`ZH ${query.padEnd(6)} -> ${result.value?.word || "MISS"} | source=${result.value?.chineseAliasSource || "-"} p50=${result.p50.toFixed(2)}ms p95=${result.p95.toFixed(2)}ms`);
}

const hardExpectations = new Map([
  ["苹果", "apple"],
  ["笔", "pen"],
  ["键盘", "keyboard"],
  ["挑战", "challenge"],
]);
for (const [query, expected] of hardExpectations) {
  const result = core.lookupChinese(query);
  if (result?.word !== expected) {
    console.error(`Core semantic regression: ${query} expected ${expected}, got ${result?.word || "MISS"}`);
    process.exitCode = 1;
  }
}

const speedProbe = timed(() => core.lookupExact("challenge"), 300);
if (speedProbe.p95 > 25) {
  console.error(`Core lookup speed regression: challenge p95=${speedProbe.p95.toFixed(2)}ms (>25ms)`);
  process.exitCode = 1;
}

core.close();
