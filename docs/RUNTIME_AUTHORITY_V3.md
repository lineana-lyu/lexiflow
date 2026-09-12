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

The active study-entry/session authority is:

`DailyPlan -> study-session-v3.js -> legacy study renderer -> stage modules -> Learning Core -> learning-data.json`

`study-session-v3.js` owns:

- whether learning may start at all;
- the current same-day learning queue derived from the frozen DailyPlan;
- `Memorize -> Visualize -> Apply -> Select` queue order after Review is empty;
- the active learning card identity;
- pause versus crash/reload resume semantics;
- fail-closed protection if the transitional legacy renderer points at a different card;
- same-day session persistence through `lexiflow-study-session-v3`.

The session must not choose work through `activeLearningCards()[0]` or any other legacy queue.

`app.js` still renders the visual study page. Its private `startStudy(cardId)` already supports an explicit card ID, but the renderer has not yet been extracted into a narrow public bridge. Until that extraction is complete, Study Session V3 verifies that Learning Core ordering makes the legacy renderer point at exactly the card selected by the frozen DailyPlan. A mismatch must fail closed; it must never silently fall back to the legacy choice.

`study-resume-v2.js` is draft recovery only. It may restore Visualize and Apply drafts, but it must not own active-session persistence, click the learning entry button, or auto-resume a study session. Study Session V3 is the only runtime owner of study resume.

### Review execution

The only active Review execution path is:

`DailyPlan.review -> review-transaction-v3.js -> review-session-v3.js -> Learning Core -> learning-data.json`

`review-session-v3.js` owns:

- the frozen Review queue;
- one active question at a time;
- question-type freezing for an active attempt;
- cursor/progress;
- same-day repair tail;
- writing `reviewAuthority: "v3"` results.

`review-transaction-v3.js` owns crash-safe persistence recovery. A Review cursor must not advance merely because the UI was clicked; persisted `reviewCount` plus the V3 activity record are used to confirm the commit.

### Learning-stage completion

`stage-transition-v2.js` currently owns persisted completion for Select, Visualize and Apply. It intercepts the legacy UI controls before `app.js` can perform the old same-day transitions and delegates all cross-day gates to Learning Core.

`memorize-v2.js` owns the two-round Memorize behavior and its persisted completion.

## 2. Runtime-retired files

The following files remain in repository source/history for rollback and comparison only, but **must not be loaded by `public/index.html`**:

- `public/study-entry-v3.js`
- `public/review-transition-v2.js`
- `public/review-v2.js`
- `public/review-session-state-v2.js`

Do not re-add them to the runtime as a quick fix. Any missing study-entry behavior must be implemented in Study Session V3; any missing Review behavior must be implemented in Review Session V3, Review Transaction V3, or Learning Core.

Legacy localStorage keys may still be cleaned by `studyday-boundary-v2.js` during migration. Cleaning old residue does not make the old runtime active.

## 3. Study invariants

1. Learning cannot start while the current frozen `DailyPlan.review` is non-empty.
2. Learning work comes only from the current frozen DailyPlan.
3. Learning order after Review is `Memorize -> Visualize -> Apply -> Select`.
4. A user-initiated exit pauses the current session instead of being mistaken for a crash.
5. Closing/reloading the app without an explicit exit resumes the same valid same-day learning card.
6. If a completed card leaves the current DailyPlan bucket, the session advances to the next planned card after reload.
7. Cross-day boundaries expire the Study Session V3 runtime state but do not erase user Visualize/Apply drafts.
8. The old `activeLearningCards()[0]` selection must never override the frozen DailyPlan.
9. If the transitional renderer would open a different card, the session must stop rather than continue with the wrong card.
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
- `scripts/check-runtime-authority-v3.js` verifies the active authority map.
- `scripts/check-study-session-v3.js` verifies Study Session V3, pause/resume ownership and that the old Study Entry guard is absent from runtime.
- `scripts/check-review-session-v3.js` verifies Review session behavior.
- `scripts/check-review-transaction-v3.js` verifies crash-safe Review transaction recovery.
- existing StudyDay, Review policy, Advance Learning and Apply checks remain required.

A change that passes syntax checks but re-loads a retired study/review script is a regression.

## 6. Next cleanup boundary

The next architectural cleanup should extract the remaining study renderer dependency from `app.js` without rewriting product capabilities. The safe sequence is:

1. keep DailyPlan, Study Session V3 and Learning Core unchanged;
2. expose/extract a narrow renderer that opens one explicit card ID;
3. preserve current Memorize/Visualize/Apply UI behavior, source context, TTS, AI image generation and draft recovery;
4. replace the temporary `legacyFirstActiveId` compatibility check with direct `openCard(cardId)` rendering;
5. only after parity checks pass, remove the corresponding legacy queue-selection code from `app.js`;
6. do not rewrite dictionary, ECDICT, Kokoro TTS, AI image, Apply checking or local persistence during this cleanup.
