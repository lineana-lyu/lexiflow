const fs = require('fs');

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`patch target not found: ${label}`);
  return source.replace(from, to);
}

const serverPath = 'server.js';
let s = fs.readFileSync(serverPath, 'utf8');

const spawnAnchor = `function spawnCodex(args, options = {}) {
  const executable = detectCodexExecutable();
  return spawn(executable, args, {
    cwd: options.cwd || ROOT,
    windowsHide: true,
    shell: commandNeedsShell(executable),
    env: { ...process.env, NO_COLOR: "1", CI: "1" },
  });
}
`;

const appServerCode = String.raw`

const CODEX_APP_SERVER_START_TIMEOUT_MS = 7000;
const CODEX_APP_SERVER_REQUEST_TIMEOUT_MS = 8000;
const CODEX_APP_SERVER_COOLDOWN_MS = 5 * 60 * 1000;
const CODEX_FAST_THREAD_MAX_TURNS = 18;
const CODEX_FAST_THREAD_IDLE_MS = 10 * 60 * 1000;

const codexAppServerState = {
  child: null,
  starting: null,
  buffer: "",
  stderrTail: [],
  nextId: 1,
  pending: new Map(),
  turns: new Map(),
  ready: false,
  disabledUntil: 0,
  threadId: "",
  threadKey: "",
  threadTurns: 0,
  lastUsedAt: 0,
};

let codexFastTextQueue = Promise.resolve();

function appServerPublicStatus() {
  const now = Date.now();
  const state = codexAppServerState.ready
    ? "ready"
    : codexAppServerState.starting
      ? "warming"
      : codexAppServerState.disabledUntil > now
        ? "fallback"
        : "idle";
  return {
    state,
    threadReady: Boolean(codexAppServerState.threadId),
    lastUsedAt: codexAppServerState.lastUsedAt
      ? new Date(codexAppServerState.lastUsedAt).toISOString()
      : "",
    fallbackUntil: codexAppServerState.disabledUntil > now
      ? new Date(codexAppServerState.disabledUntil).toISOString()
      : "",
  };
}

function appServerError(message, code = "CODEX_APP_SERVER_FAILED") {
  const err = new Error(message);
  err.code = code;
  return err;
}

function appServerWrite(payload) {
  const child = codexAppServerState.child;
  if (!child?.stdin?.writable) throw appServerError("Codex app-server transport is closed", "CODEX_APP_SERVER_CLOSED");
  try {
    child.stdin.write(JSON.stringify(payload) + "\n", "utf8");
  } catch (err) {
    throw Object.assign(err, { code: "CODEX_APP_SERVER_WRITE_FAILED" });
  }
}

function rejectCodexAppServerWork(err) {
  for (const pending of codexAppServerState.pending.values()) {
    clearTimeout(pending.timer);
    pending.reject(err);
  }
  codexAppServerState.pending.clear();
  for (const turn of codexAppServerState.turns.values()) {
    clearTimeout(turn.timer);
    if (turn.reject) turn.reject(err);
  }
  codexAppServerState.turns.clear();
}

function clearCodexAppServerState({ kill = true, cooldown = false } = {}) {
  const child = codexAppServerState.child;
  codexAppServerState.child = null;
  codexAppServerState.ready = false;
  codexAppServerState.buffer = "";
  codexAppServerState.threadId = "";
  codexAppServerState.threadKey = "";
  codexAppServerState.threadTurns = 0;
  if (cooldown) codexAppServerState.disabledUntil = Date.now() + CODEX_APP_SERVER_COOLDOWN_MS;
  rejectCodexAppServerWork(appServerError("Codex app-server connection closed", "CODEX_APP_SERVER_CLOSED"));
  if (kill && child && !child.killed) {
    try { child.kill(); } catch {}
  }
}

function invalidateCodexFastThread() {
  codexAppServerState.threadId = "";
  codexAppServerState.threadKey = "";
  codexAppServerState.threadTurns = 0;
}

function getCodexTurnState(turnId) {
  let turn = codexAppServerState.turns.get(turnId);
  if (!turn) {
    turn = { delta: "", finalText: "", completed: false, error: null, resolve: null, reject: null, timer: null };
    codexAppServerState.turns.set(turnId, turn);
  }
  return turn;
}

function settleCodexTurn(turnId) {
  const turn = codexAppServerState.turns.get(turnId);
  if (!turn?.completed || !turn.resolve) return;
  clearTimeout(turn.timer);
  const resolve = turn.resolve;
  turn.resolve = null;
  turn.reject = null;
  codexAppServerState.turns.delete(turnId);
  resolve(turn);
}

function handleCodexAppServerMessage(msg) {
  if (!msg || typeof msg !== "object") return;

  if (msg.method && msg.id !== undefined) {
    let result = {};
    if (msg.method === "item/commandExecution/requestApproval" || msg.method === "item/fileChange/requestApproval") {
      result = { decision: "decline" };
    }
    try { appServerWrite({ id: msg.id, result }); } catch {}
    return;
  }

  if (!msg.method && msg.id !== undefined) {
    const key = String(msg.id);
    const pending = codexAppServerState.pending.get(key);
    if (!pending) return;
    clearTimeout(pending.timer);
    codexAppServerState.pending.delete(key);
    if (msg.error) {
      const err = appServerError(String(msg.error?.message || "Codex app-server request failed"), "CODEX_APP_SERVER_PROTOCOL");
      pending.reject(err);
    } else {
      pending.resolve(msg.result);
    }
    return;
  }

  if (!msg.method) return;
  const params = msg.params || {};
  const turnId = String(params.turnId || params.turn?.id || "");
  if (!turnId) return;
  const turn = getCodexTurnState(turnId);

  if (msg.method === "item/agentMessage/delta") {
    turn.delta += String(params.delta || "");
    return;
  }
  if (msg.method === "item/completed" && params.item?.type === "agentMessage") {
    turn.finalText = String(params.item.text || "");
    return;
  }
  if (msg.method === "turn/completed") {
    turn.completed = true;
    if (params.turn?.error) {
      turn.error = appServerError(
        String(params.turn.error?.message || "Codex app-server turn failed"),
        "CODEX_APP_SERVER_TURN_FAILED"
      );
    }
    settleCodexTurn(turnId);
  }
}

function attachCodexAppServerProcess(child) {
  child.stdout.on("data", chunk => {
    codexAppServerState.buffer += chunk.toString("utf8");
    let newline;
    while ((newline = codexAppServerState.buffer.indexOf("\n")) >= 0) {
      const line = codexAppServerState.buffer.slice(0, newline).trim();
      codexAppServerState.buffer = codexAppServerState.buffer.slice(newline + 1);
      if (!line) continue;
      try { handleCodexAppServerMessage(JSON.parse(line)); } catch {}
    }
  });
  child.stderr.on("data", chunk => {
    const text = chunk.toString("utf8").trim();
    if (!text) return;
    codexAppServerState.stderrTail.push(text.slice(0, 1000));
    if (codexAppServerState.stderrTail.length > 8) codexAppServerState.stderrTail.shift();
  });
  child.on("error", () => {
    if (codexAppServerState.child === child) clearCodexAppServerState({ kill: false, cooldown: true });
  });
  child.on("close", () => {
    if (codexAppServerState.child === child) clearCodexAppServerState({ kill: false, cooldown: true });
  });
}

function codexAppServerRequest(method, params, timeoutMs = CODEX_APP_SERVER_REQUEST_TIMEOUT_MS) {
  const id = String(codexAppServerState.nextId++);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      codexAppServerState.pending.delete(id);
      reject(appServerError(`Codex app-server request timed out: ${method}`, "CODEX_APP_SERVER_REQUEST_TIMEOUT"));
    }, timeoutMs);
    codexAppServerState.pending.set(id, { resolve, reject, timer });
    try {
      appServerWrite({ id, method, params });
    } catch (err) {
      clearTimeout(timer);
      codexAppServerState.pending.delete(id);
      reject(err);
    }
  });
}

async function ensureCodexAppServer() {
  if (codexAppServerState.ready && codexAppServerState.child) return;
  if (codexAppServerState.disabledUntil > Date.now()) {
    throw appServerError("Codex app-server is temporarily disabled", "CODEX_APP_SERVER_UNAVAILABLE");
  }
  if (codexAppServerState.starting) return codexAppServerState.starting;

  codexAppServerState.starting = (async () => {
    const status = codexStatus();
    if (!status.cliAvailable) throw appServerError("Codex CLI is unavailable", "CODEX_NOT_AVAILABLE");

    const child = spawnCodex(["app-server", "--listen", "stdio://"], { cwd: RUNTIME_CWD });
    codexAppServerState.child = child;
    codexAppServerState.stderrTail = [];
    attachCodexAppServerProcess(child);

    try {
      await codexAppServerRequest("initialize", {
        clientInfo: { name: "lexiflow", title: "LexiFlow", version: "0.6.1" },
        capabilities: { experimentalApi: true },
      }, CODEX_APP_SERVER_START_TIMEOUT_MS);
      appServerWrite({ method: "initialized" });
      codexAppServerState.ready = true;
      codexAppServerState.disabledUntil = 0;
    } catch (err) {
      clearCodexAppServerState({ kill: true, cooldown: true });
      throw Object.assign(err, { code: err.code || "CODEX_APP_SERVER_START_FAILED" });
    }
  })();

  try {
    await codexAppServerState.starting;
  } finally {
    codexAppServerState.starting = null;
  }
}

async function ensureCodexFastThread(runtime, effort) {
  await ensureCodexAppServer();
  const model = String(runtime.codexModel || "").trim();
  const key = `${model}|${effort || ""}`;
  const idleTooLong = codexAppServerState.lastUsedAt && Date.now() - codexAppServerState.lastUsedAt > CODEX_FAST_THREAD_IDLE_MS;
  const exhausted = codexAppServerState.threadTurns >= CODEX_FAST_THREAD_MAX_TURNS;

  if (codexAppServerState.threadId && codexAppServerState.threadKey === key && !idleTooLong && !exhausted) {
    return codexAppServerState.threadId;
  }

  invalidateCodexFastThread();
  const response = await codexAppServerRequest("thread/start", {
    ...(model ? { model } : {}),
    cwd: RUNTIME_CWD,
    approvalPolicy: "never",
    sandbox: "read-only",
    ephemeral: true,
  }, 12000);
  const threadId = String(response?.thread?.id || "");
  if (!threadId) throw appServerError("Codex app-server did not return a thread id", "CODEX_APP_SERVER_PROTOCOL");
  codexAppServerState.threadId = threadId;
  codexAppServerState.threadKey = key;
  codexAppServerState.threadTurns = 0;
  codexAppServerState.lastUsedAt = Date.now();
  return threadId;
}

function waitForCodexTurn(turnId, timeoutMs) {
  const turn = getCodexTurnState(turnId);
  if (turn.completed) {
    codexAppServerState.turns.delete(turnId);
    return turn.error ? Promise.reject(turn.error) : Promise.resolve(turn);
  }
  return new Promise((resolve, reject) => {
    turn.resolve = completed => completed.error ? reject(completed.error) : resolve(completed);
    turn.reject = reject;
    turn.timer = setTimeout(() => {
      codexAppServerState.turns.delete(turnId);
      reject(Object.assign(new Error("Codex 调用超时"), { code: "CODEX_TIMEOUT" }));
      clearCodexAppServerState({ kill: true, cooldown: false });
    }, timeoutMs);
    settleCodexTurn(turnId);
  });
}

function shouldFallbackFromCodexAppServer(err) {
  return new Set([
    "CODEX_APP_SERVER_UNAVAILABLE",
    "CODEX_APP_SERVER_START_FAILED",
    "CODEX_APP_SERVER_CLOSED",
    "CODEX_APP_SERVER_WRITE_FAILED",
    "CODEX_APP_SERVER_REQUEST_TIMEOUT",
    "CODEX_APP_SERVER_PROTOCOL",
  ]).has(String(err?.code || ""));
}

async function runCodexFastTextNow(prompt, { timeoutMs = 15000, reasoningEffortOverride = "low" } = {}) {
  const runtime = await loadSettings();
  const effort = String(reasoningEffortOverride || "low").trim().toLowerCase() || "low";
  const startedAt = Date.now();

  try {
    const threadId = await ensureCodexFastThread(runtime, effort);
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(1000, timeoutMs - elapsed);
    const started = await codexAppServerRequest("turn/start", {
      threadId,
      input: [{ type: "text", text: String(prompt || ""), text_elements: [] }],
      ...(runtime.codexModel ? { model: runtime.codexModel } : {}),
      effort,
    }, Math.min(6000, remaining));
    const turnId = String(started?.turn?.id || "");
    if (!turnId) throw appServerError("Codex app-server did not return a turn id", "CODEX_APP_SERVER_PROTOCOL");

    const turn = await waitForCodexTurn(turnId, Math.max(1000, timeoutMs - (Date.now() - startedAt)));
    const stdout = String(turn.finalText || turn.delta || "").trim();
    if (!stdout) throw appServerError("Codex app-server returned empty text", "CODEX_APP_SERVER_PROTOCOL");

    codexAppServerState.threadTurns += 1;
    codexAppServerState.lastUsedAt = Date.now();
    return {
      stdout,
      stderr: "",
      runtime: { model: runtime.codexModel || "", reasoningEffort: effort },
      transport: "app-server",
    };
  } catch (err) {
    if (!shouldFallbackFromCodexAppServer(err)) throw err;
    codexAppServerState.disabledUntil = Math.max(codexAppServerState.disabledUntil, Date.now() + CODEX_APP_SERVER_COOLDOWN_MS);
    const fallback = await runCodex(prompt, {
      timeoutMs,
      workspaceWrite: false,
      reasoningEffortOverride: effort,
    });
    return { ...fallback, transport: "exec-fallback" };
  }
}

function runCodexFastText(prompt, options = {}) {
  const task = codexFastTextQueue.then(
    () => runCodexFastTextNow(prompt, options),
    () => runCodexFastTextNow(prompt, options)
  );
  codexFastTextQueue = task.catch(() => {});
  return task;
}

async function warmCodexAppServer() {
  try { await ensureCodexAppServer(); } catch {}
}

function shutdownCodexAppServer() {
  clearCodexAppServerState({ kill: true, cooldown: false });
}
`;

s = replaceOnce(s, spawnAnchor, spawnAnchor + appServerCode, 'insert app-server transport');

s = replaceOnce(
  s,
  `const result = await runCodex(prompt, {\n      timeoutMs: 30000,\n      workspaceWrite: false,\n      reasoningEffortOverride: "low",\n    });`,
  `const result = await runCodexFastText(prompt, {\n      timeoutMs: 30000,\n      reasoningEffortOverride: "low",\n    });`,
  'dictionary enrichment fast transport'
);

s = replaceOnce(
  s,
  `const result = await runCodex(prompt, {\n    timeoutMs: 18000,\n    workspaceWrite: false,\n    reasoningEffortOverride: "low",\n  });`,
  `const result = await runCodexFastText(prompt, {\n    timeoutMs: 18000,\n    reasoningEffortOverride: "low",\n  });`,
  'Chinese resolver fast transport'
);

s = replaceOnce(
  s,
  `const result = await runCodex(prompt, {\n    timeoutMs: 15000,\n    workspaceWrite: false,\n    reasoningEffortOverride: "low",\n  });`,
  `const result = await runCodexFastText(prompt, {\n    timeoutMs: 15000,\n    reasoningEffortOverride: "low",\n  });`,
  'sentence review fast transport'
);

s = replaceOnce(
  s,
  `    provider: "codex-local",\n    cacheHit: false,`,
  `    provider: result.transport === "app-server" ? "codex-app-server" : "codex-exec-fallback",\n    cacheHit: false,`,
  'sentence feedback provider'
);

s = replaceOnce(
  s,
  `          runtimeTest: lastCodexRuntimeTest,\n        },`,
  `          runtimeTest: lastCodexRuntimeTest,\n          fastTextTransport: appServerPublicStatus(),\n        },`,
  'status transport diagnostics'
);

s = replaceOnce(
  s,
  `      const saved = await saveSettings({\n        ...current,\n        codexModel: model,\n        codexReasoningEffort: reasoningEffort,\n      });\n\n      // A saved runtime selection`,
  `      const saved = await saveSettings({\n        ...current,\n        codexModel: model,\n        codexReasoningEffort: reasoningEffort,\n      });\n      invalidateCodexFastThread();\n\n      // A saved runtime selection`,
  'invalidate thread on model change'
);

s = replaceOnce(
  s,
  `      console.log("");\n\n      if (process.platform === "win32"`,
  `      console.log("");\n\n      // Warm only the local Codex app-server process. The first model turn is\n      // still started on demand so launching LexiFlow does not spend AI usage.\n      setTimeout(() => { void warmCodexAppServer(); }, 250);\n\n      if (process.platform === "win32"`,
  'prewarm app-server process'
);

s = replaceOnce(
  s,
  `function stopServer() {\n  try {\n    if (server.listening) server.close();\n  } catch {}\n}`,
  `function stopServer() {\n  shutdownCodexAppServer();\n  try {\n    if (server.listening) server.close();\n  } catch {}\n}`,
  'shutdown app-server'
);

fs.writeFileSync(serverPath, s, 'utf8');

const packagePath = 'package.json';
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.version = '0.6.1';
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

const lockPath = 'package-lock.json';
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
lock.version = '0.6.1';
if (lock.packages && lock.packages['']) lock.packages[''].version = '0.6.1';
fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8');

console.log('LexiFlow Codex app-server fast-text patch applied.');
