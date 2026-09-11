"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = process.env.LEXIFLOW_DATA_DIR || path.join(ROOT, "data");
const CACHE_DIR = path.join(DATA_DIR, "tts-cache");
const SCRIPT = path.join(ROOT, "resources", "chattts-voice", "synthesize.py");

function clean(v) { return String(v || "").trim(); }

function pythonCandidates() {
  return [
    process.env.LEXIFLOW_PYTHON || "",
    process.env.PYTHON || "",
    "python",
    "python3",
  ].filter(Boolean);
}

function run(command, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(Object.assign(new Error("ChatTTS synthesis timed out"), { code: "CHATTTS_TIMEOUT" }));
    }, timeoutMs);
    child.stdout.on("data", c => stdout += c.toString("utf8"));
    child.stderr.on("data", c => stderr += c.toString("utf8"));
    child.on("error", err => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(err);
    });
    child.on("close", code => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code === 0) resolve({ stdout, stderr });
      else reject(Object.assign(new Error((stderr || stdout || `ChatTTS exited ${code}`).trim()), { code: "CHATTTS_FAILED" }));
    });
  });
}

async function resolvePython() {
  for (const candidate of pythonCandidates()) {
    try {
      await run(candidate, ["-c", "import ChatTTS, numpy, torch, scipy; print('ok')"], 12000);
      return candidate;
    } catch {}
  }
  return "";
}

let pythonPromise = null;
async function status() {
  if (!fs.existsSync(SCRIPT)) return { available: false, reason: "voice files missing" };
  if (!pythonPromise) pythonPromise = resolvePython();
  const python = await pythonPromise;
  return { available: Boolean(python), python, voice: "candidate-3" };
}

async function synthesize(text) {
  const value = clean(text).slice(0, 500);
  if (!value) throw Object.assign(new Error("empty text"), { code: "CHATTTS_EMPTY" });
  const st = await status();
  if (!st.available) throw Object.assign(new Error("ChatTTS Python environment unavailable"), { code: "CHATTTS_UNAVAILABLE" });
  await fsp.mkdir(CACHE_DIR, { recursive: true });
  const key = crypto.createHash("sha256").update(`candidate3\n${value}`).digest("hex").slice(0, 32);
  const output = path.join(CACHE_DIR, `${key}.wav`);
  if (!fs.existsSync(output)) await run(st.python, [SCRIPT, output, value], 180000);
  const bytes = await fsp.readFile(output);
  return { dataUrl: `data:audio/wav;base64,${bytes.toString("base64")}`, cacheHit: fs.existsSync(output), voice: "candidate-3" };
}

module.exports = { status, synthesize };
