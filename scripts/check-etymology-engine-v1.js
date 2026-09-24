"use strict";

const assert = require("assert");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const {
  extractMerriamWebsterEvidence,
  fetchWiktionaryEvidence,
  cleanWikitext,
} = require("../lib/etymology-evidence");
const { PersistentEtymologyCache } = require("../lib/etymology-cache");
const { createEtymologyService } = require("../lib/etymology-service");

async function main() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lexiflow-etymology-"));
  const cachePath = path.join(tempDir, "cache.json");

  try {
    const mwPayload = [
      {
        meta:{ id:"project:1", stems:["project"] },
        hwi:{ hw:"project" },
        et:[["text","Latin {it}proicere{/it}, from {it}pro-{/it} forward + {it}jacere{/it} to throw"]],
      },
      {
        meta:{ id:"projector:1", stems:["projector"] },
        hwi:{ hw:"projector" },
        et:[["text","unrelated nearby headword evidence"]],
      },
    ];
    const mw = extractMerriamWebsterEvidence(mwPayload, "project");
    assert(mw, "MW exact etymology evidence should be extracted");
    assert.strictEqual(mw.facts.length, 1, "Nearby non-exact MW entries must not leak into evidence");
    assert(mw.facts[0].text.includes("proicere"), "MW formatting should be normalized");
    assert(!mw.facts[0].text.includes("{it}"), "MW inline markup must not leak into normalized evidence");

    const wikFixture = [
      "==English==",
      "===Etymology===",
      "From {{bor|en|la|proiectus}}, from {{m|la|proicere}}; compare [[project]].",
      "===Pronunciation===",
      "* /test/",
      "===Noun===",
      "# A project.",
      "==French==",
      "===Noun===",
      "# French section must not be used.",
    ].join("\n");

    let wikCalls = 0;
    const fakeFetch = async (_url, options) => {
      wikCalls += 1;
      assert(options.signal, "Provider fetch must receive an AbortSignal");
      return {
        ok:true,
        async json(){ return { parse:{ wikitext:wikFixture } }; },
      };
    };
    const wik = await fetchWiktionaryEvidence("project", { fetchImpl:fakeFetch, timeoutMs:1000 });
    assert.strictEqual(wikCalls, 1, "Wiktionary should require one provider request");
    assert(wik?.facts?.length === 1, "Only English etymology sections should become evidence");
    assert(!wik.facts[0].text.includes("French section"), "Other-language sections must not leak into English evidence");
    assert(cleanWikitext("[[proicere|proicere]]").includes("proicere"), "Wiki links should normalize to readable text");

    let mwCalls = 0;
    let serviceWikCalls = 0;
    let aiCalls = 0;
    const cache = new PersistentEtymologyCache({ filePath:cachePath, ttlMs:60000, maxEntries:20 });
    const service = createEtymologyService({
      cache,
      merriamWebsterProvider:async word => {
        mwCalls += 1;
        return { ...mw, word };
      },
      wiktionaryProvider:async word => {
        serviceWikCalls += 1;
        return { ...wik, word };
      },
      aiRunner:async prompt => {
        aiCalls += 1;
        assert(prompt.includes("禁止根据拼写自行猜词根"), "AI prompt must explicitly forbid spelling-only inference");
        return JSON.stringify({
          confidence:"high",
          sourcePath:"Latin proicere → English project",
          components:[
            { form:"pro-", role:"prefix", meaningZh:"向前", sourceLanguage:"Latin", sourceForm:"pro-", evidenceSourceIds:["mw","wiktionary"] },
            { form:"ject", role:"root", meaningZh:"投、掷", sourceLanguage:"Latin", sourceForm:"proicere", evidenceSourceIds:["mw"] },
          ],
          explanationZh:"这个词的历史来源指向 Latin proicere，原始概念与“向前投出”有关。后来进入英语后，逐渐发展出提出、规划以及项目等义项。",
        });
      },
    });

    const first = await service.explain("project", { meaningZh:"项目" });
    assert.strictEqual(first.status, "verified_explanation");
    assert.strictEqual(first.cacheHit, false);
    assert.strictEqual(first.components.length, 2);
    assert(first.sources.every(source => !("facts" in source)), "Public result must not expose raw provider prose");
    assert.strictEqual(mwCalls, 1);
    assert.strictEqual(serviceWikCalls, 1);
    assert.strictEqual(aiCalls, 1);

    const second = await service.explain("project", { meaningZh:"项目" });
    assert.strictEqual(second.cacheHit, true, "Second lookup must come from persistent cache");
    assert.strictEqual(mwCalls, 1, "Cache hit must not call MW again");
    assert.strictEqual(serviceWikCalls, 1, "Cache hit must not call Wiktionary again");
    assert.strictEqual(aiCalls, 1, "Cache hit must not call AI again");

    await service.explain("project", { meaningZh:"项目", forceRefresh:true });
    assert.strictEqual(mwCalls, 2, "Force refresh must bypass final cache");
    assert.strictEqual(serviceWikCalls, 2);
    assert.strictEqual(aiCalls, 2);

    let noEvidenceAiCalls = 0;
    const noEvidence = createEtymologyService({
      cache:new PersistentEtymologyCache({ filePath:path.join(tempDir,"none.json") }),
      merriamWebsterProvider:async()=>null,
      wiktionaryProvider:async()=>null,
      aiRunner:async()=>{ noEvidenceAiCalls += 1; return "{}"; },
    });
    const none = await noEvidence.explain("opaque");
    assert.strictEqual(none.status, "insufficient_evidence");
    assert.strictEqual(noEvidenceAiCalls, 0, "AI must never invent an etymology when word-level evidence is absent");

    const fallback = createEtymologyService({
      cache:new PersistentEtymologyCache({ filePath:path.join(tempDir,"fallback.json") }),
      merriamWebsterProvider:async()=>{ const err=new Error("offline"); err.code="TEST_MW_DOWN"; throw err; },
      wiktionaryProvider:async()=>wik,
      aiRunner:async()=>JSON.stringify({
        confidence:"medium",
        sourcePath:"Latin → English",
        components:[],
        explanationZh:"现有词源证据支持 Latin 来源，但不足以安全拆成更细的词根成分。",
      }),
    });
    const fallbackResult = await fallback.explain("project");
    assert.strictEqual(fallbackResult.status, "verified_explanation", "One provider failure must not kill a valid fallback");
    assert(fallbackResult.providerErrors.some(item=>item.provider==="merriam-webster"), "Provider degradation must remain auditable");

    const ungrounded = createEtymologyService({
      cache:new PersistentEtymologyCache({ filePath:path.join(tempDir,"ungrounded.json") }),
      merriamWebsterProvider:async()=>mw,
      wiktionaryProvider:async()=>null,
      aiRunner:async()=>JSON.stringify({
        confidence:"high",
        sourcePath:"Latin → English",
        components:[
          { form:"fake", role:"root", meaningZh:"伪造", sourceLanguage:"Latin", sourceForm:"fictus", evidenceSourceIds:["not-a-real-source"] },
        ],
        explanationZh:"错误示例",
      }),
    });
    await assert.rejects(
      ()=>ungrounded.explain("project"),
      err=>err?.code==="ETYMOLOGY_AI_UNGROUNDED",
      "AI components without a real evidence source id must be rejected"
    );

    const aiUnavailable = createEtymologyService({
      cache:new PersistentEtymologyCache({ filePath:path.join(tempDir,"ai-down.json") }),
      merriamWebsterProvider:async()=>mw,
      wiktionaryProvider:async()=>null,
      aiRunner:async()=>{ const err=new Error("down"); err.code="TEST_AI_DOWN"; throw err; },
    });
    const unavailable = await aiUnavailable.explain("project");
    assert.strictEqual(unavailable.status, "evidence_ready_ai_unavailable");
    assert.strictEqual(unavailable.components.length, 0, "AI outage must never fall back to guessed components");

    await assert.rejects(
      ()=>service.explain("two words"),
      err=>err?.code==="ETYMOLOGY_INVALID_WORD",
      "Phrase input must be rejected by the word-etymology engine"
    );

    const cacheOnDisk = JSON.parse(await fs.readFile(cachePath,"utf8"));
    assert.strictEqual(cacheOnDisk.schema, "lexiflow-etymology-cache-v1");
    assert(Object.keys(cacheOnDisk.entries).length >= 1, "Verified explanations must persist outside project source data");

    console.log("Etymology Engine V1 checks passed.");
  } finally {
    await fs.rm(tempDir, { recursive:true, force:true });
  }
}

main().catch(err=>{
  console.error(err);
  process.exitCode=1;
});
