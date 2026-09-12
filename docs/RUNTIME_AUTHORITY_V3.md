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
- stage eligibility and cross-day gates;
- Review ladder `1 -> 3 -> 7 -> 16 -> 21`;
- Stable maintenance `30 -> 45 -> 68 -> 90`;
- Review Again and next-day validation transitions.

AI must never decide these transitions.

### Study execution

The active study-entry/session path is:

`DailyPlan -> study-session-v3.js -> LexiFlowStudyRenderer.openCard(cardId) -> stage modules -> Learning Core -> learning-data.json`

`study-session-v3.js` owns:

- whether learning may start at all;
- the current same-day learning queue derived from the frozen DailyPlan;
- `Memorize -> Visualize -> Apply -> Select` queue order after Review is empty;
- the active learning card identity;
- pause versus crash/reload resume semantics;
- same-day session persistence through `lexiflow-study-session-v3`;
- fail-closed behavior if the explicit renderer cannot open the planned card.

The session must not choose work through `activeLearningCards()[0]`, card insertion order, or any other legacy queue.

`app.js` still owns the visual study-page implementation, but it no longer chooses a learning card. It exposes only the narrow `window.LexiFlowStudyRenderer` bridge:

- `openCard(cardId)` renders one explicit card ID;
- `currentCardId()` reports the rendered card;
- `hasCard(cardId)` verifies that the local app state contains that card.

`startStudy(cardId)` has no no-argument fallback. A missing, Inbox, Review or mastered card is rejected instead of silently opening another item. If the legacy `continue-learning` handler is ever reached, it delegates back to `LexiFlowStudySessionV3.open()` rather than choosing a card itself.

`study-resume-v2.js` is draft recovery only. It may restore Visualize and Apply drafts, but it must not own active-session persistence, click the learning entry button, or auto-resume a study session. Study Session V3 is the only runtime owner of study resume.

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

`memorize-v2.js` owns both the two-round Memorize UI and persisted completion. It resolves the active card only through `LexiFlowStudyRenderer.currentCardId()`; `app.js` provides a passive Memorize host and no longer contains the old `stageMem1` / `stageMem2` renderers or `memory-rate` state transitions. Memorize completion also records a deterministic command ID and rejects double completion while persistence is in flight.

`initialMemoryWeak` is a record of first-round recall quality, not the result of the reinforcement round. If either direction fails in round 1, the card remains marked initially weak even if round 2 succeeds. `finalRoundPassed` separately records whether the final reinforcement round succeeded.

`visualize-v2.js` owns explicit Visualize skip. Skip has its own deterministic command ID and is distinct from normal Visualize completion.

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

They must not be recreated as quick fixes. Any missing study-entry behavior belongs in Study Session V3 or the narrow Study renderer bridge; any missing Review behavior belongs in Review Session V3, Review Transaction V3, or Learning Core.

`studyday-boundary-v2.js` may temporarily clean old localStorage keys left by previous application versions. Cleaning migration residue does not reactivate the removed runtimes.

## 3. Study invariants

1. Learning cannot start while the current frozen `DailyPlan.review` is non-empty.
2. Learning work comes only from the current frozen DailyPlan.
3. Learning order after Review is `Memorize -> Visualize -> Apply -> Select`.
4. Study Session V3 must pass the exact planned `cardId` to `LexiFlowStudyRenderer.openCard(cardId)`.
5. The renderer must never fall back to `activeLearningCards()[0]` or another implicit selector.
6. A user-initiated exit pauses the current session instead of being mistaken for a crash.
7. Closing/reloading the app without an explicit exit resumes the same valid same-day learning card.
8. If a completed card leaves the current DailyPlan bucket, the session advances to the next planned card after reload.
9. Cross-day boundaries expire the Study Session V3 runtime state but do not erase user Visualize/Apply drafts.
10. Early learning remains valid only when `advance-learning-v2.js` explicitly appends that card to the frozen DailyPlan after Today is otherwise complete.
11. Select, Memorize, normal Visualize, Visualize Skip, normal Apply and Apply Skip must be safe against duplicate completion attempts.
12. Apply Draft does not complete the stage; Apply Skip and normal Apply completion are different persisted outcomes.
13. A dictionary reference example cannot be submitted verbatim as the learner's Apply sentence.

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
- `scripts/check-runtime-authority-v3.js` verifies the active authority map, explicit Study renderer bridge, and that removed shims stay absent.
- `scripts/check-study-session-v3.js` verifies Study Session V3, explicit card-ID rendering, pause/resume ownership and that the old Study Entry guard is absent from runtime.
- `scripts/check-review-session-v3.js` verifies Review session behavior, alternate-type repair and crash-safe preservation of repair type.
- `scripts/check-review-transaction-v3.js` verifies crash-safe Review transaction recovery.
- `scripts/check-apply-quality-v3.js` verifies progressive Apply checking and reference-example copy rejection.
- `scripts/check-apply-actions-v3.js` verifies Apply Draft/Skip, exact card identity, source editing and fresh-user defaults.
- `scripts/check-stage-commands-v3.js` verifies deterministic/idempotent stage commands and first-round Memorize weakness semantics.
- `scripts/check-reset-v3.js` verifies persisted reset, learning-image cleanup and in-flight image invalidation.
- existing StudyDay, Review policy and Advance Learning checks remain required.

A change that passes syntax checks but re-loads a retired study/review script, restores no-argument `startStudy()`, restores `activeLearningCards()[0]` as a Study entry fallback, recreates a second Review queue/scheduler inside `app.js`, or allows a learning-stage completion to bypass its active authority is a regression.

## 6. Next cleanup boundary

The queue-selection dependency on `app.js` is removed and the active stage transitions now have retry protection. The next cleanup may reduce the remaining rendering and stage-handler surface in `app.js`, but it must preserve product behavior.

Safe sequence:

1. keep DailyPlan, Study Session V3, `LexiFlowStudyRenderer` and Learning Core contracts unchanged;
2. move stage-specific rendering/interaction code out of `app.js` only in small, parity-tested slices;
3. preserve Visualize/Apply drafts, source context, TTS, AI image generation and Apply checking during extraction;
4. only remove an old handler after a regression test proves the replacement owns the same user-visible behavior;
5. consolidate legacy `memorize1` / `memorize2` storage naming only after migration rules are explicit; do not change user-visible Memorize behavior merely for naming cleanup;
6. do not rewrite dictionary, ECDICT, Kokoro TTS, AI image generation or local persistence as part of renderer cleanup.
