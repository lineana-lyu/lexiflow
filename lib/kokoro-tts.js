"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { Worker } = require("worker_threads");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = process.env.LEXIFLOW_DATA_DIR || path.join(ROOT, "data");
const MODEL_CACHE_DIR = path.join(DATA_DIR, "models", "kokoro");
const AUDIO_CACHE_DIR = path.join(DATA_DIR, "tts-cache", "kokoro");
const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const DTYPE = "q8";
const DEVICE = "cpu";
const DEFAULT_VOICE = "af_bella";

const VOICES = Object.freeze({
  af_bella: { id: "af_bella", name: "Bella", locale: "en-US", gender: "female", label: "美式女声 · Bella" },
  af_heart: { id: "af_heart", name: "Heart", locale: "en-US", gender: "female", label: "美式女声 · Heart" },
  af_nicole: { id: "af_nicole", name: "Nicole", locale: "en-US", gender: "female", label: "美式女声 · Nicole" },
  am_michael: { id: "am_michael", name: "Michael", locale: "en-US", gender: "male", label: "美式男声 · Michael" },
  bf_emma: { id: "bf_emma", name: "Emma", locale: "en-GB", gender: "female", label: "英式女声 · Emma" },
  bm_george: { id: "bm_george", name: "George", locale: "en-GB", gender: "male", label: "英式男声 · George" },
});

let worker = null;
let requestSeq = 0;
const pending = new Map();
let state = {
  status: "idle",
  progress: 0,
  file: "",
  error: "",
  readyAt: "",
  synthesizing: false,
};

function clean(value) {
  return String(value || "").trim();
}

function status() {
  return {
    engine: "kokoro-82m",
    modelId: MODEL_ID,
    dtype: DTYPE,
    device: DEVICE,
    defaultVoice: DEFAULT_VOICE,
    voices: Object.values(VOICES),
    modelCacheDir: MODEL_CACHE_DIR,
    audioCacheDir: AUDIO_CACHE_DIR,
    workerIsolated: true,
    workerRunning: Boolean(worker),
    ...state,
  };
}

function resolveWorkerPath() {
  const regular = path.join(__dirname, "kokoro-worker.js");
  if (regular.includes("app.asar")) {
    const unpacked = regular.replace("app.asar", "app.asar.unpacked");
    try {
      if (fs.existsSync(unpacked)) return unpacked;
    } catch {}
  }
  return regular;
}

function rejectPending(error) {
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(error);
  }
  pending.clear();
}

function ensureWorker() {
  if (worker) return worker;
  const workerPath = resolveWorkerPath();
  worker = new Worker(workerPath, { env: { ...process.env } });
  worker.on("message", message => {
    if (message?.type === "status" && message.status) {
      const next = message.status;
      state = {
        status: clean(next.status) || state.status,
        progress: Number.isFinite(Number(next.progress)) ? Number(next.progress) : state.progress,
        file: clean(next.file),
        error: clean(next.error),
        readyAt: clean(next.readyAt),
        synthesizing: Boolean(next.synthesizing),
      };
      return;
    }
    if (message?.type !== "result") return;
    const request = pending.get(String(message.id));
    if (!request) return;
    pending.delete(String(message.id));
    clearTimeout(request.timer);
    if (message.ok) request.resolve(message.result);
    else {
      const err = new Error(clean(message.error?.message) || "Kokoro worker failed");
      err.code = clean(message.error?.code) || "KOKORO_FAILED";
      if (message.error?.stack) err.stack = message.error.stack;
      request.reject(err);
    }
  });
  worker.on("error", err => {
    state = { ...state, status: "error", error: clean(err?.message || err), synthesizing: false };
    rejectPending(err);
    worker = null;
  });
  worker.on("exit", code => {
    const expected = code === 0;
    if (!expected) {
      const err = Object.assign(new Error(`Kokoro worker exited ${code}`), { code: "KOKORO_WORKER_EXIT" });
      state = { ...state, status: "error", error: err.message, synthesizing: false };
      rejectPending(err);
    }
    worker = null;
  });
  return worker;
}

function callWorker(op, payload = {}, timeoutMs = 15 * 60 * 1000) {
  const id = String(++requestSeq);
  const current = ensureWorker();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Object.assign(new Error(`Kokoro ${op} timed out`), { code: "KOKORO_TIMEOUT" }));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    try {
      current.postMessage({ id, op, payload });
    } catch (err) {
      clearTimeout(timer);
      pending.delete(id);
      reject(err);
    }
  });
}

async function prepare() {
  await callWorker("prepare", {}, 15 * 60 * 1000);
  return status();
}

async function synthesize(text, options = {}) {
  const value = clean(text).slice(0, 600);
  if (!value) throw Object.assign(new Error("empty text"), { code: "KOKORO_EMPTY" });
  const result = await callWorker("synthesize", { text: value, options }, 15 * 60 * 1000);
  const output = clean(result?.output);
  if (!output) throw Object.assign(new Error("Kokoro worker returned no audio file"), { code: "KOKORO_NO_AUDIO" });
  const bytes = await fsp.readFile(output);
  return {
    dataUrl: `data:audio/wav;base64,${bytes.toString("base64")}`,
    cacheHit: Boolean(result.cacheHit),
    voice: clean(result.voice) || DEFAULT_VOICE,
    speed: Number(result.speed) || 0.94,
  };
}

async function stop() {
  const current = worker;
  worker = null;
  rejectPending(Object.assign(new Error("Kokoro worker stopped"), { code: "KOKORO_STOPPED" }));
  if (current) {
    try { await current.terminate(); } catch {}
  }
}

module.exports = {
  DEFAULT_VOICE,
  VOICES,
  status,
  prepare,
  synthesize,
  stop,
};
