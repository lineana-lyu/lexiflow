"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");

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

let modelPromise = null;
let state = {
  status: "idle",
  progress: 0,
  file: "",
  error: "",
  readyAt: "",
};
const inflight = new Map();

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
    ...state,
  };
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
}

async function loadModel() {
  if (modelPromise) return modelPromise;
  state = { status: "loading", progress: 0, file: "", error: "", readyAt: "" };
  modelPromise = (async () => {
    await Promise.all([
      fsp.mkdir(MODEL_CACHE_DIR, { recursive: true }),
      fsp.mkdir(AUDIO_CACHE_DIR, { recursive: true }),
    ]);
    const { KokoroTTS, env } = require("kokoro-js");
    env.cacheDir = MODEL_CACHE_DIR;
    const tts = await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: DTYPE,
      device: DEVICE,
      progress_callback: updateProgress,
    });
    state = {
      status: "ready",
      progress: 100,
      file: "",
      error: "",
      readyAt: new Date().toISOString(),
    };
    return tts;
  })().catch(err => {
    state = {
      status: "error",
      progress: 0,
      file: "",
      error: clean(err?.message || err) || "Kokoro model failed to load",
      readyAt: "",
    };
    modelPromise = null;
    throw err;
  });
  return modelPromise;
}

async function prepare() {
  await loadModel();
  return status();
}

async function synthesize(text, options = {}) {
  const value = clean(text).slice(0, 600);
  if (!value) throw Object.assign(new Error("empty text"), { code: "KOKORO_EMPTY" });
  const voice = normalizeVoice(options.voice);
  const speed = normalizeSpeed(options.speed);
  const key = crypto.createHash("sha256").update(`${MODEL_ID}\n${DTYPE}\n${voice}\n${speed}\n${value}`).digest("hex").slice(0, 40);
  await fsp.mkdir(AUDIO_CACHE_DIR, { recursive: true });
  const output = path.join(AUDIO_CACHE_DIR, `${key}.wav`);
  const cachedBefore = fs.existsSync(output);
  if (cachedBefore) {
    const bytes = await fsp.readFile(output);
    return { dataUrl: `data:audio/wav;base64,${bytes.toString("base64")}`, cacheHit: true, voice, speed };
  }

  if (!inflight.has(key)) {
    inflight.set(key, (async () => {
      const tts = await loadModel();
      const audio = await tts.generate(value, { voice, speed });
      await audio.save(output);
      return output;
    })().finally(() => inflight.delete(key)));
  }
  await inflight.get(key);
  const bytes = await fsp.readFile(output);
  return { dataUrl: `data:audio/wav;base64,${bytes.toString("base64")}`, cacheHit: false, voice, speed };
}

module.exports = {
  DEFAULT_VOICE,
  VOICES,
  status,
  prepare,
  synthesize,
};
