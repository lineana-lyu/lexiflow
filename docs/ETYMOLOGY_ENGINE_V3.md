# LexiFlow Etymology Engine V3

## Product rule

LexiFlow separates three responsibilities:

1. **evidence retrieval** decides what historical facts and relations exist;
2. **graph selection** decides which morphology components are sufficiently
   grounded to display;
3. **AI** explains those already-selected components in natural Chinese.

AI no longer decides whether a grounded prefix/root/suffix should be shown.

## Why V3

Real-product testing showed two remaining V2 failures:

- `enamored` had usable morphology through a related etymon (`enamor`) but
  the graph stopped before promoting it;
- `fascinate` had explicit Latin `fascinum + -ō`, yet AI could omit `-ō`
  from the final UI.

V3 moves component selection out of the AI contract.

## Relation coverage

`lib/wiktionary-structure.js` now supports:

- borrowed / inherited / derived relations;
- calque / partial-calque relations;
- grammatical form-of relations;
- explicit prefix/suffix/compound/affix templates;
- explicit `X + Y` mention morphology;
- bounded `related_etymon` navigation for etymology-linked forms.

Related-etymon edges are navigation-only. They are not treated as direct
ancestors when generating the historical path.

## Deterministic morphology selection

`lib/etymology-graph.js` selects one primary composition before AI runs.

Selection prefers:

1. direct composition of the queried word;
2. composition reached through form-of / historical relations;
3. composition reached through a morphologically compatible related etymon.

A related form must preserve lexical continuity (for example
`enamored -> enamor`) before its decomposition can be promoted.

The selected component IDs become the **Required Components** contract.

## AI contract

AI receives:

- the Evidence Graph;
- the exact Required Components list.

AI must return one explanation for every required component, in the same order,
and may not add, remove, or replace component IDs.

Server validation rejects:

- missing components;
- extra components;
- reordered/replaced components;
- ungrounded nodes;
- empty component meanings;
- audit-style learner copy.

Verified local authority meanings override generated component glosses when an
exact authority record exists.

## Unicode historical forms

Historical language forms are Unicode-safe end to end.

Both graph IDs and provider lookup now support forms such as Latin `-ō`.
Stable node IDs use percent-encoded NFC text rather than ASCII stripping, so
distinct historical forms cannot collapse into the same node ID.

## Cache invalidation

The explanation schema is now:

`lexiflow-etymology-explanation-v3`

This intentionally invalidates previously cached V1/V2 explanations so users do
not continue seeing old morphology omissions after upgrading.

Cache storage itself remains outside the repository and test cache remains
isolated under OS temporary directories.

## Maintained files

- `lib/wiktionary-structure.js`
- `lib/etymology-evidence.js`
- `lib/etymology-graph.js`
- `lib/etymology-service.js`
- `public/etymology-insight-v3.js`
- `scripts/check-etymology-engine-v3.js`

## Regression examples

The V3 contract suite covers:

- `misunderstand` -> `mis- + understand`;
- `enamored` -> related `enamor` -> `en- + amor + -er`;
- `fascinate` -> Latin `fascinum + -ō`;
- Unicode lookup of `-ō`;
- rejection when AI tries to omit a required suffix;
- no external API calls;
- no real AI calls;
- temporary cache cleanup.

## Product outcome

If a reliable source explicitly supports a morphology decomposition, LexiFlow
must show it.

If the source only supports a whole-word history, LexiFlow may still explain
the semantic history without inventing a decomposition.

This keeps the product learner-friendly without sacrificing provenance.

## Provider transport resilience

Wiktionary source retrieval is not coupled to one MediaWiki response shape.

The maintained provider uses an ordered transport strategy:

1. MediaWiki `action=query + prop=revisions + rvslots=main`;
2. MediaWiki `action=parse + prop=wikitext` fallback.

Decoders accept both current scalar source fields and legacy `{"*": ...}`
content shapes. A structurally invalid response falls through to the next
transport instead of being mistaken for an empty etymology.

A confirmed missing page remains an ordinary empty result; transport/HTTP/
timeout failures are classified separately as provider outages.

The request User-Agent identifies LexiFlow and its public repository.

## Provider state contract

No-evidence and no-provider are different product states.

- `insufficient_evidence`: providers responded successfully, but reliable
  etymology evidence was not found;
- `provider_unavailable`: one or more required retrieval providers failed and
  no usable evidence remained.

`provider_unavailable` is retryable in the UI. Provider names/status/error
codes remain in the response for diagnostics, without exposing credentials or
raw provider payloads.

The contract suite verifies transport fallback, legacy MediaWiki response
compatibility, missing-page handling, provider outage classification, and that
AI is not invoked when evidence retrieval has failed.

