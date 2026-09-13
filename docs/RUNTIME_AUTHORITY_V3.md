# LexiFlow Runtime Authority V3

> Status: active runtime source of truth for `feat/v7-airy-luminous-ui`.
>
> Product behavior is defined by `docs/PRODUCT_LEARNING_CONTRACT_V3.md`. This document defines which runtime module is allowed to own each behavior. Runtime code must conform to the product contract; compatibility code must not redefine the learning method.

## 1. Active control plane

The active deterministic learning control plane is:

`Learning Core V3 -> Learning Data Gateway V3 -> StudyDay Boundary V3 -> Stage Transition V3 -> Today Plan V3 -> DailyPlan Persistence V3 -> Advance Learning V3 -> Study / Review V3`

Canonical product stages are:

`Select -> Memorize -> Visualize -> Apply -> Review`

`Stable` is a memory state, not an active sixth stage. Historical `memorize1` / `memorize2` are compatibility reads only and normalize to canonical `memorize`.

Normal Today priority is:

`Review -> Memorize -> Visualize -> Apply -> Select`

No runtime module may create a second stage model, a second Review scheduler, or a second Today membership algorithm.

## 2. Learning Core V3

`public/learning-core-v3.js` is the deterministic rule authority for:

- StudyDay and date semantics;
- canonical stage identity;
- frozen DailyPlan construction;
- No Vocabulary Debt behavior;
- cross-day stage eligibility;
- Review ladder `1 -> 3 -> 7 -> 16 -> 21`;
- Stable maintenance ladder `30 -> 45 -> 68 -> 90`;
- Review Again, one same-day repair, and mandatory next-learning-day validation;
- compatibility normalization of historical stage values.

AI must never decide stage transitions, StudyDay eligibility, Today membership, Review intervals, Stable state, or Review Again state.

## 3. Learning Data Gateway V3

`public/learning-data-gateway-v3.js` is the single learning-data compatibility boundary around `/api/learning-data`.

It may:

- normalize incoming and outgoing datasets through Learning Core V3;
- preserve deterministic cross-day guards on generic writes;
- rebuild the canonical frozen DailyPlan before persistence;
- perform the narrowly scoped safe legacy Chinese-meaning repair;
- tag writes with learning-data or migration authority;
- expose a defensive persistence-confirmed in-memory snapshot;
- run explicitly registered outgoing mutators;
- notify registered after-persist listeners only after successful persistence.

The Gateway snapshot is persistence-confirmed state, not optimistic state. Failed POSTs must not advance it.

Feature modules that need learning-data coordination must use the Gateway snapshot/hooks instead of installing another `/api/learning-data` observer.

## 4. StudyDay and Today ownership

### StudyDay Boundary V3

`public/studyday-boundary-v3.js` owns the current StudyDay marker and day rollover cleanup.

It may migrate/remove the historical V2 runtime-day key, but must not erase durable Visualize/Apply drafts or learning history.

### Today Plan V3

`public/today-plan-v3.js` owns:

- the visible compact Today surface;
- Pending -> Today Select commands;
- Today Select -> Pending commands;
- the frozen same-day denominator and membership presentation.

Pending belongs to Word Library, not a standalone Inbox product surface.

Today Plan writes use `todayPlanAuthority: "v3"` and its activities use `authority: "today-plan-v3"`.

### DailyPlan Persistence V3

`public/daily-plan-persistence-v3.js` explicitly persists a newly built frozen DailyPlan. It prefers the Gateway snapshot and uses a direct GET only as a cold fallback. It must not create hidden GET-side persistence or replace global fetch.

### Advance Learning V3

`public/advance-learning-v3.js` owns optional early learning after normal Today work is complete.

Only Memorize, Visualize, or Apply may be unlocked early. Review can never be unlocked early. One early allowance must not chain multiple future stages on the same StudyDay.

Presentation redraws are Gateway-first. The actual unlock operation still forces a fresh source read before mutating the frozen plan.

## 5. App shell boundary

`public/app.js` owns generic product capabilities only:

- routing/navigation;
- dictionary and search UI;
- Add Word;
- Word Library and card editing;
- Settings;
- shared modal/toast/notice UI;
- generic TTS/audio entry points;
- the narrow `window.LexiFlowStudyRenderer` bridge.

The Study Renderer bridge exposes exact-card operations only:

- `openCard(cardId)`;
- `currentCardId()`;
- `hasCard(cardId)`.

`app.js` must not own:

- a `STAGES` learning model;
- `memorize1` / `memorize2` product stages;
- legacy Select/Visualize/Apply renderers;
- automatic stage AI calls;
- Review queue/cursor/scheduler logic;
- DailyPlan construction;
- implicit active-card selection.

The app shell follows Gateway after-persist snapshots so generic full-data saves cannot knowingly continue from an old learning snapshot.

Generic app-shell learning-data writes identify themselves with `appShellAuthority: "v1"`.

## 6. Study execution

The active learning path is:

`DailyPlan -> study-session-v3.js -> LexiFlowStudyRenderer.openCard(cardId) -> study-stage-surface-v3.js -> stage renderer/action -> Stage Transition / Learning Core -> learning-data`

`public/study-session-v3.js` owns:

- whether normal learning may start;
- exact queue membership from frozen DailyPlan;
- learning order after Review is empty;
- active card identity;
- pause vs crash/reload resume;
- same-day study-session persistence;
- fail-closed behavior when the planned exact card cannot render.

`public/study-stage-surface-v3.js` owns the canonical five-stage progress surface and the passive stage host. Missing V3 rendering must fail closed rather than reveal a legacy stage body.

Active stage renderers are:

- `select-stage-v3.js`;
- `memorize-stage-v3.js`;
- `visualize-stage-v3.js`;
- `apply-stage-v3.js`;
- `review-session-v3.js`.

## 7. Stage completion and write serialization

`public/stage-transition-v3.js` is the persisted authority for normal Select, Visualize, and Apply completion.

It must:

- resolve the exact active card through `LexiFlowStudyRenderer.currentCardId()`;
- use Learning Core `crossDayPatch()`;
- write canonical `memorize` only;
- use deterministic command IDs for idempotency;
- identify persisted writes with `stageTransitionAuthority: "v3"`;
- identify activities with `authority: "stage-transition-v3"`;
- schedule Apply -> Review for the next eligible StudyDay.

For one StudyDay/card/stage there is one terminal command identity:

`stage:${StudyDay}:${cardId}:${stage}`

Normal completion and Skip are competing outcomes of that command.

Stage Transition also exposes the narrow `beginStageWrite()` / `endStageWrite()` serialization scope. Any Visualize/Apply operation that persists a full learning dataset must participate before loading mutable state so late async results cannot overwrite terminal transitions.

### Memorize

`memorize-stage-v3.js` owns Memorize exercise/session state and canonical Memorize completion. Recall directions remain internal exercise state.

### Visualize

`visualize-stage-v3.js` owns learner-first scene refinement, explicit AI assistance, image generation/upload, and durable image checkpoints.

Generated/uploaded images persist as unconfirmed checkpoints until explicit finish. Refresh/crash must not discard a prepared image.

`visualize-actions-v3.js` owns explicit Skip and shares the same terminal command/write scope.

### Apply

`apply-stage-v3.js` owns learner expression, `/api/ai/text` checking, optional practice-prompt refresh, and learner-controlled adoption of corrections.

`apply-actions-v3.js` owns Draft and Skip.

`apply-quality-v3.js` is an explicit quality bridge. It does not rewrite global fetch. `apply-stage-v3.js` passes AI feedback to `LexiFlowApplyQualityV3.processFeedback()` so the progressive feedback policy remains explicit.

`apply-guard-v3.js` independently validates the exact active Apply card immediately before completion.

## 8. AI authority

`public/ai-assist-v3.js` is the only frontend owner of:

- `/api/ai/visual-scene`;
- `/api/ai/practice-prompt`.

Visualize and Apply may call it only through explicit learner actions.

The retired `runtime-fixes.js` Stage-AI firewall no longer exists. Regression protection is now structural and test-based: retired app-shell callers/functions must stay absent, and Stage AI endpoint ownership must remain exclusive to AI Assist V3.

AI is assistive only. It cannot decide deterministic learning state.

## 9. Transport and dictionary boundary

`public/transport-fixes.js` is the active generic transport compatibility layer.

It currently owns narrowly scoped transport normalization such as:

- Chinese smart-search normalization;
- Chinese `/api/dictionary/lookup` response normalization;
- image-job transport compatibility;
- unified phrase-voice transport behavior.

It must not own Stage AI endpoints or learning-stage transitions.

`public/runtime-fixes.js` is retired and must stay deleted.

### Remaining dictionary hydration exception

`public/example-hydration.js` currently remains a dictionary-only fetch observer for `/api/search/smart` and `/api/dictionary/lookup` so local ECDICT results can asynchronously receive missing examples and pronunciation metadata.

This is a compatibility exception, not learning-engine authority. It must not observe `/api/learning-data`, change stage state, decide Today membership, or alter Review scheduling.

A future migration may replace this observer with an explicit payload bridge, but that migration is not considered complete until the code is actually committed and regression checks pass.

## 10. Review authority

The only active Review path is:

`DailyPlan.review -> review-transaction-v3.js -> review-session-v3.js -> Learning Core V3 -> learning-data`

`review-session-v3.js` owns:

- the frozen Review queue/cursor;
- active-recall question presentation;
- system-owned question-type selection;
- one eligible same-day repair tail;
- alternate recall type for repair when available;
- persisted results tagged `reviewAuthority: "v3"`.

`review-transaction-v3.js` owns crash-safe commit recovery. Cursor advancement requires persistence evidence; a click alone is insufficient.

Review invariants:

1. A due timestamp belongs to its whole StudyDay.
2. First active recall controls long-term progression.
3. First failure enters Review Again.
4. At most one same-day repair is allowed.
5. Same-day repair success does not restore a long interval immediately.
6. The next learning day must validate the failed item again.
7. Stable is reversible after failed recall.
8. Duplicate writes must not increment Review twice.

Review settings may change only how many due items enter a newly built StudyDay plan. They do not change the deterministic interval algorithm.

## 11. Source Context and drafts

`source-context-v3.js` owns optional source-context capture/editing. It binds reminders to exact card ID plus canonical stage and preserves metadata through Gateway hooks.

`study-drafts-v3.js` owns draft recovery only. Historical storage-key names may remain when required for upgrade continuity; a legacy key name does not make a retired runtime authoritative.

## 12. Learning-data reset

`safety-controls.js` uses the dedicated reset operation and must verify persistence before reporting success.

A full reset must:

- replace persisted learning cards/activities with an empty dataset while preserving settings;
- remove learning images where possible;
- invalidate queued/in-flight image work;
- re-read persisted learning data before success UI;
- clear Study/Review/draft/audit and StudyDay runtime residue;
- report partial cleanup honestly when file deletion is blocked by the OS.

## 13. Retired runtime sources

The following sources must not return to the active runtime load chain and, where deleted, must stay deleted:

- `public/runtime-fixes.js`
- `public/learning-core-v2.js`
- `public/learning-engine-v2.js`
- `public/legacy-data-fix.js`
- `public/studyday-boundary-v2.js`
- `public/stage-transition-v2.js`
- `public/today-plan-v2.js`
- `public/daily-plan-persistence-v2.js`
- `public/advance-learning-v2.js`
- `public/study-entry-v3.js`
- `public/review-transition-v2.js`
- `public/review-v2.js`
- `public/review-session-state-v2.js`
- `public/study-resume-v2.js`
- `public/visualize-v2.js`
- `public/memorize-v2.js`
- `public/source-context-v2.js`
- `public/review-policy-v2.js`
- `public/apply-guard-v2.js`

## 14. Regression gates

`npm run check` and `npm run check:learning` are required before accepting a learning-runtime change.

Current regression gates protect:

- canonical five-stage model and historical-stage migration reads;
- cross-day gating and frozen DailyPlan semantics;
- Learning Data Gateway snapshot and hook behavior;
- Today / Pending ownership;
- StudyDay rollover;
- exact-card Study Session execution;
- stage write serialization and deterministic command IDs;
- learner-first Visualize and Apply behavior;
- Apply quality/guard behavior;
- AI Assist endpoint ownership;
- Review scheduling, same-day repair, and crash-safe transactions;
- reset correctness;
- physical absence of retired app-shell stage renderers and retired runtime sources.

A change is a regression even if syntax is valid when it:

- restores a retired runtime source;
- restores `memorize1` / `memorize2` as product stages;
- lets normal learning stages chain on the same StudyDay;
- rebuilds Review membership outside frozen DailyPlan;
- lets AI choose deterministic learning state;
- reintroduces automatic Visualize/Apply AI calls;
- lets `app.js` become a parallel learning engine;
- introduces another learning-data observer outside the Gateway;
- creates a second active-card selector based on DOM text or insertion order.
