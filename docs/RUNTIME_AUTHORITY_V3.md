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
- writing `reviewAuthority: "v3"` results.

`review-transaction-v3.js` owns crash-safe persistence recovery. A Review cursor must not advance merely because the UI was clicked; persisted `reviewCount` plus the V3 activity record are used to confirm the commit.

### Learning-stage completion

`stage-transition-v2.js` owns persisted completion for Select, Visualize and Apply and delegates all cross-day gates to Learning Core. The generic `app.js` handlers fail closed if those authoritative transitions are unavailable; `app.js` no longer contains its former generic `advanceStage()` mutation path.

`memorize-v2.js` owns both the two-round Memorize UI and persisted completion. It resolves the active card only through `LexiFlowStudyRenderer.currentCardId()`; `app.js` provides a passive Memorize host and no longer contains the old `stageMem1` / `stageMem2` renderers or `memory-rate` state transitions.

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

## 4. Review invariants

1. Review membership comes only from the current frozen `DailyPlan.review`.
2. A date is due for the whole StudyDay; time-of-day must not make a word disappear from a morning plan.
3. First active recall controls long-term progression.
4. A failed first recall enters Review Again.
5. At most one same-day repair attempt is performed.
6. Same-day repair success never restores a long interval.
7. Next-learning-day validation is mandatory after failure.
8. Stable is reversible after a failed first recall.
9. Duplicate clicks/writes must not increment Review twice.
10. A crash after disk persistence but before cursor advance must resume after the committed item, not repeat or double-count it.

## 5. Regression gates

`npm run check:learning` must use the V3 runtime checks. In particular:

- `scripts/check-learning-engine-v3.js` verifies the central learning contract and active V3 load chain.
- `scripts/check-runtime-authority-v3.js` verifies the active authority map, explicit Study renderer bridge, and that removed shims stay absent.
- `scripts/check-study-session-v3.js` verifies Study Session V3, explicit card-ID rendering, pause/resume ownership and that the old Study Entry guard is absent from runtime.
- `scripts/check-review-session-v3.js` verifies Review session behavior.
- `scripts/check-review-transaction-v3.js` verifies crash-safe Review transaction recovery.
- existing StudyDay, Review policy, Advance Learning and Apply checks remain required.

A change that passes syntax checks but re-loads a retired study/review script, restores no-argument `startStudy()`, restores `activeLearningCards()[0]` as a Study entry fallback, or recreates a second Review queue/scheduler inside `app.js` is a regression.

## 6. Next cleanup boundary

The queue-selection dependency on `app.js` is now removed. The next cleanup may reduce the remaining rendering and stage-handler surface in `app.js`, but it must preserve product behavior.

Safe sequence:

1. keep DailyPlan, Study Session V3, `LexiFlowStudyRenderer` and Learning Core contracts unchanged;
2. move stage-specific rendering/interaction code out of `app.js` only in small, parity-tested slices;
3. keep `stage-transition-v2.js` and `memorize-v2.js` authoritative while their legacy equivalents are still present in `app.js`;
4. preserve Visualize/Apply drafts, source context, TTS, AI image generation and Apply checking during extraction;
5. only remove an old handler after a regression test proves the replacement owns the same user-visible behavior;
6. do not rewrite dictionary, ECDICT, Kokoro TTS, AI image, Apply checking or local persistence as part of renderer cleanup.
