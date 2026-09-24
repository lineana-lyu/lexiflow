# LexiFlow Etymology Engine V2

> **Superseded by V3.** The maintained architecture is now
> `docs/ETYMOLOGY_ENGINE_V3.md`, where graph-owned Required Components replace
> AI-selected morphology, related-etymon navigation is explicit, Unicode
> historical forms are supported end to end, and the explanation cache schema
> is bumped to V3.

## Why V2 exists

V1 proved the safety boundary: retrieve word-level etymology evidence before AI
and reject components that cannot cite a real source.

Real-product testing exposed a different problem: many dictionary entries state
only the immediate history of a word. A page may say that a word comes from an
older form without also defining every prefix/root/suffix on that same page.
The result was inconsistent UX: words such as `adjacent` decomposed well,
while `misunderstand`, `enamored`, and `fascinate` could fall back to
audit-like copy even though useful historical information existed one or two
links deeper.

V2 solves this at the retrieval layer rather than by adding prompt exceptions.

## Maintained runtime flow

```text
surface word
   |
   +-- canonical app lemma when available
   |
   v
word-level providers
   |-- Merriam-Webster
   |-- Wiktionary
   |
   v
structured relation parser
   |-- borrowed/inherited/derived from
   |-- prefix/suffix/compound/affix
   |-- explicit X + Y morphology
   |-- grammatical form-of -> lemma
   |
   v
bounded Evidence Graph
   |-- ancestor nodes
   |-- component nodes
   |-- historical-language lookups
   |-- verified local authority enrichment
   |
   v
AI learner explanation
   |
   v
server-side graph validation
   |
   v
persistent local cache
   |
   v
lookup / study UI
```

## Evidence graph

The graph implementation lives in:

- `lib/wiktionary-structure.js`
- `lib/etymology-evidence.js`
- `lib/etymology-graph.js`

The graph is intentionally bounded:

- maximum depth: 3 in the product service;
- maximum nodes: 18;
- maximum recursive provider calls: 10.

These limits prevent malformed/cyclic dictionary relationships from causing
unbounded network work.

Traversal is iterative and deduplicated by stable node/edge identity.

## Relation strategies

Wiktionary templates are parsed structurally instead of flattened immediately.

The parser uses small relation strategies rather than word-specific conditions:

- decomposition templates: `prefix`, `suffix`, `compound`, `confix`,
  `affix`, `af`;
- historical relations: `bor`, `inh`, `der`, and supported aliases;
- grammatical lemma relations: `past participle of`, `present participle of`,
  `inflection of`, `form of`, plural/comparative/superlative/alternative
  form templates;
- explicit mention-plus structure such as
  `{{m|la|fascinum}} + {{m|la|-o}}`.

This means an inflected word can recover its lexical lemma even when the app
itself does not already provide one.

## Component enrichment

A decomposition is not considered complete merely because component spellings
were detected.

For every component the graph may enrich from:

1. the exact word-level relation that established the component;
2. a bounded Wiktionary lookup in the historical language named by that
   relation;
3. the existing verified LexiFlow morpheme authority registry, when an exact
   teaching form is available.

Explicit Wiktionary glosses such as `t=` / `gloss=` are preserved rather
than discarded during cleaning.

Authority citations are added to the same evidence graph, so a learner-facing
component meaning remains traceable.

## Separation of confidence

V2 separates two questions:

- `origin.confidence`: how well the historical source/path is supported;
- `morphology.confidence`: how well the prefix/root/suffix decomposition is
  supported.

A word can therefore have a useful historical explanation even when its
morphology is not safe to decompose.

This removes the V1 failure mode where “cannot split confidently” became
“nothing useful can be explained.”

## Learner copy contract

The AI receives the Evidence Graph, not a single flattened evidence paragraph.

Generated morphology can reference only existing `component` node IDs.
Unknown node IDs are rejected server-side.

The learner explanation must answer why the word acquired its modern meaning.
The following audit-style phrases are rejected before they reach the UI:

- “证据表明”
- “现有证据”
- “证据不足”
- “无法可靠……”
- “因此不拆……”
- “证据未明确……”

Internal evidence/audit state and learner-facing prose are separate contracts.

The UI badge is now **来源已核对**, not **已验证**.

## Inflected forms

Both app-provided lemma metadata and dictionary form-of relationships are
supported.

Example:

```text
enamored
  -> past participle/form of enamor
  -> historical enamor relations
  -> Old French components
  -> component evidence
```

This prevents inflected forms from getting a shallower explanation merely
because their own page contains less morphology detail.

## Cache

The explanation schema is now:

`lexiflow-etymology-explanation-v2`

Cache identity includes:

- schema version;
- surface word;
- lookup lemma;
- current learning meaning.

Old V1 explanation entries therefore cannot be mistaken for V2 results.

## UI

The maintained frontend module is:

`public/etymology-insight-v2.js`

The old V1 UI module has been removed.

The UI renders:

- historical path when available;
- only grounded component cards;
- natural learner explanation;
- source links;
- retry state for provider/AI failure.

Unknown component meanings are omitted instead of displaying placeholders such
as “未说明” or “证据未明确说明”.

## Tests and project isolation

The maintained suite is:

`scripts/check-etymology-engine-v2.js`

It uses:

- fixed Wiktionary fixtures;
- fake fetch providers;
- fake AI output;
- an OS temporary cache directory removed after the run.

It never calls real external APIs and never writes generated test data into the
repository.

The suite covers:

- structured prefix decomposition;
- mention-plus morphology;
- exact Merriam-Webster headword isolation;
- component enrichment;
- verified authority enrichment for `mis-`;
- Old French component lookup for `enamor`;
- useful component recovery for `fascinate`;
- structural form-of traversal for `enamored -> enamor`;
- bounded graph traversal;
- persistent cache reuse;
- no AI call without evidence;
- rejection of invented graph components;
- rejection of audit-style learner prose;
- phrase rejection.

## Product principle

Authority/retrieval answers:

> What does the historical evidence actually support?

AI answers:

> How can a learner understand and remember that supported history?

Neither layer is allowed to substitute for the other.
