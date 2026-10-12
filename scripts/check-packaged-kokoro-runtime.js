"use strict";

/**
 * Run after electron-builder produces dist/win-unpacked.
 *
 * The Kokoro worker is loaded from app.asar.unpacked/lib, so a successful npm
 * install or a source-level import cannot establish production correctness.
 * Probe the production files from the worker's physical directory instead.
 * This deliberately does not download a model or write test data to the app.
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const unpacked = path.join(root, "dist", "win-unpacked", "resources", "app.asar.unpacked");
const workerDir = path.join(unpacked, "lib");
const expected = [
  path.join(workerDir, "kokoro-worker.js"),
  path.join(unpacked, "node_modules", "kokoro-js", "package.json"),
  path.join(unpacked, "node_modules", "@huggingface", "transformers", "package.json"),
  path.join(unpacked, "node_modules", "onnxruntime-node", "package.json"),
];

for (const file of expected) {
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Required installed-app speech asset is missing: ${file}`);
  }
}

// ESM package lookup must originate from the *unpacked worker directory*,
// not from the source repo, CI working directory or app.asar archive.
const probe = `
const [kokoro, transformers] = await Promise.all([
  import("kokoro-js"),
  import("@huggingface/transformers"),
]);
if (typeof kokoro.KokoroTTS?.from_pretrained !== "function") {
  throw new Error("KokoroTTS constructor is unavailable");
}
if (!transformers.env) {
  throw new Error("Transformers.js runtime environment is unavailable");
}
process.stdout.write("Packaged Kokoro imports succeeded\\n");
`;

const result = spawnSync(process.execPath, ["--input-type=module", "--eval", probe], {
  cwd: workerDir,
  encoding: "utf8",
  windowsHide: true,
  timeout: 120_000,
  maxBuffer: 4 * 1024 * 1024,
});

if (result.error || result.status !== 0) {
  throw new Error([
    "Packaged Kokoro module import failed (worker physical path).",
    result.error?.message || "",
    result.stdout || "",
    result.stderr || "",
  ].filter(Boolean).join("\n"));
}

console.log(result.stdout.trim());
console.log("Packaged Kokoro dependency smoke test passed (without downloading a model).");
