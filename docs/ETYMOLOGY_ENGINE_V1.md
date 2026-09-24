# LexiFlow Etymology Engine V1

## Product goal

LexiFlow does not try to become an exhaustive etymological dictionary.

The product goal is narrower:

> For a concrete English word, retrieve word-level historical evidence first,
> then let AI turn that evidence into a short learner-facing explanation of
> why the word has its present form and meaning.

The system must prefer **no decomposition** over an attractive but unsupported
root story.

## Runtime architecture

```text
English word
    |
    v
Word Etymology Providers
    |-- Merriam-Webster (when the user's dictionary key is configured)
    |-- English Wiktionary (public fallback)
    |
    v
Normalized Evidence Bundle
    |
    v
Evidence-gated AI Explanation
    |
    v
Validated Explanation Contract
    |
    v
Persistent Local Cache
    |
    v
Lookup card / Study card
```

The 86 verified morpheme authority records and 33 transmission mappings are
not an exhaustive runtime catalog. They are retained as:

1. verified safety fixtures;
2. regression examples for difficult homographs and transmission cases;
3. optional future fallback/reference data.

There is no V1 requirement to drive the candidate dataset to 100% coverage.

## Provider boundary

### Merriam-Webster

The existing dictionary key stays inside the inner local server.

Public UI code never receives the key. The outer runtime calls:

`POST /api/internal/etymology/merriam-webster`

The inner service fetches the configured Merriam-Webster Learner's Dictionary
payload, selects exact headword entries, and extracts dictionary `et`
etymology fields when present.

A missing key is treated as an unavailable provider, not as a failure of the
whole etymology feature.

### Wiktionary

The fallback provider uses the MediaWiki Action API with
`action=parse&prop=wikitext`.

Only the English language section and its Etymology subsection(s) are retained.
Other language sections, pronunciation sections, and unrelated page content are
excluded before AI sees the evidence.

Provider calls use AbortController timeouts so a slow network source cannot
hold the learning UI indefinitely.

## AI boundary

AI is a presentation and synthesis layer, not an etymological authority.

The prompt contract requires:

- no spelling-only root inference;
- components only when word-level evidence supports them;
- every component must cite one or more actual evidence source IDs;
- unknown source IDs are rejected;
- conflicting or weak evidence must return `confidence=insufficient`;
- when reliable decomposition is not available, `components=[]`.

The server validates the returned JSON before it becomes product data.

If providers succeed but AI is unavailable, LexiFlow returns
`evidence_ready_ai_unavailable` and shows no guessed morphemes.

If no word-level evidence is available, AI is not called.

## Cache model

Verified explanations are cached persistently in the user's LexiFlow data
directory, not in the repository.

Cache identity includes:

- explanation schema version;
- normalized word;
- current learning meaning.

This prevents different learning senses of the same spelling from silently
sharing one explanation.

The cache:

- uses atomic temp-file + rename writes;
- has a TTL;
- has a bounded entry count;
- is bypassed explicitly by force refresh.

Provider prose is not exposed in the public cached result. The UI receives
source metadata, evidence fingerprint, structured components, source path, and
the learner explanation.

## UI integration

`public/app.js` owns only explicit extension points:

- lookup etymology host;
- study etymology host.

`public/etymology-insight-v1.js` owns:

- request lifecycle;
- in-memory request de-duplication;
- loading/error/retry states;
- source links;
- learner-facing rendering.

The module observes only explicit `data-etymology-host` nodes. It does not
search for incidental CSS classes or patch arbitrary DOM structures.

The etymology feature never blocks saving a learning card.

## Morpheme safety foundation

The old candidate coverage roadmap has been retired.

`scripts/check-morpheme-safety.js` keeps the valuable regression behavior
without P0/P1/P2 expansion targets. It verifies, among other cases:

- CAP2/head cannot be satisfied by CAP < capio/take;
- CID < caedo/cut and CID < cado/fall stay separate;
- SED < sedeo/sit cannot be satisfied by separative SE-/SED-;
- MIS- with a wrong Latin discovery hint cannot consume Old English authority;
- unsupported MOB stays intentionally unpublished;
- authority/transmission/collision boundaries remain intact.

Unresolved candidate counts are informational safety-fixture coverage only.
They are not a product backlog or release gate.

## Test strategy

`scripts/check-etymology-engine-v1.js` uses only fixtures and fake providers.

It does not call real external APIs or real AI services.

The contract suite verifies:

- exact Merriam-Webster headword isolation;
- English-only Wiktionary etymology extraction;
- AbortSignal propagation to provider fetches;
- no AI call without evidence;
- evidence-source IDs required on every generated component;
- provider failure fallback;
- AI outage does not create guessed roots;
- persistent cache hit avoids repeat provider/AI work;
- force refresh bypasses cache;
- phrase input is rejected by the word-etymology engine;
- test cache is created under OS temp and deleted after the run.

## Current V1 boundary

V1 supports one English word at a time.

Phrases, idioms, productive modern affixes without reliable word-level
historical evidence, and speculative semantic stories are intentionally outside
the first contract.

Future providers can be added behind the evidence-provider interface without
changing the UI or AI validation contract.
