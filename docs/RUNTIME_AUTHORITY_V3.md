# LexiFlow Runtime Authority V3

> Status: active contract for `feat/v7-airy-luminous-ui`.
>
> Purpose: keep the learning method deterministic and prevent retired V2 study/review paths from becoming authoritative again.

## 1. Runtime control plane

The active learning control plane is V3 end to end:

`Learning Core V3 -> Learning Data Gateway V3 -> StudyDay Boundary V3 -> Stage Transition V3 -> Today Plan V3 -> DailyPlan Persistence V3 -> Advance Learning V3 -> Study / Review V3`

The browser-facing deterministic core remains `window.LexiFlowLearningCore` for compatibility, but its active source file is `public/learning-core-v3.js`.

### Learning Core V3

`public/learning-core-v3.js` is the deterministic authority for:

- StudyDay/date semantics;
- Today order `Review -> Memorize -> Visualize -> Apply -> Select`;
- canonical product stages `Select -> Memorize -> Visualize -> Apply -> Review`;
- compatibility reads of historical `memorize1` / `memorize2`, normalized to physical `stage: "memorize"` without discarding round/session data;
- frozen DailyPlan construction and No Vocabulary Debt behavior;
- cross-day stage eligibility;
- Review ladder `1 -> 3 -> 7 -> 16 -> 21`;
- Stable maintenance ladder `30 -> 45 -> 68 -> 90`;
- Review Again, one same-day repair, and mandatory next-learning-day validation.

AI must never decide stage transitions, Review intervals, Today membership, or Stable/Review Again state.

### Learning Data Gateway V3

`public/learning-data-gateway-v3.js` is the single compatibility boundary and the only learning-data transport observer around `/api/learning-data`.

It may intercept only that endpoint in order to:

- normalize all incoming and outgoing learning datasets through Learning Core V3;
- preserve deterministic cross-day guards for generic app writes;
- rebuild the canonical frozen DailyPlan before persistence;
- perform the narrowly scoped safe legacy Chinese-meaning repair;
- tag writes with `learningDataAuthority` / migration authority;
- expose a defensive in-memory snapshot for V3 UI modules;
- run explicitly registered outgoing feature mutators before deterministic normalization;
- notify explicitly registered after-persist listeners only after persistence succeeds.

The Gateway's in-memory snapshot is persistence-confirmed state, not optimistic state. A failed POST must not advance it. Successful POST and GET responses may advance the snapshot. Feature modules that need to preserve metadata across generic full-data writes must register through the Gateway instead of installing another `window.fetch` wrapper.

Legacy meaning migration deliberately bypasses feature outgoing mutators so a background migration cannot accidentally consume an unsaved feature draft.

The Gateway must not own stage UI, Review execution, AI Visualize behavior, or product navigation.

### StudyDay Boundary V3

`public/studyday-boundary-v3.js` owns the current StudyDay marker `lexiflow-studyday-runtime-v3`.

It may read and remove the legacy `lexiflow-studyday-runtime-v2` marker during upgrade. On a real day change it expires stale same-day Study/Review session state, but it must not erase durable Visualize/Apply drafts or learning history.

### Today Plan V3

`public/today-plan-v3.js` owns the visible compact Today surface and the explicit Pending <-> Today selection commands.

Rules:

- zero-count task rows are hidden;
- Today progress is part of the same compact card, not a second dashboard block;
- Pending words live inside Word Library rather than a separate Inbox product surface;
- selecting a Pending word explicitly adds it to today's frozen Select bucket when slots are available;
- moving a selected word back to Pending removes it from today's frozen denominator instead of falsely counting it as completed;
- Today Plan V3 must not rewrite global `window.fetch` or proxy learning-data responses;
- its writes are tagged `todayPlanAuthority: "v3"` and activities use `authority: "today-plan-v3"`.

### DailyPlan Persistence V3

`public/daily-plan-persistence-v3.js` persists a newly built frozen DailyPlan explicitly. It first reuses the confirmed Gateway snapshot and only falls back to a direct learning-data GET when no snapshot exists. It does not create hidden GET-side effects through a fetch wrapper and does not replace global fetch. Writes are tagged `dailyPlanAuthority: "v3"`.

### Runtime compatibility

`public/runtime-fixes.js` is transport-only. It may keep narrowly scoped Chinese dictionary display compatibility, but it must not observe or decorate Study DOM.

Dormant historical `app.js` callers for `/api/ai/visual-scene` and `/api/ai/practice-prompt` are now deliberately failed closed with `LEGACY_STAGE_AI_BLOCKED`. They must not be delegated into real AI work. This guarantees that rendering a retired stage body cannot spend an AI request, invent the learner's first Visualize association, or create an Apply prompt without an explicit learner action.

The only valid Visualize scene / Apply practice-prompt AI path is the explicit V3 stage action through `LexiFlowAiAssistV3`. `ai-assist-v3.js` captures the upstream transport before `runtime-fixes.js` is installed, so legitimate V3 AI actions do not pass through the retired-call block.

### Advance Learning V3

`public/advance-learning-v3.js` owns optional early learning after all normal Today work is complete.

Only Memorize, Visualize, or Apply may be unlocked early. Review can never be unlocked early. One optional early-stage allowance cannot chain multiple future stages on the same StudyDay. Persisted writes use `advanceLearningAuthority: "v3"`.

## 2. Study execution

The active learning path is:

`DailyPlan -> study-session-v3.js -> LexiFlowStudyRenderer.openCard(cardId) -> study-stage-surface-v3.js -> stage-specific V3 renderer/action -> Stage Transition / Learning Core -> learning-data`

`study-session-v3.js` owns:

- whether normal learning may start;
- the exact queue derived from the frozen DailyPlan;
- learning order `Memorize -> Visualize -> Apply -> Select` after Review is empty;
- the active card identity;
- user pause versus crash/reload resume;
- same-day session persistence through `lexiflow-study-session-v3`;
- fail-closed behavior when the exact planned card cannot be rendered.

It must never select a card through `activeLearningCards()[0]`, insertion order, visible word text, or another implicit selector.

`app.js` supplies the generic page shell and the narrow `window.LexiFlowStudyRenderer` bridge:

- `openCard(cardId)` opens one explicit card;
- `currentCardId()` reports the rendered card;
- `hasCard(cardId)` verifies local availability.

There is no valid no-argument fallback that may silently choose another card.

`study-stage-surface-v3.js` owns the canonical five-stage progress surface and quarantines residual historical stage bodies while the V3 renderer attaches. Missing V3 rendering must fail closed rather than leave legacy UI interactive.

The active stage modules are:

- `select-stage-v3.js`;
- `memorize-stage-v3.js`;
- `visualize-stage-v3.js`;
- `apply-stage-v3.js`;
- `review-session-v3.js`.

Memorize's two recall directions/rounds are exercise state inside one product stage, not separate persisted stages.

`study-drafts-v3.js` is draft recovery only. It may preserve the historical localStorage key for upgrade continuity, but it cannot own active-session selection or auto-click the learning entry point.

`source-context-v3.js` owns optional source-context capture/editing and binds study reminders to the explicit card ID plus canonical stage. It does not rewrite global fetch. Instead it registers an outgoing mutator with Learning Data Gateway V3 so generic card saves preserve edited source metadata, and an after-persist listener so a pending Add-page source draft is cleared only after the new card has actually persisted. Its DOM decoration redraws from the Gateway snapshot rather than GETing learning data on every mutation.

## 3. Stage completion and write serialization

`public/stage-transition-v3.js` is the persisted authority for normal Select, Visualize, and Apply completion.

It must:

- resolve the exact active card via `LexiFlowStudyRenderer.currentCardId()`;
- use Learning Core V3 `crossDayPatch()` for stage gates;
- write canonical `memorize`, never `memorize1`;
- record deterministic command IDs so retries are idempotent;
- tag writes `stageTransitionAuthority: "v3"` and activities `authority: "stage-transition-v3"`;
- schedule Apply -> Review for the next StudyDay rather than opening a same-day initial Review.

For a given StudyDay/card/stage there is one deterministic terminal command identity:

`stage:${StudyDay}:${cardId}:${stage}`

Normal completion and Skip are competing outcomes of that same command, not two unrelated commands. Outcome semantics live in activity data such as `skipped: true/false`.

`Stage Transition V3` also exposes the narrow in-memory `beginStageWrite()` / `endStageWrite()` serialization scope. Any operation that can persist a full card dataset while a card is in Visualize or Apply must participate in this scope before loading mutable data. This prevents two browser modules from reading the same old snapshot and later overwriting each other's stage result.

`memorize-stage-v3.js` owns Memorize exercise state and persisted Memorize completion. `initialMemoryWeak` records first-round weakness separately from whether a later reinforcement round passes.

`visualize-stage-v3.js` owns Visualize AI suggestion, image generation, image upload, and their persistent card patches. These asynchronous writes share the Visualize stage-write scope with completion/Skip, and a patch fails closed if the card has already left Visualize.

Generated and uploaded images are durable but initially unconfirmed Visualize checkpoints:

- image generation/upload persists the image immediately with `visualImageConfirmed: false`;
- the checkpoint records `visualImagePreparedAt` and whether the source was `generated` or `upload`;
- refresh, exit, or crash must not discard the prepared image;
- only explicit `finish-visual` sets `visualImageConfirmed: true` / `visualImageConfirmedAt` and transitions the card to Apply for the next StudyDay.

`visualize-actions-v3.js` owns explicit Visualize Skip. It uses the same Visualize command ID and stage-write scope as normal completion; only one terminal outcome may commit.

`apply-stage-v3.js` owns Apply expression checking and optional practice-prompt refresh. Prompt persistence shares the Apply stage-write scope and fails closed if the card has already left Apply.

`apply-actions-v3.js` owns Apply Draft and Skip:

- Draft persists learner work and pauses without completing Apply;
- Draft persistence is serialized with terminal Apply writes because it writes the full learning dataset;
- Skip requires explicit confirmation;
- Skip and normal completion share the same deterministic Apply command ID, while `skipped` distinguishes their outcomes;
- normal completion remains owned by Stage Transition V3.

`apply-quality-v3.js` owns Apply quality approval. Audit lookup is bound to the exact active card ID and its stored word/meaning, not visible DOM text. The learner must produce an original expression: an exact normalized copy of the dictionary reference example cannot graduate.

`apply-guard-v3.js` independently validates the exact current Apply card and target word immediately before completion. It also redraws from the Gateway snapshot rather than refetching learning data on every renderer mutation.

## 4. Learner-first AI behavior

AI is assistive, never authoritative.

### Visualize

Visualize starts from the learner's own association or scene. AI may make the scene more concrete only after explicit learner action. Image generation/upload is memory support and cannot alter learning stage or Review timing.

The V3 stage separates `assistBusy`, `imageBusy`, and `uploadBusy`; a text-assistance request must never impersonate an image-generation state. While a Visualize write is active, completion and Skip are visibly disabled and the shared stage-write scope prevents a stale asynchronous patch from reverting a terminal transition.

Historical automatic Visualize AI calls in `app.js` are dormant technical debt and are blocked at the runtime compatibility boundary. They are not permitted to reach AI Assist V3.

### Apply

Apply starts from the learner's own intended expression. AI may check, translate, or suggest a correction, but it cannot silently replace the learner sentence and cannot bypass the approval contract.

Optional practice-prompt refresh may update only the prompt. Its persistence is serialized with Apply completion/Draft/Skip so a late prompt result cannot move a card back from Review or erase a completed outcome.

Historical automatic Apply prompt calls in `app.js` are likewise blocked and cannot reach real AI. The V3 renderer must initiate prompt refresh explicitly.

## 5. Review execution

The only active Review path is:

`DailyPlan.review -> review-transaction-v3.js -> review-session-v3.js -> Learning Core V3 -> learning-data`

Review membership comes only from the frozen DailyPlan. `app.js` does not own a second due-card queue or interval scheduler.

`review-session-v3.js` owns:

- frozen Review queue and cursor;
- one active-recall question at a time;
- automatic system-owned question-type selection;
- one same-day repair tail after an eligible first-recall failure;
- choosing a different recall type for that repair when another type exists;
- persisted `reviewAuthority: "v3"` results.

Normal users do not configure Review question types or weights. Settings may only control how many due items enter a newly built day's frozen plan (`跟随系统安排 / 全部到期 / 自定义上限`). Changing that setting does not rewrite the already-frozen same-day queue.

`review-transaction-v3.js` owns crash-safe commit recovery. A click alone cannot advance the cursor; persisted `reviewCount` and V3 activity authority must confirm the commit. Failed question type is preserved so crash recovery cannot lose the alternate-type repair rule.

Review invariants:

1. A due timestamp belongs to its whole StudyDay, not only after its clock time.
2. First active recall controls long-term progression.
3. First failure enters Review Again.
4. At most one same-day repair is allowed.
5. Same-day repair success never restores a long interval immediately.
6. The next learning day must validate the failed item again.
7. Stable is reversible after failed recall.
8. Duplicate writes cannot increment Review twice.

## 6. Learning-data reset

The normal runtime is `server-runtime.js -> server-image-runtime.js -> server.js`.

`safety-controls.js` uses the dedicated reset operation and must verify persistence before reporting success.

A full reset must:

- atomically replace persisted learning cards/activities with an empty dataset while preserving settings;
- remove generated/local learning images where possible;
- invalidate queued/in-flight image work so late results cannot recreate reset residue;
- re-read persisted learning data before success UI;
- clear Study/Review/draft/audit localStorage residue;
- report partial cleanup honestly when the OS prevents file deletion.

A button animation or local in-memory clear is not evidence that reset succeeded.

## 7. Retired runtime sources

These sources must not return to the runtime load chain and, where removed, must stay deleted:

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

Legacy localStorage key names may remain temporarily when preserving upgrade continuity. A legacy storage key does not make a retired runtime authoritative.

## 8. Regression gates

`npm run check` and `npm run check:learning` are required before accepting a learning-runtime change.

The active checks cover:

- Learning Core V3 deterministic ladders, DailyPlan, canonical stages, and cross-day gates;
- Learning Data Gateway V3 normalization/migration boundary, successful-POST snapshot semantics, and feature hook API;
- Source Context preservation through Gateway hooks without a competing fetch wrapper;
- StudyDay due semantics and StudyDay Boundary V3;
- Review Policy, Review Session, and crash-safe Review Transaction V3;
- Today Plan and DailyPlan Persistence V3;
- Advance Learning V3;
- Study Session V3 exact-card selection and pause/resume;
- canonical stage renderers, serialized stage writes, image checkpoint semantics, and command idempotency;
- explicit AI Assist V3 ownership and fail-closed legacy stage-AI calls;
- exact-card Apply quality/guard behavior, Apply Draft/Skip, and Visualize Skip;
- verified reset behavior.

A syntax-clean change is still a regression if it:

- reloads a retired runtime;
- restores `learning-core-v2.js` as active authority;
- restores a no-argument study-card selector;
- rebuilds Review membership outside the frozen DailyPlan;
- writes `memorize1` / `memorize2` as current product stages;
- gives normal and Skip outcomes different command identities for the same card/stage/day;
- allows same-day Apply -> initial Review;
- lets Today UI or Source Context install another learning-data fetch wrapper;
- advances the Gateway's authoritative snapshot when persistence failed;
- lets a stale Visualize/Apply async write overwrite a terminal transition;
- lets dormant legacy stage rendering spend AI work;
- lets AI choose stage timing or Review scheduling.

## 9. Next cleanup boundary

The learning control plane is V3. The largest remaining technical debt is physical legacy code still present inside the large `public/app.js` even though V3 modules quarantine it at runtime and dormant stage-AI calls are now fail-closed.

Next cleanup should therefore be source deletion rather than another behavior rewrite:

1. keep Learning Core V3, Gateway V3, DailyPlan, Study Session V3, Stage Transition V3, and Review V3 contracts unchanged;
2. physically remove obsolete legacy Select/Visualize/Apply stage render bodies and obsolete stage-specific handlers from `app.js` in small parity-checked slices;
3. remove the dormant legacy auto-Visualize/auto-practice-prompt code once a safe source-edit boundary is available; until then the runtime block must remain regression-locked;
4. preserve dictionary/ECDICT, TTS, library editing, settings, Source Context V3, and generic navigation while shrinking `app.js`;
5. after each slice, run the full repository checks;
6. after repository checks are green, run a real Windows Electron click regression because CI cannot validate every GUI interaction.
