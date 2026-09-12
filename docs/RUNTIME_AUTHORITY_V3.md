# LexiFlow Runtime Authority V3

> Status: active contract for `feat/v7-airy-luminous-ui`.
>
> Purpose: prevent legacy Review/runtime patches from silently becoming authoritative again while the application is being rebaselined around the frozen V1 learning behavior.

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

### Study entry

`study-entry-v3.js` is the authority for which learning item may be opened from Today. It derives the expected card from the frozen DailyPlan and fails closed if the legacy `app.js` renderer would open a different card.

This is intentionally transitional: `app.js` still renders the learning screen after the V3 guard authorizes the entry. A future cleanup may extract the renderer, but `app.js` must not regain authority over queue selection or scheduling.

## 2. Runtime-retired Review files

The following files remain in repository history/source for rollback and comparison only, but **must not be loaded by `public/index.html`**:

- `public/review-transition-v2.js`
- `public/review-v2.js`
- `public/review-session-state-v2.js`

Do not re-add them to the runtime as a quick fix. Any missing behavior must be implemented in the V3 Review path or Learning Core.

Legacy localStorage keys may still be cleaned by `studyday-boundary-v2.js` during migration. Cleaning old residue does not make the old runtime active.

## 3. Active Review invariants

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

## 4. Regression gates

`npm run check:learning` must use the V3 runtime checks. In particular:

- `scripts/check-learning-engine-v3.js` verifies the central learning contract and that retired Review V2 scripts are absent from the runtime load chain.
- `scripts/check-runtime-authority-v3.js` verifies the active authority map.
- `scripts/check-review-session-v3.js` verifies Review session behavior.
- `scripts/check-review-transaction-v3.js` verifies crash-safe transaction recovery.
- existing StudyDay, Review policy, Study Entry, Advance Learning and Apply checks remain required.

A change that passes syntax checks but re-loads a retired Review V2 script is a regression.

## 5. Next cleanup boundary

The next architectural cleanup should target the remaining transitional dependency on `app.js` for learning-screen rendering. The safe sequence is:

1. keep DailyPlan and Learning Core unchanged;
2. extract/open one planned learning card by explicit card ID;
3. preserve current Memorize/Visualize/Apply UI behavior and draft recovery;
4. only after parity tests pass, remove the `legacyFirstActiveId` compatibility check;
5. do not rewrite dictionary, TTS, AI image, Apply checking or local persistence while doing this cleanup.
