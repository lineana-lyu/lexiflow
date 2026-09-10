(() => {
  "use strict";

  const nativeFetch = window.fetch.bind(window);
  const IMAGE_JOB_TIMEOUT_MS = 165000;
  let activeImageJob = null;
  let clearJobTimer = null;

  function endpointOf(input) {
    try {
      const raw = typeof input === "string" ? input : input?.url || "";
      return new URL(raw, location.href).pathname;
    } catch {
      return "";
    }
  }

  function absoluteEndpoint(input, pathname) {
    const raw = typeof input === "string" ? input : input?.url || location.href;
    const url = new URL(raw, location.href);
    url.pathname = pathname;
    url.search = "";
    url.hash = "";
    return url.toString();
  }

  function parseBody(init) {
    if (!init || typeof init.body !== "string") return null;
    try { return JSON.parse(init.body); } catch { return null; }
  }

  function requestWithJson(init, body) {
    return {
      ...(init || {}),
      method: String(init?.method || "POST").toUpperCase(),
      headers: { "Content-Type": "application/json", ...((init && init.headers) || {}) },
      body: JSON.stringify(body),
    };
  }

  function jsonResponse(status, value, sourceResponse = null) {
    const headers = new Headers(sourceResponse?.headers || {});
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.delete("Content-Length");
    return new Response(JSON.stringify(value), {
      status,
      statusText: sourceResponse?.statusText || "",
      headers,
    });
  }

  function hasChinese(value) {
    return /[\u3400-\u9fff]/.test(String(value || ""));
  }

  function compactChinese(value) {
    return String(value || "").trim().replace(/[。；;，,]+$/g, "");
  }

  function preferredChineseMeaning(query, result) {
    const normalized = compactChinese(result?.normalizedQuery || "");
    const source = compactChinese(query || "");
    if (normalized && hasChinese(normalized) && normalized.length <= 12) return normalized;
    if (source && hasChinese(source) && source.length <= 12) return source;
    return "";
  }

  function normalizeSmartSearch(data, query) {
    if (!data?.result || !hasChinese(query)) return data;
    const shortMeaning = preferredChineseMeaning(query, data.result);
    if (!shortMeaning) return data;

    const senses = Array.isArray(data.result.senses) ? data.result.senses : [];
    data.result.senses = senses.map((sense, index) => {
      if (index !== 0) return sense;
      const original = compactChinese(sense?.meaningZh || "");
      if (!original || original === shortMeaning) return { ...sense, meaningZh: shortMeaning };
      return {
        ...sense,
        meaningZh: shortMeaning,
        glossZh: sense.glossZh || original,
      };
    });
    data.result.displayMeaningZh = shortMeaning;
    return data;
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function setImageJobState(next) {
    activeImageJob = next ? { ...(activeImageJob || {}), ...next } : null;
    renderImageJobIndicator();

    if (clearJobTimer) clearTimeout(clearJobTimer);
    clearJobTimer = null;
    if (activeImageJob && (activeImageJob.status === "succeeded" || activeImageJob.status === "failed")) {
      clearJobTimer = setTimeout(() => {
        activeImageJob = null;
        renderImageJobIndicator();
      }, activeImageJob.status === "succeeded" ? 3200 : 5200);
    }
  }

  function renderImageJobIndicator() {
    let pill = document.querySelector(".runtime-image-job-pill");
    if (!activeImageJob) {
      pill?.remove();
      return;
    }

    const visualStageVisible = Boolean(document.querySelector(".visual-learning-stage"));
    if (visualStageVisible && (activeImageJob.status === "queued" || activeImageJob.status === "running")) {
      pill?.remove();
      return;
    }

    if (!pill) {
      pill = document.createElement("div");
      pill.className = "runtime-image-job-pill";
      pill.setAttribute("role", "status");
      pill.setAttribute("aria-live", "polite");
      document.body.appendChild(pill);
    }

    const word = String(activeImageJob.word || "联想图");
    if (activeImageJob.status === "succeeded") {
      pill.className = "runtime-image-job-pill success";
      pill.innerHTML = `<span class="runtime-job-check">✓</span><div><strong>联想图已完成</strong><span>${escapeHtml(word)} · 已自动保存到单词卡</span></div>`;
    } else if (activeImageJob.status === "failed") {
      pill.className = "runtime-image-job-pill error";
      pill.innerHTML = `<span class="runtime-job-mark">!</span><div><strong>联想图没有生成成功</strong><span>${escapeHtml(word)} · 可以稍后重试或上传图片</span></div>`;
    } else {
      pill.className = "runtime-image-job-pill running";
      pill.innerHTML = `<span class="runtime-job-spinner"></span><div><strong>联想图正在后台生成</strong><span>${escapeHtml(word)} · 可以继续下一步</span></div>`;
    }
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  async function pollImageJob(input, init, body) {
    const createUrl = absoluteEndpoint(input, "/api/ai/image-jobs");
    let createResponse;

    try {
      createResponse = await nativeFetch(createUrl, requestWithJson({ method: "POST" }, body));
    } catch {
      return nativeFetch(input, init);
    }

    // Compatibility fallback: an older backend can still use the original long request.
    if (createResponse.status === 404 || createResponse.status === 405) {
      return nativeFetch(input, init);
    }
    if (!createResponse.ok) return createResponse;

    let created = {};
    try { created = await createResponse.clone().json(); } catch {}
    const jobId = String(created?.job?.id || "");
    if (!jobId) return nativeFetch(input, init);

    const word = String(body?.word || "").trim();
    setImageJobState({ id: jobId, word, status: created?.job?.status || "queued" });

    const statusUrl = absoluteEndpoint(input, `/api/ai/image-jobs/${encodeURIComponent(jobId)}`);
    const startedAt = Date.now();
    let failedPolls = 0;

    while (Date.now() - startedAt < IMAGE_JOB_TIMEOUT_MS) {
      const elapsed = Date.now() - startedAt;
      await delay(elapsed < 8000 ? 850 : elapsed < 30000 ? 1300 : 2200);

      let statusResponse;
      try {
        statusResponse = await nativeFetch(statusUrl, { method: "GET", cache: "no-store" });
      } catch {
        failedPolls += 1;
        if (failedPolls < 4) continue;
        setImageJobState({ id: jobId, word, status: "failed" });
        return jsonResponse(502, {
          ok: false,
          code: "IMAGE_JOB_STATUS_UNAVAILABLE",
          error: "暂时无法读取图片任务状态",
          userError: {
            code: "IMAGE_JOB_STATUS_UNAVAILABLE",
            title: "图片任务状态暂时不可用",
            message: "图片可能仍在后台生成。你可以继续学习，稍后回到单词卡查看。",
          },
        });
      }

      if (!statusResponse.ok) {
        if (statusResponse.status === 404) {
          setImageJobState({ id: jobId, word, status: "failed" });
          return jsonResponse(502, {
            ok: false,
            code: "IMAGE_JOB_NOT_FOUND",
            error: "图片任务已失效",
            userError: {
              code: "IMAGE_JOB_NOT_FOUND",
              title: "图片任务已失效",
              message: "这次后台任务没有保留下来，请重新生成。",
            },
          }, statusResponse);
        }
        continue;
      }

      failedPolls = 0;
      let payload = {};
      try { payload = await statusResponse.clone().json(); } catch {}
      const job = payload?.job || {};
      const status = String(job.status || "running");
      setImageJobState({ id: jobId, word, status });

      if (status === "succeeded" && job.image?.url) {
        return jsonResponse(200, { ok: true, image: job.image }, statusResponse);
      }

      if (status === "failed") {
        return jsonResponse(502, {
          ok: false,
          code: job.code || "IMAGE_JOB_FAILED",
          error: job.error || job.userError?.message || "图片没有生成成功",
          userError: job.userError || {
            code: job.code || "IMAGE_JOB_FAILED",
            title: "图片没有生成成功",
            message: "这次后台图片任务没有得到可用结果，可以重新生成或上传自己的图片。",
          },
        }, statusResponse);
      }
    }

    setImageJobState({ id: jobId, word, status: "failed" });
    return jsonResponse(504, {
      ok: false,
      code: "IMAGE_JOB_TIMEOUT",
      error: "图片生成时间过长",
      userError: {
        code: "IMAGE_JOB_TIMEOUT",
        title: "图片还没有生成完成",
        message: "等待时间已经较长。你可以继续学习，稍后重新生成或上传自己的图片。",
      },
    });
  }

  window.fetch = async function lexiFlowTransportFetch(input, init = {}) {
    const endpoint = endpointOf(input);
    const body = parseBody(init);

    if (endpoint === "/api/search/smart" && body?.query && hasChinese(body.query)) {
      const response = await nativeFetch(input, init);
      if (!response.ok) return response;
      try {
        const data = await response.clone().json();
        return jsonResponse(response.status, normalizeSmartSearch(data, body.query), response);
      } catch {
        return response;
      }
    }

    if (endpoint === "/api/ai/image" && body) {
      return pollImageJob(input, init, body);
    }

    return nativeFetch(input, init);
  };

  const observer = new MutationObserver(() => renderImageJobIndicator());
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      observer.observe(document.body, { childList: true, subtree: true });
      renderImageJobIndicator();
    }, { once: true });
  } else {
    observer.observe(document.body, { childList: true, subtree: true });
    renderImageJobIndicator();
  }
})();
