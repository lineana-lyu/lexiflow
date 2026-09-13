# LexiFlow Product Learning Contract V3

> Status: product source of truth for `feat/v7-airy-luminous-ui`.
>
> Purpose: define what LexiFlow must do for the learner before implementation details are considered. Runtime modules and compatibility code must conform to this contract rather than redefining the learning method.

## 1. Product outcome

LexiFlow is not a vocabulary-recognition app. Its purpose is to turn words and phrases the learner genuinely encounters and wants to learn into active vocabulary that the learner can recall, connect to personal memory, use in original expression, and retain over time.

The target learning journey is:

`Encounter -> Understand -> Select -> Memorize -> Visualize -> Apply -> Review -> Stable`

The persisted product stages are exactly:

`Select -> Memorize -> Visualize -> Apply -> Review`

`Stable` is a memory state reached through Review, not a sixth active learning stage.

Historical `memorize1` / `memorize2` represent recall directions or rounds inside Memorize. They are never separate product stages.

## 2. Vocabulary identity

The learner does not merely learn a spelling string. The learning object is the intended sense of a word or phrase.

A learning card must preserve enough information to keep that intent unambiguous, including where available:

- word or phrase;
- phonetic form;
- pronunciation;
- part of speech;
- selected Chinese meaning;
- English and Chinese reference example;
- selected sense identity;
- optional source context describing where the learner encountered the word.

Dictionary lookup must remain fast enough to support capture in the moment. Local ECDICT may provide the fast primary lookup path, while external dictionary services may enrich or fall back when necessary. Lookup architecture must not change the learning-state contract.

## 3. Pending and Today

Newly saved vocabulary enters Word Library as Pending unless it is explicitly selected into the current StudyDay.

Pending is part of Word Library, not a separate Inbox product surface.

A Pending word enters today's Select bucket only through an explicit learner action and only when capacity is available. Removing it from Today returns it to Pending and removes it from the frozen Select denominator.

Today is a finite frozen StudyDay plan. It must not grow continuously while the learner is completing it.

The normal visible priority is:

`Review -> Memorize -> Visualize -> Apply -> Select`

This protects previously learned vocabulary before adding more new work.

## 4. No Vocabulary Debt

Missing previous days must not create accumulated new-word debt.

A new StudyDay is built from the learner's current real state. Due Review remains important, but missed daily new-word quotas are not multiplied into a large mandatory backlog.

The same day's DailyPlan is frozen and idempotent once created.

## 5. Select

Select answers one question:

> Is this the word sense I genuinely want to learn?

Select may show the word, pronunciation, phonetic form, part of speech, intended meaning, reference example, and optional source context.

Select is not a memorization round.

Completing Select moves the card to canonical `memorize`, but Memorize becomes eligible only on the next eligible StudyDay.

The learner must never be able to chain Select -> Memorize -> Visualize -> Apply on one normal StudyDay.

## 6. Memorize

Memorize develops active recall.

Its exercises may include both directions:

- English -> Chinese meaning;
- Chinese meaning -> English.

Additional reinforcement may occur inside the stage when the first recall is weak.

These directions and rounds are exercise/session state only. Persisted product stage remains `memorize`.

Completing Memorize schedules Visualize for the next eligible StudyDay.

## 7. Visualize

Visualize builds a personal memory cue.

The required interaction order is learner-first:

1. the learner forms or writes their own association, scene, person, place, action, object, or memory;
2. only after explicit learner action may AI help make that association more concrete;
3. the learner may generate an image or upload a personal image;
4. the learner explicitly finishes or explicitly skips the stage.

Opening Visualize must never automatically spend an AI request or invent the learner's first association.

AI suggestions are optional and non-authoritative.

Generated or uploaded images are durable checkpoints. They may persist before stage completion, but only explicit completion confirms the image and moves the card to Apply for the next eligible StudyDay.

## 8. Apply

Apply converts recognition into usable expression.

The learner must first express something they genuinely intend to say. The initial attempt may be written in Chinese or English.

AI may:

- check meaning and usage;
- translate the learner's intended meaning;
- check grammar and naturalness;
- propose a correction or more natural version;
- provide or refresh an optional practice topic.

AI must not silently replace the learner's sentence or complete Apply on the learner's behalf.

Normal Apply completion requires an original learner-owned expression using the target word or an accepted inflected form. An exact normalized copy of the dictionary reference example cannot graduate.

The learner may save a draft or explicitly skip with confirmation.

Completing Apply schedules the first Review for the next eligible StudyDay.

## 9. Speaking is a capability goal, not a sixth stage

LexiFlow's product promise includes learning to use and say vocabulary, not merely recognize it.

Speaking therefore cuts across the learning journey rather than creating a separate persisted `speak` stage.

Pronunciation playback, speaking prompts, recording, speech recognition, or later pronunciation feedback may be embedded inside Select, Memorize, Apply, or Review without changing the canonical stage model unless a future product rebaseline explicitly changes this contract.

## 10. Review and Stable

Review is deterministic active recall, not AI scheduling.

The active Review ladder is:

`1 -> 3 -> 7 -> 16 -> 21`

After successful long-term progression, the card may enter Stable maintenance:

`30 -> 45 -> 68 -> 90`

Review membership comes from the frozen DailyPlan.

The first active recall controls long-term progression. A first failure enters Review Again. At most one same-day repair is allowed, preferably with a different recall type when another valid type exists. Same-day repair success does not immediately restore a long interval; the next learning day must validate the failed item again.

Stable is reversible after failed recall.

AI must not choose Review dates, intervals, Stable state, Review Again state, or Today membership.

## 11. Advance Learning

After all normal Today work is complete, the learner may explicitly choose to do additional learning early.

Only one future Memorize, Visualize, or Apply allowance may be unlocked early in a StudyDay.

Review can never be unlocked early.

An early allowance must not chain multiple future stages of the same card on the same StudyDay.

## 12. AI role

AI is a coach, never the learning authority.

AI may assist interpretation, memory-scene refinement, image creation, expression checking, translation, correction, and optional practice prompts.

AI must never decide:

- stage transitions;
- StudyDay eligibility;
- Today membership;
- Review intervals;
- Stable / Review Again state;
- whether a required learner action happened.

## 13. Final implementation boundary

The target implementation boundary is:

- `app.js`: generic application shell, routing, dictionary, add-word flow, Word Library, settings, shared modal/toast/UI, and the narrow `LexiFlowStudyRenderer` bridge;
- Learning Core V3: deterministic learning rules;
- Learning Data Gateway V3: learning-data transport compatibility and confirmed snapshot;
- Today / DailyPlan / Study Session V3: StudyDay planning and exact-card execution;
- Select / Memorize / Visualize / Apply V3: stage-specific learner experience;
- Review V3: active recall and deterministic progression.

`app.js` must not remain an alternate learning engine. In the target state it must not own a legacy six-stage model, legacy Select/Visualize/Apply business logic, automatic stage AI calls, an independent Review scheduler, or implicit card selection.

## 14. Regression rule

A change is a product regression even if tests pass when it does any of the following:

- restores `memorize1` / `memorize2` as product stages;
- allows normal same-day chaining across learning stages;
- automatically generates the learner's first Visualize association;
- lets AI silently complete Apply;
- lets AI choose timing, Today membership, or memory state;
- accumulates missed new-word quotas as vocabulary debt;
- bypasses frozen DailyPlan identity or exact-card study execution;
- turns `app.js` back into an authoritative parallel learning engine.
