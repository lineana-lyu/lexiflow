from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, before: str, after: str):
    text = path.read_text(encoding="utf-8")
    count = text.count(before)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, got {count}: {before[:100]!r}")
    path.write_text(text.replace(before, after, 1), encoding="utf-8")


# 1) UI: no automatic provider-status probe on startup or route navigation.
app = ROOT / "public" / "app.js"
replace_once(
    app,
    '      render();\n      if(state.route==="add") refreshProviderStatus(true);',
    '      render();',
)
replace_once(
    app,
    '      await hydrateLearningData();\n      render();\n      await refreshProviderStatus(true);',
    '      await hydrateLearningData();\n      render();',
)
replace_once(
    app,
    '''    const badge=dict?.configured
      ? `<span class="pill green">● 词典已连接</span>`
      : `<button class="btn small" data-route="settings">配置词典</button>`;''',
    '''    const badge=dict?.configured
      ? `<span class="pill green">● 词典已连接</span>`
      : state.providerStatus
        ? `<button class="btn small" data-route="settings">检查词典状态</button>`
        : `<span class="pill green">● 本地词典已就绪</span>`;''',
)

# 2) Backend status: never spawnSync Codex from /api/status. Filesystem detection is enough
# for passive status; explicit AI connection tests still exercise the real Codex runtime.
server = ROOT / "server.js"
replace_once(
    server,
    'const { spawn, spawnSync, exec } = require("child_process");',
    'const { spawn, exec } = require("child_process");',
)
replace_once(
    server,
    '''function runSync(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    shell: commandNeedsShell(command),
    timeout: 8000,
  });
}
''',
    '''function commandAvailableWithoutSpawn(command) {
  const value = String(command || "").trim();
  if (!value) return false;
  if (path.isAbsolute(value)) return Boolean(existingFile(value));
  const pathValue = String(process.env.PATH || "");
  if (!pathValue) return false;
  const names = process.platform === "win32"
    ? [value, `${value}.exe`, `${value}.cmd`, `${value}.bat`]
    : [value];
  for (const dir of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const name of names) {
      if (existingFile(path.join(dir, name))) return true;
    }
  }
  return false;
}
''',
)
replace_once(
    server,
    '''function codexStatus(force = false) {
  if (!force && codexStatusCache.value && Date.now() - codexStatusCache.at < CODEX_STATUS_CACHE_MS) {
    return codexStatusCache.value;
  }

  const resolved = resolveCodexExecutable();
  const executable = resolved.command;
  const probe = runSync(executable, ["--version"]);
  const cfg = parseCodexConfig();
  const authFound = fs.existsSync(CODEX_AUTH);

  if (probe.status !== 0) {
    const detail = String(probe.stderr || probe.error?.message || probe.stdout || "").trim();
    if (detail) console.warn("Codex probe failed:", detail.slice(0, 800));
  }

  const value = {
    executable: path.isAbsolute(executable) ? executable : "codex (PATH)",
    executableSource: resolved.source,
    cliAvailable: probe.status === 0,
    version: probe.status === 0 ? String(probe.stdout || probe.stderr || "").trim() : "",
    probeError: probe.status === 0 ? "" : "Codex CLI 启动检测未通过",
    authPath: CODEX_AUTH,
    authFound,
    configPath: CODEX_CONFIG,
    configFound: cfg.configFound,
    model: cfg.model,
    provider: cfg.provider,
    profileModels: cfg.profileModels || [],
  };

  codexStatusCache = { at: Date.now(), value };
  return value;
}
''',
    '''function codexStatus(force = false) {
  if (!force && codexStatusCache.value && Date.now() - codexStatusCache.at < CODEX_STATUS_CACHE_MS) {
    return codexStatusCache.value;
  }

  const resolved = resolveCodexExecutable();
  const executable = resolved.command;
  const cfg = parseCodexConfig();
  const authFound = fs.existsSync(CODEX_AUTH);
  const cliAvailable = commandAvailableWithoutSpawn(executable);

  const value = {
    executable: path.isAbsolute(executable) ? executable : "codex (PATH)",
    executableSource: resolved.source,
    cliAvailable,
    version: "",
    probeError: cliAvailable ? "" : "未在本机可执行路径中检测到 Codex CLI",
    authPath: CODEX_AUTH,
    authFound,
    configPath: CODEX_CONFIG,
    configFound: cfg.configFound,
    model: cfg.model,
    provider: cfg.provider,
    profileModels: cfg.profileModels || [],
  };

  codexStatusCache = { at: Date.now(), value };
  return value;
}
''',
)

# 3) Core runtime: select the Chinese-matching sense instead of blindly taking a word's
# highest-ranked English sense. This fixes cases like 适合 -> suit(noun suit) rather than
# suit(verb be suitable).
core = ROOT / "lib" / "core-lexicon.js"
old_lookup = '''function lookupChinese(query) {
  const q = clean(query);
  if (!q) return null;
  const startedAt = Date.now();
  const candidates = chineseCandidates(q, 6);
  if (!candidates.length) return null;

  const best = candidates[0];
  const alternatives = candidates.slice(1, 4).map(item => ({
    word: clean(item.word),
    meaningZh: q,
    source: clean(item.source),
  }));
  const result = lookupExact(best.word, "primary", {
    sourceQuery: q,
    normalizedQuery: q,
    autoResolved: true,
    alternatives,
    lookupPath: "core-zh",
  });
  if (!result) return null;
  result.lookupMs = Math.max(0, Date.now() - startedAt);
  result.chineseAliasSource = clean(best.source);
  result.chineseAliasRank = Number(best.rank || 0);
  result.localSearchConfidence = best.source === "cc-cedict" ? 0.98 : 0.86;
  if (result.senses?.[0]) {
    // Preserve the user's exact Chinese concept as the compact card meaning when
    // CC-CEDICT gave a direct headword match. The English sense definition still
    // remains available in senseIntentEn for downstream verification/visuals.
    if (best.source === "cc-cedict") result.senses[0].meaningZh = q;
  }
  return result;
}
'''
new_lookup = '''function chineseMeaningTokens(value) {
  return clean(value)
    .split(/[；;、，,。/（）()\\s]+/)
    .map(token => token.trim())
    .filter(Boolean);
}

function chineseSenseMatchScore(sense, query) {
  const q = clean(query);
  const meaning = clean(sense?.meaning_zh);
  if (!q || !meaning) return 0;
  const tokens = chineseMeaningTokens(meaning);
  if (tokens.includes(q)) return 3000;
  if (meaning.includes(q)) return 1800;
  return 0;
}

function lookupChineseCandidate(word, query, options = {}) {
  const db = getDatabase();
  const normalized = clean(word).toLowerCase();
  const q = clean(query);
  if (!db || !normalized || !q) return null;
  try {
    const wordRow = db.prepare(`
      SELECT word, phonetic, audio_url, learner_rank, pos_summary, tags, collins, oxford, bnc, frq, source
      FROM words WHERE word=? COLLATE NOCASE LIMIT 1
    `).get(normalized);
    if (!wordRow) return null;
    const senses = db.prepare(`
      SELECT id, word, pos, definition_en, meaning_zh, example_en, sense_rank, source
      FROM senses WHERE word=? COLLATE NOCASE AND meaning_zh<>''
      ORDER BY sense_rank DESC, id ASC LIMIT 12
    `).all(normalized);
    const ordered = senses.slice().sort((a, b) => {
      const semantic = chineseSenseMatchScore(b, q) - chineseSenseMatchScore(a, q);
      if (semantic) return semantic;
      return Number(b.sense_rank || 0) - Number(a.sense_rank || 0);
    });
    const result = baseResult(wordRow, ordered, "primary", options);
    if (!result) return null;
    const chosen = ordered[0];
    result.chineseSenseMatched = chineseSenseMatchScore(chosen, q) > 0;
    if (result.senses?.[0] && result.chineseSenseMatched) {
      const original = clean(result.senses[0].meaningZh);
      if (original && original !== q) result.senses[0].glossZh = original;
      result.senses[0].meaningZh = q;
    }
    return result;
  } catch (err) {
    openError = String(err?.message || err || "LexiFlow Core Chinese sense lookup failed");
    return null;
  }
}

function lookupChinese(query) {
  const q = clean(query);
  if (!q) return null;
  const startedAt = Date.now();
  const candidates = chineseCandidates(q, 8);
  if (!candidates.length) return null;

  const resolved = candidates.map(item => {
    const result = lookupChineseCandidate(item.word, q, {
      sourceQuery: q,
      normalizedQuery: q,
      autoResolved: true,
      lookupPath: "core-zh",
    });
    if (!result) return null;
    const semanticBoost = result.chineseSenseMatched ? 520 : 0;
    return { item, result, effectiveRank: Number(item.rank || 0) + semanticBoost };
  }).filter(Boolean).sort((a, b) => b.effectiveRank - a.effectiveRank);

  if (!resolved.length) return null;
  const bestResolved = resolved[0];
  const best = bestResolved.item;
  const alternatives = resolved.slice(1, 4).map(({ item, result }) => ({
    word: clean(item.word),
    meaningZh: clean(result.senses?.[0]?.meaningZh) || q,
    source: clean(item.source),
  }));
  const result = bestResolved.result;
  result.alternatives = alternatives;
  result.lookupMs = Math.max(0, Date.now() - startedAt);
  result.chineseAliasSource = clean(best.source);
  result.chineseAliasRank = Number(best.rank || 0);
  result.localSearchConfidence = result.chineseSenseMatched
    ? (best.source === "cc-cedict" ? 0.99 : 0.94)
    : (best.source === "cc-cedict" ? 0.76 : 0.72);
  result.lookupAmbiguous = Boolean(resolved[1] && Math.abs(bestResolved.effectiveRank - resolved[1].effectiveRank) < 90);
  return result;
}
'''
replace_once(core, old_lookup, new_lookup)

# 4) Core build v3: preserve accurate CC-CEDICT multiword glosses instead of dropping
# the primary phrase and accidentally promoting a later single-word gloss (e.g. 发卡 -> chuck).
prepare = ROOT / "scripts" / "prepare-core-lexicon.js"
replace_once(prepare, 'const SCHEMA = "lexiflow-core-v2";', 'const SCHEMA = "lexiflow-core-v3";')
replace_once(
    prepare,
    '''function ccCedictEnglishCandidate(value) {
  let text = clean(value)
    .replace(/\\([^)]{0,80}\\)/g, "")
    .replace(/\\[[^\\]]{0,80}\\]/g, "")
    .replace(/^to\\s+/i, "")
    .replace(/\\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!text || text.length > 48) return "";
  if (/^(cl:|classifier|surname|variant of|abbr\\.|see |old variant|also written|used in)/i.test(text)) return "";
  if (/[^a-z '\\-]/i.test(text)) return "";
  const words = text.split(/\\s+/).filter(Boolean);
  if (!words.length || words.length > 4) return "";
  if (["a", "an", "the", "one's", "sb", "sth"].includes(words[0])) return "";
  return text;
}
''',
    '''function ccCedictEnglishCandidate(value) {
  let text = clean(value)
    .replace(/\\([^)]{0,80}\\)/g, "")
    .replace(/\\[[^\\]]{0,80}\\]/g, "")
    .replace(/^to\\s+/i, "")
    .replace(/\\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!text || text.length > 56) return "";
  if (/^(cl:|classifier|surname|variant of|abbr\\.|see |old variant|also written|used in)/i.test(text)) return "";
  if (/[^a-z '\\-]/i.test(text)) return "";
  const words = text.split(/\\s+/).filter(Boolean);
  if (!words.length || words.length > 4) return "";
  if (["a", "an", "the", "one's", "sb", "sth"].includes(words[0])) return "";
  return text;
}
''',
)

anchor = '  const wordExists = db.prepare("SELECT learner_rank FROM words WHERE word=? COLLATE NOCASE LIMIT 1");\n'
insert = anchor + '''
  function ensureCcCandidateWord(candidate, alias, definition) {
    const normalized = clean(candidate).toLowerCase();
    if (!/^[a-z][a-z '\\-]{0,55}$/i.test(normalized)) return null;
    const existing = wordExists.get(normalized);
    if (existing) return existing;

    const exactRow = ecdictLookup.get(normalized);
    if (exactRow) {
      const pos = normalizePos(clean(exactRow.pos).split(/[\\s,/;|]+/)[0]?.split(":")[0]) || (normalized.includes(" ") ? "phrase" : "word");
      const meaningZh = conciseChineseMeaning(exactRow.translation, pos) || conciseChineseMeaning(exactRow.translation, "") || alias;
      const rank = learnerRank(exactRow);
      upsertWord.run(normalized, clean(exactRow.phonetic), "", rank, pos, clean(exactRow.tag), Number(exactRow.collins || 0), Number(exactRow.oxford || 0), Number(exactRow.bnc || 0), Number(exactRow.frq || 0), "cc-cedict+ecdict");
      const definitionEn = normalizeNewlines(exactRow.definition).split(/\\r?\\n/).map(x => x.trim()).filter(Boolean)[0] || definition;
      insertSense.run(normalized, pos, definitionEn, meaningZh, "", rank, "cc-cedict+ecdict");
      coreWords += 1;
      return wordExists.get(normalized);
    }

    const tokens = normalized.split(/\\s+/).filter(Boolean);
    const tokenRanks = tokens.map(token => Number(wordExists.get(token)?.learner_rank || 0));
    const tokenRank = tokenRanks.length ? Math.max(...tokenRanks) : 0;
    const rank = Math.max(80, Math.min(520, tokenRank || 160));
    const pos = tokens.length > 1 ? "phrase" : "word";
    upsertWord.run(normalized, "", "", rank, pos, "", 0, 0, 0, 0, "cc-cedict");
    insertSense.run(normalized, pos, definition, alias, "", rank, "cc-cedict");
    coreWords += 1;
    return wordExists.get(normalized);
  }
'''
replace_once(prepare, anchor, insert)

replace_once(
    prepare,
    '''      defs.forEach((def, index) => {
        const candidate = ccCedictEnglishCandidate(def);
        if (!candidate) return;
        const hit = wordExists.get(candidate);
        if (!hit) return;
        const phrasePenalty = Math.max(0, candidate.split(/\\s+/).length - 1) * 15;
        const rank = 1800 - index * 90 + Math.min(Number(hit.learner_rank || 0), 350) - phrasePenalty;
        for (const alias of aliases) {
          if (alias && alias.length <= 16) upsertAlias.run(alias, candidate, rank, "cc-cedict");
        }
      });''',
    '''      defs.forEach((def, index) => {
        const candidate = ccCedictEnglishCandidate(def);
        if (!candidate) return;
        const hit = ensureCcCandidateWord(candidate, simplified, def);
        if (!hit) return;
        // Prefer compact learner-friendly words/phrases, but never discard the
        // primary CC-CEDICT phrase just because it is multiword.
        const phrasePenalty = Math.max(0, candidate.split(/\\s+/).length - 1) * 80;
        const rank = 1800 - index * 90 + Math.min(Number(hit.learner_rank || 0), 350) - phrasePenalty;
        for (const alias of aliases) {
          if (alias && alias.length <= 16) upsertAlias.run(alias, candidate, rank, "cc-cedict");
        }
      });''',
)

print("Applied settings responsiveness and Chinese lookup accuracy fixes")
