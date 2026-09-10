"use strict";

const http = require("http");
const crypto = require("crypto");

const HOST = "127.0.0.1";
const PORT = Number(process.env.LEXIFLOW_PORT || 4177);
const JOB_TTL_MS = 30 * 60 * 1000;
const MAX_JOBS = 40;
const imageJobs = new Map();

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

    job.status = "succeeded";
    job.image = payload.image;
  } catch (err) {
    job.status = "failed";
    job.code = String(err?.code || "IMAGE_JOB_FAILED");
    job.error = String(err?.message || "图片没有生成成功");
    job.userError = err?.userError || {
      code: job.code,
      title: "图片没有生成成功",
      message: "图片任务已经结束，但没有得到可用图片。可以重试或上传自己的图片。",
    };
  } finally {
    job.finishedAt = new Date().toISOString();
    job.finishedAtMs = Date.now();
    delete job.body;
    cleanupJobs();
  }
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
  setImmediate(() => { void runImageJob(job); });
  return job;
}

http.createServer = function lexiFlowRuntimeCreateServer(listener) {
  return originalCreateServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

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
