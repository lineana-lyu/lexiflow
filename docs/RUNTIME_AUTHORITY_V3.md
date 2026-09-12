# LexiFlow Runtime Authority V3

> Status: active contract for `feat/v7-airy-luminous-ui`.
>
> Purpose: prevent legacy study/review runtime paths from silently becoming authoritative again while the application is being rebaselined around the frozen V1 learning behavior.

## 1. Single sources of authority

### Learning state and scheduling

`public/learning-core-v2.js` is the deterministic authority for:

- StudyDay/date semantics;
- `Review -> Memorize -> Visualize -> Apply -> Select` Today order;
- No Vocabulary Debt DailyPlan construction;
- canonical learning stages `Select -> Memorize -> Visualize -> Apply -> Review`;
- compatibility normalization of historical `memorize1` / `memorize2` to canonical `memorize`;
- stage eligibility and cross-day gates;
- Review ladder `1 -> 3 -> 7 -> 16 -> 21`;
- Stable maintenance `30 -> 45 -> 68 -> 90`;
- Review Again and next-day validation transitions.

AI must never decide these transitions.

### Study execution

The active study-entry/session path is:

`DailyPlan -> study-session-v3.js -> LexiFlowStudyRenderer.openCard(cardId) -> study-stage-surface-v3.js -> stage renderer/action modules -> Learning Core -> learning-data.json`

`study-session-v3.js` owns:

- whether learning may start at all;
- the current same-day learning queue derived from the frozen DailyPlan;
- `Memorize -> Visualize -> Apply -> Select` queue order after Review is empty;
- the active learning card identity;
- pause versus crash/reload resume semantics;
- same-day session persistence through `lexiflow-study-session-v3`;
- fail-closed behavior if the explicit renderer cannot open the planned card.

The session must not choose work through `activeLearningCards()[0]`, card insertion order, rendered word text, or any other legacy queue.

`app.js` still supplies the generic study-page shell and narrow explicit-card bridge, but it no longer owns the active stage experience. It exposes only `window.LexiFlowStudyRenderer`:

- `openCard(cardId)` opens one explicit card ID;
- `currentCardId()` reports the rendered card;
- `hasCard(cardId)` verifies that the local app state contains that card.

`startStudy(cardId)` has no no-argument fallback. A missing, Pending, Review or mastered card is rejected instead of silently opening another item. If the generic `continue-learning` handler is ever reached, it delegates back to `LexiFlowStudySessionV3.open()` rather than choosing a card itself.

`study-stage-surface-v3.js` owns the canonical five-stage learning surface. It rewrites the visible progress rail to `Select / Memorize / Visualize / Apply / Review`, normalizes residual legacy labels, and replaces any legacy stage body with a passive loading host until the corresponding authoritative stage renderer appears. Missing V3 rendering therefore fails closed instead of leaving a legacy Select/Visualize/Apply implementation interactive.

The active stage renderers are:

- `select-stage-v3.js` for Select;
- `memorize-v2.js` for the one canonical Memorize stage; its two recall directions and optional second round are internal exercise state, not product stages;
- `visualize-stage-v3.js` for Visualize;
- `apply-stage-v3.js` for Apply;
- `review-session-v3.js` for Review.

`study-drafts-v3.js` is draft recovery only. It restores Visualize and Apply text by explicit card ID and canonical stage, but it must not own active-session persistence, click the learning entry button, or auto-resume a study session. It intentionally keeps the existing `lexiflow-study-drafts-v2` storage key so installed users do not lose drafts merely because the runtime module was promoted to V3.

### Review execution

The only active Review execution path is:

`DailyPlan.review -> review-transaction-v3.js -> review-session-v3.js -> Learning Core -> learning-data.json`

`app.js` no longer contains a second Review queue, Review session renderer, +3/+1 scheduler, or same-day initial Review implementation. Its Review center is display-only and reads membership from the frozen DailyPlan; the generic `start-review` fallback delegates to `LexiFlowReviewSessionV3.open()` and fails closed if V3 is unavailable.

`review-session-v3.js` owns:

- the frozen Review queue;
- one active question at a time;
- question-type freezing for an active attempt;
- cursor/progress;
- same-day repair tail;
- automatic active-recall question selection;
- writing `reviewAuthority: "v3"` results.

Question type is system-owned rather than a normal user setting. A normal attempt may use EN->ZH, ZH->EN, or IMAGE->EN when an image exists. If a scheduled/stable first recall fails and receives the one allowed same-day repair, `repairTypeByCard` preserves the failed question type and the repair is selected from the remaining types. The repair therefore cannot simply repeat the exact failed cue.

`review-transaction-v3.js` owns crash-safe persistence recovery. A Review cursor must not advance merely because the UI was clicked; persisted `reviewCount` plus the V3 activity record are used to confirm the commit. The pending transaction also preserves `questionType` so a crash after persistence cannot lose the different-type repair rule.

### Learning-stage completion

`stage-transition-v2.js` owns persisted normal completion for Select, Visualize and Apply and delegates all cross-day gates to Learning Core. The generic `app.js` handlers fail closed if those authoritative transitions are unavailable; `app.js` no longer contains its former generic `advanceStage()` mutation path.

Normal Select, Visualize and Apply completion use deterministic same-StudyDay command IDs recorded on `stage-complete` activities. Retrying a committed command must resolve as already completed rather than creating a second completion record.

`memorize-v2.js` owns both the two-round Memorize UI and persisted completion. It resolves the active card only through `LexiFlowStudyRenderer.currentCardId()` and validates the canonical `memorize` stage. Memorize completion also records a deterministic command ID and rejects double completion while persistence is in flight.

`initialMemoryWeak` records first-round recall quality, not the result of the reinforcement round. If either direction fails in round 1, the card remains marked initially weak even if round 2 succeeds. `finalRoundPassed` separately records whether the final reinforcement round succeeded.

`visualize-actions-v3.js` owns explicit Visualize Skip. Skip has its own deterministic command ID, binds to the exact current card, uses canonical stage identity, and is distinct from normal Visualize completion. The retired `visualize-v2.js` action shim is not loaded or retained in the working tree.

`apply-actions-v3.js` owns Apply Draft and Skip semantics:

- Save Draft persists `applyDraft` and exits/pauses without completing Apply;
- Skip requires explicit confirmation, records `applySkipped`, uses Learning Core for the next-day Review transition, and has its own idempotent command ID;
- normal Apply completion remains owned by `stage-transition-v2.js`.

`apply-quality-v3.js` owns Apply quality approval. A final sentence can graduate only when it matches an approved audited original or an approved audited correction. Editing after audit invalidates approval. An exact normalized copy of the dictionary reference example is rejected before the AI check and again by the authoritative completion path, because Apply requires the learner to produce their own expression.

### Learning-data reset

The normal desktop/web runtime is `server-runtime.js -> server-image-runtime.js -> server.js`. `server-image-runtime.js` owns the dedicated `POST /api/learning-data/reset` operation used by `safety-controls.js`.

A full learning-data reset must:

- atomically replace persisted learning data with empty cards and activities;
- preserve application/learning settings;
- remove generated and locally uploaded learning images from the runtime generated-image directory;
- invalidate queued/in-flight image jobs so a late image result cannot recreate reset residue;
- re-read learning data on the client before reporting success;
- clear study/review/draft/audit localStorage residue;
- report partial image cleanup honestly if an OS file lock prevents removal.

A visual button state alone is never evidence that learning data was cleared.

## 2. Removed runtime shims

The following obsolete runtime files have been removed from the working tree. Their prior implementations remain available through Git history if rollback or comparison is ever needed:

- `public/study-entry-v3.js`
- `public/review-transition-v2.js`
- `public/review-v2.js`
- `public/review-session-state-v2.js`
- `public/study-resume-v2.js`
- `public/visualize-v2.js`

They must not be recreated as quick fixes. Missing study-entry behavior belongs in Study Session V3 or the narrow Study renderer bridge; missing stage UI belongs in the stage-specific V3 renderer/action modules; missing Review behavior belongs in Review Session V3, Review Transaction V3, or Learning Core.

`studyday-boundary-v2.js` may temporarily clean old localStorage keys left by previous application versions. Cleaning migration residue does not reactivate the removed runtimes.

## 3. Study invariants

1. Learning cannot start while the current frozen `DailyPlan.review` is non-empty.
2. Learning work comes only from the current frozen DailyPlan.
3. Learning order after Review is `Memorize -> Visualize -> Apply -> Select`.
4. Study Session V3 must pass the exact planned `cardId` to `LexiFlowStudyRenderer.openCard(cardId)`.
5. The renderer must never fall back to `activeLearningCards()[0]`, rendered word text, or another implicit selector.
6. A user-initiated exit pauses the current session instead of being mistaken for a crash.
7. Closing/reloading the app without an explicit exit resumes the same valid same-day learning card.
8. If a completed card leaves the current DailyPlan bucket, the session advances to the next planned card after reload.
9. Cross-day boundaries expire the Study Session V3 runtime state but do not erase user Visualize/Apply drafts.
10. Early learning remains valid only when `advance-learning-v2.js` explicitly appends that card to the frozen DailyPlan after Today is otherwise complete.
11. Select, Memorize, normal Visualize, Visualize Skip, normal Apply and Apply Skip must be safe against duplicate completion attempts.
12. Apply Draft does not complete the stage; Apply Skip and normal Apply completion are different persisted outcomes.
13. A dictionary reference example cannot be submitted verbatim as the learner's Apply sentence.
14. Product-visible study stages are exactly Select, Memorize, Visualize, Apply and Review; `memorize1` / `memorize2` are compatibility-only storage values.
15. A missing V3 stage renderer must leave a passive fail-closed host, never an interactive legacy stage implementation.
16. Visualize must start from the learner's own association; AI assistance may refine it only after explicit user action.
17. Apply must start from the learner's own expression; AI feedback cannot silently replace the learner's sentence.

## 4. Review invariants

1. Review membership comes only from the current frozen `DailyPlan.review`.
2. A date is due for the whole StudyDay; time-of-day must not make a word disappear from a morning plan.
3. First active recall controls long-term progression.
4. A failed first recall enters Review Again.
5. At most one same-day repair attempt is performed.
6. Same-day repair uses a different active-recall question type from the failed first attempt when another type exists; EN->ZH and ZH->EN guarantee an alternate type for current cards.
7. Same-day repair success never restores a long interval.
8. Next-learning-day validation is mandatory after failure.
9. Stable is reversible after a failed first recall.
10. Duplicate clicks/writes must not increment Review twice.
11. A crash after disk persistence but before cursor advance must resume after the committed item, not repeat or double-count it.
12. A crash must not erase the failed question type needed to choose the alternate same-day repair cue.

## 5. Regression gates

`npm run check:learning` must use the V3 runtime checks. In particular:

- `scripts/check-learning-engine-v3.js` verifies the central learning contract and active V3 load chain.
- `scripts/check-runtime-authority-v3.js` verifies the active authority map, passive stage host, explicit Study renderer bridge, promoted V3 draft/Visualize-action modules, and that removed shims stay absent.
- `scripts/check-study-session-v3.js` verifies Study Session V3, exact card-ID rendering, pause/resume ownership and V3-only draft recovery.
- `scripts/check-stage-renderers-v3.js` verifies the canonical five-stage surface plus Select/Visualize/Apply V3 renderers and learner-first behavior.
- `scripts/check-review-session-v3.js` verifies Review session behavior, alternate-type repair and crash-safe preservation of repair type.
- `scripts/check-review-transaction-v3.js` verifies crash-safe Review transaction recovery.
- `scripts/check-apply-quality-v3.js` verifies progressive Apply checking and reference-example copy rejection.
- `scripts/check-apply-actions-v3.js` verifies Apply Draft/Skip, Visualize Actions V3, exact card identity, source editing and fresh-user defaults.
- `scripts/check-stage-commands-v3.js` verifies deterministic/idempotent stage commands and first-round Memorize weakness semantics.
- `scripts/check-reset-v3.js` verifies persisted reset, learning-image cleanup and in-flight image invalidation.
- `scripts/check-stage-model-v3.js` verifies canonical stage migration semantics.
- existing StudyDay, Review policy and Advance Learning checks remain required.

A change that passes syntax checks but re-loads a retired study/review script, restores no-argument `startStudy()`, restores `activeLearningCards()[0]` as a Study entry fallback, recreates a second Review queue/scheduler inside `app.js`, exposes `memorize1` / `memorize2` as product stages, or allows a learning-stage completion to bypass its active authority is a regression.

## 6. Next cleanup boundary

The active Study experience is now rendered by the stage-specific modules, with the old `app.js` stage bodies quarantined behind a passive V3 host. The historical stage rendering/interaction functions still physically exist inside the large `app.js` source and remain technical debt; they are no longer intended to be interactive runtime authority.

Safe sequence from here:

1. keep DailyPlan, Study Session V3, Study Stage Surface V3, `LexiFlowStudyRenderer` and Learning Core contracts unchanged;
2. physically remove legacy `stageSelect`, `stageVisual`, `stageApply`, six-stage stepper data, and their obsolete stage-specific handlers from `app.js` only after a whole-file parity edit can be performed safely;
3. preserve generic shell/navigation, dictionary/ECDICT, TTS, library editing, source context and service settings while shrinking `app.js`;
4. migrate remaining support modules such as source-context stage branching to `core.canonicalStage()` before deleting compatibility assumptions;
5. consolidate persisted `stage` storage naming only after explicit data-migration tests prove old `memorize1` / `memorize2` installations load without loss;
6. do not rewrite dictionary, ECDICT, Kokoro TTS, AI image generation or local persistence as part of stage renderer cleanup;
7. after source cleanup, run a real Windows Electron end-to-end click regression in addition to repository CI; current CI is not a substitute for GUI interaction testing.
