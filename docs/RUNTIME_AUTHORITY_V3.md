# LexiFlow Runtime Authority V3

> Status: active contract for `feat/v7-airy-luminous-ui`.
>
> Purpose: keep the learning method deterministic and prevent retired V2 study/review paths from becoming authoritative again.

## 1. Runtime control plane

The active learning control plane is now V3 end to end:

`Learning Core V3 -> Learning Data Gateway V3 -> StudyDay Boundary V3 -> Stage Transition V3 -> Today Plan V3 -> DailyPlan Persistence V3 -> Advance Learning V3 -> Study / Review V3`

The browser-facing global for the deterministic core remains `window.LexiFlowLearningCore` for compatibility, but the active source file is `public/learning-core-v3.js`.

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

`public/learning-data-gateway-v3.js` is the single compatibility boundary around `/api/learning-data`.

It may intercept only that endpoint in order to:

- normalize all incoming and outgoing learning datasets through Learning Core V3;
- preserve deterministic cross-day guards for generic app writes;
- rebuild the canonical frozen DailyPlan before persistence;
- perform the narrowly scoped safe legacy Chinese-meaning repair;
- tag writes with `learningDataAuthority` / migration authority.

It must not own stage UI, Review execution, AI Visualize behavior, or product navigation.

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

`public/daily-plan-persistence-v3.js` persists a newly built frozen DailyPlan explicitly. It does not create GET-side effects and does not replace global fetch. Writes are tagged `dailyPlanAuthority: "v3"`.

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

`source-context-v3.js` owns optional source-context capture/editing and must bind all study reminders to the explicit card ID plus canonical stage.

## 3. Stage completion

`public/stage-transition-v3.js` is the persisted authority for normal Select, Visualize, and Apply completion.

It must:

- resolve the exact active card via `LexiFlowStudyRenderer.currentCardId()`;
- use Learning Core V3 `crossDayPatch()` for stage gates;
- write canonical `memorize`, never `memorize1`;
- record deterministic command IDs so retries are idempotent;
- tag writes `stageTransitionAuthority: "v3"` and activities `authority: "stage-transition-v3"`;
- schedule Apply -> Review for the next StudyDay rather than opening a same-day initial Review.

`memorize-stage-v3.js` owns Memorize exercise state and persisted Memorize completion. `initialMemoryWeak` records first-round weakness separately from whether a later reinforcement round passes.

`visualize-actions-v3.js` owns explicit Visualize Skip as a distinct idempotent command.

`apply-actions-v3.js` owns Apply Draft and Skip:

- Draft persists learner work and pauses without completing Apply;
- Skip requires explicit confirmation and is a distinct persisted outcome;
- normal completion remains owned by Stage Transition V3.

`apply-quality-v3.js` owns Apply quality approval. The learner must produce an original expression: an exact normalized copy of the dictionary reference example cannot graduate.

## 4. Learner-first AI behavior

AI is assistive, never authoritative.

### Visualize

Visualize starts from the learner's own association or scene. AI may make the scene more concrete only after explicit learner action. Image generation/upload is memory support and cannot alter learning stage or Review timing.

### Apply

Apply starts from the learner's own intended expression. AI may check, translate, or suggest a correction, but it cannot silently replace the learner sentence and cannot bypass the approval contract.

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
- Learning Data Gateway V3 normalization/migration boundary;
- StudyDay due semantics and StudyDay Boundary V3;
- Review Policy, Review Session, and crash-safe Review Transaction V3;
- Today Plan and DailyPlan Persistence V3;
- Advance Learning V3;
- Study Session V3 exact-card selection and pause/resume;
- canonical stage renderers and stage-command idempotency;
- Apply quality/actions and Visualize skip;
- verified reset behavior.

A syntax-clean change is still a regression if it:

- reloads a retired runtime;
- restores `learning-core-v2.js` as active authority;
- restores a no-argument study-card selector;
- rebuilds Review membership outside the frozen DailyPlan;
- writes `memorize1` / `memorize2` as current product stages;
- allows same-day Apply -> initial Review;
- lets Today UI mutate the global fetch layer;
- lets AI choose stage timing or Review scheduling.

## 9. Next cleanup boundary

The learning control plane is now V3. The largest remaining technical debt is physical legacy code still present inside the large `public/app.js` even though V3 modules quarantine it at runtime.

Next cleanup should therefore be source deletion rather than another behavior rewrite:

1. keep Learning Core V3, DailyPlan, Study Session V3, Stage Transition V3, and Review V3 contracts unchanged;
2. physically remove obsolete legacy Select/Visualize/Apply stage render bodies and obsolete stage-specific handlers from `app.js` in small parity-checked slices;
3. preserve dictionary/ECDICT, TTS, library editing, settings, Source Context V3, and generic navigation while shrinking `app.js`;
4. after each slice, run the full repository checks;
5. after repository checks are green, run a real Windows Electron click regression because CI cannot validate every GUI interaction.
