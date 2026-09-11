"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = process.env.LEXIFLOW_DATA_DIR || path.join(ROOT, "data");
const CACHE_DIR = path.join(DATA_DIR, "tts-cache");

let pythonPromise = null;
let worker = null;
let workerReady = null;
let stdoutBuffer = "";
let requestSeq = 0;
const pending = new Map();

function clean(v) { return String(v || "").trim(); }

function voiceDirectories() {
  return Array.from(new Set([
    process.env.LEXIFLOW_CHATTTS_VOICE_DIR || "",
    path.join(ROOT, "resources", "chattts-voice"),
    process.resourcesPath ? path.join(process.resourcesPath, "chattts-voice") : "",
  ].filter(Boolean).map(value => path.resolve(value))));
}

function resolveVoiceFile(name) {
  for (const dir of voiceDirectories()) {
    const candidate = path.join(dir, name);
    try { if (fs.existsSync(candidate)) return candidate; } catch {}
  }
  return "";
}

function pythonCandidates() {
  return [process.env.LEXIFLOW_PYTHON || "", process.env.PYTHON || "", "python", "python3"].filter(Boolean);
}

function run(command, args, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(Object.assign(new Error("ChatTTS command timed out"), { code: "CHATTTS_TIMEOUT" }));
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
      await run(candidate, ["-c", "import ChatTTS, numpy, torch, scipy; print('ok')"]);
      return candidate;
    } catch {}
  }
  return "";
}

function rejectAll(error) {
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.reject(error);
  }
  pending.clear();
}

function consumeWorkerLine(line) {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message?.type === "ready") return;
  const id = clean(message?.id);
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  clearTimeout(entry.timer);
  if (message.ok) entry.resolve(message);
  else entry.reject(Object.assign(new Error(clean(message.error) || "ChatTTS synthesis failed"), { code: "CHATTTS_FAILED" }));
}

async function ensureWorker() {
  if (worker && !worker.killed && workerReady) return workerReady;
  const workerScript = resolveVoiceFile("worker.py");
  const voiceFile = resolveVoiceFile("voice_candidate_3.json");
  if (!workerScript || !voiceFile) throw Object.assign(new Error("ChatTTS voice files missing"), { code: "CHATTTS_VOICE_MISSING" });
  if (!pythonPromise) pythonPromise = resolvePython();
  const python = await pythonPromise;
  if (!python) throw Object.assign(new Error("ChatTTS Python environment unavailable"), { code: "CHATTTS_UNAVAILABLE" });

  stdoutBuffer = "";
  worker = spawn(python, [workerScript], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  workerReady = new Promise((resolve, reject) => {
    let readySettled = false;
    const readyTimer = setTimeout(() => {
      if (readySettled) return;
      readySettled = true;
      try { worker?.kill(); } catch {}
      reject(Object.assign(new Error("ChatTTS model startup timed out"), { code: "CHATTTS_START_TIMEOUT" }));
    }, 180000);

    worker.stdout.on("data", chunk => {
      stdoutBuffer += chunk.toString("utf8");
      let index;
      while ((index = stdoutBuffer.indexOf("\n")) >= 0) {
        const line = stdoutBuffer.slice(0, index).trim();
        stdoutBuffer = stdoutBuffer.slice(index + 1);
        if (!line) continue;
        let message = null;
        try { message = JSON.parse(line); } catch {}
        if (!readySettled && message?.type === "ready") {
          readySettled = true;
          clearTimeout(readyTimer);
          if (message.ok) resolve({ available: true, python, voice: "candidate-3" });
          else reject(Object.assign(new Error(clean(message.error) || "ChatTTS model failed to load"), { code: "CHATTTS_LOAD_FAILED" }));
          continue;
        }
        consumeWorkerLine(line);
      }
    });
    worker.stderr.on("data", chunk => console.warn("ChatTTS:", chunk.toString("utf8").trim()));
    worker.on("error", err => {
      clearTimeout(readyTimer);
      if (!readySettled) { readySettled = true; reject(err); }
      rejectAll(err);
      worker = null;
      workerReady = null;
    });
    worker.on("close", code => {
      clearTimeout(readyTimer);
      const error = Object.assign(new Error(`ChatTTS worker exited ${code}`), { code: "CHATTTS_WORKER_EXIT" });
      if (!readySettled) { readySettled = true; reject(error); }
      rejectAll(error);
      worker = null;
      workerReady = null;
    });
  });
  return workerReady;
}

async function status() {
  const workerScript = resolveVoiceFile("worker.py");
  const voiceFile = resolveVoiceFile("voice_candidate_3.json");
  if (!workerScript || !voiceFile) return { available: false, reason: "voice files missing", voice: "candidate-3" };
  if (!pythonPromise) pythonPromise = resolvePython();
  const python = await pythonPromise;
  return { available: Boolean(python), python, voice: "candidate-3", warm: Boolean(worker && workerReady) };
}

async function requestSynthesis(text, output) {
  await ensureWorker();
  const id = String(++requestSeq);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Object.assign(new Error("ChatTTS synthesis timed out"), { code: "CHATTTS_TIMEOUT" }));
    }, 120000);
    pending.set(id, { resolve, reject, timer });
    try {
      worker.stdin.write(`${JSON.stringify({ id, text, output })}\n`, "utf8");
    } catch (err) {
      clearTimeout(timer);
      pending.delete(id);
      reject(err);
    }
  });
}

async function synthesize(text) {
  const value = clean(text).slice(0, 500);
  if (!value) throw Object.assign(new Error("empty text"), { code: "CHATTTS_EMPTY" });
  await fsp.mkdir(CACHE_DIR, { recursive: true });
  const key = crypto.createHash("sha256").update(`candidate3\n${value}`).digest("hex").slice(0, 32);
  const output = path.join(CACHE_DIR, `${key}.wav`);
  const existed = fs.existsSync(output);
  if (!existed) await requestSynthesis(value, output);
  const bytes = await fsp.readFile(output);
  return { dataUrl: `data:audio/wav;base64,${bytes.toString("base64")}`, cacheHit: existed, voice: "candidate-3" };
}

function stop() {
  rejectAll(Object.assign(new Error("ChatTTS stopped"), { code: "CHATTTS_STOPPED" }));
  try { worker?.kill(); } catch {}
  worker = null;
  workerReady = null;
}

module.exports = { status, synthesize, stop };
