# Morpheme Coverage Audit — 2026-09-22

## Executive result

The first P0 verification pass is complete.

Current factual layers:

- 68 source-language authority morphemes;
- 64 authority source records;
- 12 historical-English transmission mappings;
- 24 transmission evidence source records.

Current candidate workflow:

- 3 candidate forms intentionally closed as not publishable;
- 1 candidate form deferred for additional evidence;
- **0 actionable P0 candidates remain**.

This does not mean all candidate forms are factual or covered. It means the
highest-priority verification queue has been resolved without forcing unsupported
forms into production.

## Raw coverage vs workflow coverage

Raw candidate coverage remains intentionally separate from verification workflow.

| Candidate pool | Covered | Partial | Missing |
| --- | ---: | ---: | ---: |
| Legacy morphology (68 families) | 26 | 7 | 35 |
| ECDICT Latin/Greek discovery (525 families) | 49 | 35 | 441 |

ECDICT workflow state:

| State | Families |
| --- | ---: |
| Fully complete/published | 49 |
| Closed after review | 2 |
| Deferred only | 1 |
| Still actionable | 473 |

Actionable priority bands:

- P0: **0**
- P1: **61**
- P2: **412**

The raw missing count is not expected to become zero. Candidate pools contain
pedagogical truncations, spelling variants, homographs, suffix-like forms, and
families that LexiFlow may intentionally decline to publish.

## P0 resolution record

### 1. VERS / VERT — resolved as Latin authority

Published under `lat-vert`:

- lemma: `verto`;
- source forms: `verto, verti, versum`;
- teaching forms: `VERT, VERS`;
- source: Lewis & Short.

Both teaching forms are source-language grounded.

### 2. METR / METER / METRY — split correctly across layers

Published authority:

- Greek `μέτρον`;
- attested stem/compound forms `μετρ- / μετρο-`;
- teaching forms `METR / METRO`.

Published transmission:

- `METER` → learned English measuring-device combining form;
- `METRY` → learned historical suffix through Greek/Latin/French transmission.

METER/METRY are intentionally not stored as Ancient Greek source forms.

### 3. GRAPH / GRAPHY — resolved across authority + transmission

- `GRAPH` remains Ancient Greek authority from `γράφω / γραφ-`;
- `GRAPHY` is now a learned-borrowing transmission mapping from the Greek
  writing/drawing family.

### 4. SPEC / SPIC / SPECT / SPECTRO — stronger evidence changed the boundary

Lewis & Short directly supports:

- `specio`;
- variant `spicio`;
- compound forms with `spexi, spectum`.

Therefore `SPEC / SPIC / SPECT` now belong to Latin authority.

`SPECTRO` remains downstream and is modeled as a modern learned/scientific
combining-form transmission.

### 5. PON / PONE / POSIT / POSE / POUND / POS

Source-language authority:

- `PON` from `pono`;
- `PONE` from `ponere`;
- `POSIT` from `positum`.

Transmission:

- `POSE` is modeled as a Romance historical analogy/replacement path rather
  than a direct Latin source form;
- `POUND` is modeled through the `componere → compound` historical path.

Candidate disposition:

- `POS` is **closed_not_publish**. It is treated as a pedagogical truncation,
  not a separately attested source-language morpheme.

### 6. MIT / MISS / MITT / MIS / MISE

Authority:

- `MIT / MISS` remain under Latin `mitto / misi / missum`.

Historical grammar correction:

- Allen & Greenough explicitly analyzes `mitt-i-tis` with root `MIT`;
- therefore `MITT` is consonant doubling in the present stem, not a separate
  root.

Transmission:

- `MISE` is mapped through the French/English path visible in `surmise`.

Candidate dispositions:

- `MITT`: **closed_not_publish**;
- `MIS`: **closed_not_publish**, because learner-facing MIS would collide with
  the unrelated English/Germanic `mis-` prefix and does not improve the
  authority model.

### 7. TEN / TENT / TAIN / TIN

Published:

- `TEN / TENT` in Latin authority;
- `TAIN` in historical English transmission.

Candidate disposition:

- `TIN`: **deferred_needs_evidence**.

It remains visible to the verification workflow, but does not block the current
P0 queue and is not published until a direct compound-stem/vowel-change rule is
documented.

### 8. FER / LAT / LATE

Authority:

- `FER` from `fero / ferre`;
- `LAT` is now explicitly accepted from the suppletive participial
  `latus / latum`, directly linked by Lewis & Short to `fero`.

Transmission:

- `LATE` is downstream, represented through learned verbs such as
  `relate / translate`.

## Candidate-decision architecture

A new file, `data/morpheme-candidate-decisions.json`, records reviewed
candidate forms that should not simply remain "unresolved".

Supported dispositions:

- `closed_not_publish`
- `deferred_needs_evidence`

These dispositions are workflow metadata only. They cannot create authority or
transmission facts.

The coverage audit now reports two separate dimensions:

1. **raw coverage** — whether a candidate form is actually published;
2. **workflow state** — whether remaining gaps are actionable, intentionally
   closed, or deferred.

This prevents "not publishing a bad morpheme" from being mistaken for unfinished
work, while also preventing a closed decision from inflating factual coverage.

## Next actionable queue

There are no P0 items left. The highest remaining items are P1 candidates,
starting with:

1. `GEN / GENER` — unresolved GENER;
2. `DIC / DICT` — unresolved DIC;
3. `VIV / VIVI / VIT` — unresolved VIVI/VIT;
4. `CAP / CIP / CAPT / CEPT / CEIVE / CEIT`;
5. `PED / PEDI / PEDE`;
6. `FAC / FIC / FEC / FACT / FECT`;
7. `CED / CES / CEED / CEDE / CESS`;
8. `STA / STAS / STAT / STANT / STANCE`;
9. `BIO / BI / BE`;
10. `ACT / AG`.

These remain candidate-review tasks, not approved etymological groupings.

## CI result

Learning Engine Check #860 completed successfully after:

- authority validation;
- authority provenance audit;
- transmission validation;
- transmission runtime checks;
- decision-aware coverage audit;
- full repository checks;
- learning-engine deterministic checks.

The branch remains a draft PR and has not been merged into `main`.

## P1 batch — TRANS / TRI / REG / HYDRO / EPI and downstream forms

This batch resolved the next high-value P1 group without widening source-language
claims beyond the evidence.

### Source-language authority added

- `TRANS- / TRA-` ← Latin `trans`
  - Lewis & Short directly documents compound spelling alternation between
    `trans-` and `tra-` in specific phonological environments.
- `TRI` ← Latin `tres / tria`
  - Lewis & Short also explicitly references `tri-` in the formation of
    `tribus`.
- `REG / RIG / RECT` ← Latin `rego, rexi, rectum`
  - `RIG` is source-language grounded by `corrigo`, which Lewis & Short
    explicitly marks as a compound of `rego`.
- `HYDRO` ← Ancient Greek `ὕδωρ`
  - Greek compound form `ὑδρο-` is directly attested in LSJ
    `ὑδροφόρος`.
- `EPI-` ← Ancient Greek `ἐπί`
  - only the conservative EPI- teaching form is published.

### Transmission mappings added

- `VOKE` → Latin `VOC` family through Old French / English forms such as
  `invoke`.
- `VISE` → Latin `VID / VIS` family through French / English
  `revise`.
- `PHONE / PHONY / PHONO` → Greek `PHON` family as learned English
  combining/suffix forms.
- `CLOS` → Latin `CLUD / CLUS` family through Old French `clos/clore`.
- `HYDR` → Greek `HYDRO` family as the reduced learned combining form.

### Deferred forms

- `EPH`
- `EP`

Both are retained as candidate-level deferred forms until an approved Ancient
Greek grammar source is attached to the exact elision/euphony rule.

### Coverage result after the batch

- authority: **77 morphemes / 88 sources**
- transmission: **23 mappings / 46 sources**
- ECDICT raw coverage: **65 covered / 31 partial / 429 missing**
- workflow: **65 complete / 7 closed / 2 deferred / 451 actionable**
- actionable bands: **P0 0 / P1 42 / P2 409**

The highest remaining P1 queue now begins with:

- JECT / JET / JAC
- EN / EM
- CURR / CURS / CORR / COUR / COURS
- BI / BIN
- CAPIT / CIPIT
- CIS / CID / CIDE
- CLAUS
- AB / ABS
- MOV / MOT / MOB
- SED / SID / SESS

