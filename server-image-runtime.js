"use strict";

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.LEXIFLOW_PORT || 4177);
const JOB_TTL_MS = 30 * 60 * 1000;
const MAX_JOBS = 40;
const DATA_DIR = process.env.LEXIFLOW_DATA_DIR || path.join(__dirname, "data");
const GENERATED_DIR = process.env.LEXIFLOW_GENERATED_DIR || (process.env.LEXIFLOW_DATA_DIR ? path.join(DATA_DIR, "generated") : path.join(__dirname, "generated"));
const LEARNING_FILE = path.join(DATA_DIR, "learning-data.json");
const imageJobs = new Map();
let imageWorkerQueue = Promise.resolve();
let resetGeneration = 0;

const originalCreateServer = http.createServer.bind(http);

function sendJson(res, status, value) {
  if (res.headersSent) return;
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function readJsonBody(req, maxBytes = 2 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function writeJsonAtomic(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tempFile = `${filePath}.${process.pid}.reset.tmp`;
  await fsp.writeFile(tempFile, JSON.stringify(value, null, 2), "utf8");
  await fsp.rename(tempFile, filePath);
}

async function readLearningSnapshot() {
  try {
    const parsed = JSON.parse(await fsp.readFile(LEARNING_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function removeGeneratedImages() {
  await fsp.mkdir(GENERATED_DIR, { recursive: true });
  let names = [];
  try { names = await fsp.readdir(GENERATED_DIR); } catch { return { removed: 0, failed: 0 }; }
  let removed = 0;
  let failed = 0;
  for (const name of names) {
    if (!/\.(png|jpe?g|webp)$/i.test(name)) continue;
    try {
      await fsp.unlink(path.join(GENERATED_DIR, name));
      removed++;
    } catch {
      failed++;
    }
  }
  return { removed, failed };
}

function generatedFileFromUrl(value) {
  try {
    const raw = String(value || "");
    if (!raw.startsWith("/generated/")) return "";
    const name = decodeURIComponent(raw.slice("/generated/".length));
    if (!name || path.basename(name) !== name || !/\.(png|jpe?g|webp)$/i.test(name)) return "";
    return path.join(GENERATED_DIR, name);
  } catch { return ""; }
}

async function removeGeneratedUrl(value) {
  const filePath = generatedFileFromUrl(value);
  if (!filePath) return;
  try { await fsp.unlink(filePath); } catch {}
}

async function resetLearningStorage() {
  resetGeneration++;
  for (const job of imageJobs.values()) {
    if (job.status === "queued") {
      job.status = "failed";
      job.code = "RESET_CANCELLED";
      job.error = "学习数据已清除，图片任务已取消";
      job.finishedAt = new Date().toISOString();
      job.finishedAtMs = Date.now();
      delete job.body;
    }
  }

  const previous = await readLearningSnapshot();
  const fresh = {
    version: Number(previous.version) || 1,
    cards: [],
    activities: [],
    settings: { ...(previous.settings || {}) },
    createdAt: new Date().toISOString(),
  };
  await writeJsonAtomic(LEARNING_FILE, fresh);
  const cleanup = await removeGeneratedImages();
  return { data: fresh, cleanup };
}

function jobSnapshot(job) {
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt || "",
    finishedAt: job.finishedAt || "",
    image: job.image || null,
    code: job.code || "",
    error: job.error || "",
    userError: job.userError || null,
  };
}

function bodySignature(body) {
  return JSON.stringify([
    String(body?.word || "").trim().toLowerCase(),
    String(body?.meaningZh || "").trim(),
    String(body?.visualNote || "").trim(),
    String(body?.suggestedScene || "").trim(),
    String(body?.senseIntentEn || "").trim(),
  ]);
}

function cleanupJobs() {
  const now = Date.now();
  for (const [id, job] of imageJobs) {
    if ((job.status === "succeeded" || job.status === "failed") && now - Number(job.finishedAtMs || job.createdAtMs) > JOB_TTL_MS) {
      imageJobs.delete(id);
    }
  }

  if (imageJobs.size <= MAX_JOBS) return;
  const removable = Array.from(imageJobs.values())
    .filter(job => job.status === "succeeded" || job.status === "failed")
    .sort((a, b) => a.createdAtMs - b.createdAtMs);
  while (imageJobs.size > MAX_JOBS && removable.length) {
    imageJobs.delete(removable.shift().id);
  }
}

function existingActiveJob(signature) {
  for (const job of imageJobs.values()) {
    if (job.signature === signature && (job.status === "queued" || job.status === "running")) return job;
  }
  return null;
}

async function runImageJob(job) {
  if (!job || job.status !== "queued") return;
  job.status = "running";
  job.startedAt = new Date().toISOString();

  try {
    const response = await fetch(`http://${HOST}:${PORT}/api/ai/image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-LexiFlow-Image-Job": job.id,
      },
      body: JSON.stringify(job.body),
    });

    let payload = {};
    try { payload = await response.json(); } catch {}

    if (!response.ok || !payload?.image?.url) {
      const err = new Error(payload?.error || `图片任务失败：HTTP ${response.status}`);
      err.code = payload?.code || "IMAGE_JOB_FAILED";
      err.userError = payload?.userError || null;
      throw err;
    }

    if (job.generation !== resetGeneration) {
      await removeGeneratedUrl(payload.image.url);
      const err = new Error("学习数据已清除，图片任务结果已丢弃");
      err.code = "RESET_CANCELLED";
      throw err;
    }

    job.status = "succeeded";
    job.image = payload.image;
  } catch (err) {
    job.status = "failed";
    job.code = String(err?.code || "IMAGE_JOB_FAILED");
    job.error = String(err?.message || "图片没有生成成功");
    job.userError = err?.userError || {
      code: job.code,
      title: job.code === "RESET_CANCELLED" ? "图片任务已取消" : "图片没有生成成功",
      message: job.code === "RESET_CANCELLED" ? "学习数据已经清除，这次图片结果不会保留。" : "图片任务已经结束，但没有得到可用图片。可以重试或上传自己的图片。",
    };
  } finally {
    job.finishedAt = new Date().toISOString();
    job.finishedAtMs = Date.now();
    delete job.body;
    cleanupJobs();
  }
}

function enqueueImageJob(job) {
  imageWorkerQueue = imageWorkerQueue.then(
    () => runImageJob(job),
    () => runImageJob(job)
  );
  imageWorkerQueue = imageWorkerQueue.catch(() => {});
}

function createImageJob(body) {
  cleanupJobs();
  const signature = bodySignature(body);
  const active = existingActiveJob(signature);
  if (active) return active;

  const now = Date.now();
  const job = {
    id: crypto.randomUUID ? crypto.randomUUID() : `img-${now}-${Math.random().toString(16).slice(2)}`,
    signature,
    generation: resetGeneration,
    status: "queued",
    body: { ...(body || {}) },
    createdAt: new Date(now).toISOString(),
    createdAtMs: now,
    startedAt: "",
    finishedAt: "",
    finishedAtMs: 0,
    image: null,
    code: "",
    error: "",
    userError: null,
  };

  imageJobs.set(job.id, job);
  enqueueImageJob(job);
  return job;
}

http.createServer = function lexiFlowRuntimeCreateServer(listener) {
  return originalCreateServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

      // The outer runtime strips Origin before forwarding trusted local requests.
      // If server-image-runtime is reached directly with a browser Origin, defer to
      // server.js so its normal local-origin policy remains authoritative.
      if (!req.headers.origin && req.method === "POST" && url.pathname === "/api/learning-data/reset") {
        try {
          const result = await resetLearningStorage();
          return sendJson(res, 200, {
            ok: true,
            data: result.data,
            imagesRemoved: result.cleanup.removed,
            imageCleanupFailed: result.cleanup.failed,
            cleanupComplete: result.cleanup.failed === 0,
          });
        } catch (err) {
          console.error("learning reset failed:", err?.message || err);
          return sendJson(res, 500, {
            ok: false,
            code: "LEARNING_RESET_FAILED",
            error: "学习数据没有完整清除",
          });
        }
      }

      if (req.method === "POST" && url.pathname === "/api/ai/image-jobs") {
        const body = await readJsonBody(req);
        if (!String(body?.word || "").trim()) {
          return sendJson(res, 400, {
            ok: false,
            code: "INVALID_INPUT",
            error: "缺少目标单词",
            userError: { code: "INVALID_INPUT", title: "暂时不能生成图片", message: "缺少目标单词，请返回学习卡后重试。" },
          });
        }
        const job = createImageJob(body);
        return sendJson(res, 202, { ok: true, job: jobSnapshot(job) });
      }

      if (req.method === "GET" && url.pathname.startsWith("/api/ai/image-jobs/")) {
        cleanupJobs();
        const id = decodeURIComponent(url.pathname.slice("/api/ai/image-jobs/".length));
        const job = imageJobs.get(id);
        if (!job) {
          return sendJson(res, 404, {
            ok: false,
            code: "IMAGE_JOB_NOT_FOUND",
            error: "图片任务不存在或已经过期",
          });
        }
        return sendJson(res, 200, { ok: true, job: jobSnapshot(job) });
      }
    } catch (err) {
      if (url?.pathname?.startsWith("/api/ai/image-jobs")) {
        return sendJson(res, 500, {
          ok: false,
          code: "IMAGE_JOB_RUNTIME_ERROR",
          error: "图片任务服务暂时不可用",
        });
      }
    }

    return listener(req, res);
  });
};

let backend;
try {
  backend = require("./server");
} finally {
  http.createServer = originalCreateServer;
}

async function startServer() {
  return backend.startServer();
}

function stopServer() {
  return backend.stopServer();
}

if (require.main === module) {
  startServer().catch(err => {
    console.error("LexiFlow startup failed:", err);
    process.exitCode = 1;
  });
}

module.exports = { startServer, stopServer };
