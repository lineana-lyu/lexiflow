"use strict";

const { parentPort } = require("worker_threads");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = process.env.LEXIFLOW_DATA_DIR || path.join(ROOT, "data");
const MODEL_CACHE_DIR = path.join(DATA_DIR, "models", "kokoro");
const AUDIO_CACHE_DIR = path.join(DATA_DIR, "tts-cache", "kokoro");
const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const MODEL_FILE = "model_quantized.onnx";
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

let modelPromise = null;
let generationTail = Promise.resolve();
let state = {
  status: "idle",
  progress: 0,
  file: "",
  error: "",
  readyAt: "",
  synthesizing: false,
  repairedCorruptCache: false,
};

function clean(value) {
  return String(value || "").trim();
}

function normalizeVoice(value) {
  const id = clean(value);
  return Object.prototype.hasOwnProperty.call(VOICES, id) ? id : DEFAULT_VOICE;
}

function normalizeSpeed(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.94;
  return Math.max(0.75, Math.min(1.2, n));
}

function snapshot() {
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
    cpuThreadLimit: 1,
    ...state,
  };
}

function emitStatus() {
  parentPort.postMessage({ type: "status", status: snapshot() });
}

function updateProgress(event) {
  const next = { ...state };
  const eventStatus = clean(event?.status);
  const file = clean(event?.file || event?.name);
  if (file) next.file = file;
  if (eventStatus === "progress" || eventStatus === "download") {
    next.status = "downloading";
    const p = Number(event?.progress);
    if (Number.isFinite(p)) next.progress = Math.max(0, Math.min(100, p));
    else if (Number(event?.total) > 0 && Number(event?.loaded) >= 0) {
      next.progress = Math.max(0, Math.min(100, Number(event.loaded) / Number(event.total) * 100));
    }
  } else if (eventStatus === "initiate" || eventStatus === "ready") {
    if (next.status !== "downloading") next.status = "loading";
  }
  state = next;
  emitStatus();
}

async function configureModelCache() {
  // Use the ESM entrypoint deliberately. Transformers.js has had CommonJS
  // cache-path issues in desktop/Node runtimes; the ESM path honors env.cacheDir
  // reliably and keeps model files in LexiFlow's app-data directory.
  const kokoro = await import("kokoro-js");
  if (kokoro?.env) kokoro.env.cacheDir = MODEL_CACHE_DIR;

  // Configure the same external Transformers.js module explicitly as a second
  // guard. kokoro-js lists it as a Node external dependency.
  try {
    const transformers = await import("@huggingface/transformers");
    if (transformers?.env) transformers.env.cacheDir = MODEL_CACHE_DIR;
  } catch {}

  return kokoro.KokoroTTS;
}

function isProtobufModelError(err) {
  const message = clean(err?.message || err);
  return /protobuf parsing failed/i.test(message) && /model_quantized\.onnx/i.test(message);
}

function modelPathFromError(err) {
  const message = clean(err?.message || err);
  const match = message.match(/Load model from\s+(.+?model_quantized\.onnx)\s+failed:/i);
  return match ? clean(match[1]) : "";
}

function isSafeKokoroModelPath(filePath) {
  if (!filePath) return false;
  const normalized = path.normalize(filePath);
  const lowered = normalized.toLowerCase();
  return path.basename(lowered) === MODEL_FILE && lowered.includes(`${path.sep}kokoro-82m-v1.0-onnx${path.sep}`);
}

async function removeCorruptModel(filePath) {
  if (!isSafeKokoroModelPath(filePath)) return false;
  try {
    await fsp.unlink(filePath);
    return true;
  } catch (err) {
    if (err?.code === "ENOENT") return true;
    return false;
  }
}

async function repairCorruptModelCache(err) {
  if (!isProtobufModelError(err)) return false;
  const failedPath = modelPathFromError(err);
  const removed = await removeCorruptModel(failedPath);
  if (!removed) return false;

  state = {
    ...state,
    status: "loading",
    progress: 0,
    file: "检测到损坏的模型缓存，已清理并准备重新下载",
    error: "",
    readyAt: "",
    repairedCorruptCache: true,
  };
  emitStatus();
  return true;
}

async function createModel() {
  const KokoroTTS = await configureModelCache();
  return KokoroTTS.from_pretrained(MODEL_ID, {
    dtype: DTYPE,
    device: DEVICE,
    progress_callback: updateProgress,
  });
}

async function loadModel() {
  if (modelPromise) return modelPromise;
  state = { ...state, status: "loading", progress: 0, file: "", error: "", readyAt: "" };
  emitStatus();
  modelPromise = (async () => {
    await Promise.all([
      fsp.mkdir(MODEL_CACHE_DIR, { recursive: true }),
      fsp.mkdir(AUDIO_CACHE_DIR, { recursive: true }),
    ]);

    let tts;
    try {
      tts = await createModel();
    } catch (err) {
      const repaired = await repairCorruptModelCache(err);
      if (!repaired) throw err;
      // A protobuf parsing failure means a truncated/non-ONNX file was cached.
      // Retry once after deleting exactly that model file. Transformers.js will
      // download the missing file again and partial unrelated assets are kept.
      tts = await createModel();
    }

    state = {
      ...state,
      status: "ready",
      progress: 100,
      file: "",
      error: "",
      readyAt: new Date().toISOString(),
    };
    emitStatus();
    return tts;
  })().catch(err => {
    state = {
      ...state,
      status: "error",
      progress: 0,
      file: "",
      error: clean(err?.message || err) || "Kokoro model failed to load",
      readyAt: "",
      synthesizing: false,
    };
    emitStatus();
    modelPromise = null;
    throw err;
  });
  return modelPromise;
}

async function prepare() {
  await loadModel();
  return snapshot();
}

async function synthesizeToFile(text, options = {}) {
  const value = clean(text).slice(0, 600);
  if (!value) throw Object.assign(new Error("empty text"), { code: "KOKORO_EMPTY" });
  const voice = normalizeVoice(options.voice);
  const speed = normalizeSpeed(options.speed);
  const key = crypto.createHash("sha256").update(`${MODEL_ID}\n${DTYPE}\n${voice}\n${speed}\n${value}`).digest("hex").slice(0, 40);
  await fsp.mkdir(AUDIO_CACHE_DIR, { recursive: true });
  const output = path.join(AUDIO_CACHE_DIR, `${key}.wav`);
  if (fs.existsSync(output)) return { output, cacheHit: true, voice, speed };

  const tts = await loadModel();
  state = { ...state, synthesizing: true };
  emitStatus();
  try {
    const audio = await tts.generate(value, { voice, speed });
    await audio.save(output);
    return { output, cacheHit: false, voice, speed };
  } finally {
    state = { ...state, synthesizing: false };
    emitStatus();
  }
}

function queueSynthesis(text, options) {
  const task = generationTail.then(() => synthesizeToFile(text, options));
  generationTail = task.catch(() => {});
  return task;
}

function serializeError(err) {
  return {
    message: clean(err?.message || err) || "Kokoro worker failed",
    code: clean(err?.code) || "KOKORO_FAILED",
    stack: clean(err?.stack),
  };
}

parentPort.on("message", message => {
  const id = message?.id;
  const op = clean(message?.op);
  const payload = message?.payload || {};
  let task;
  if (op === "status") task = Promise.resolve(snapshot());
  else if (op === "prepare") task = prepare();
  else if (op === "synthesize") task = queueSynthesis(payload.text, payload.options || {});
  else task = Promise.reject(Object.assign(new Error(`unknown Kokoro worker op: ${op}`), { code: "KOKORO_BAD_OP" }));

  task.then(result => {
    parentPort.postMessage({ type: "result", id, ok: true, result });
  }).catch(err => {
    parentPort.postMessage({ type: "result", id, ok: false, error: serializeError(err) });
  });
});

emitStatus();
