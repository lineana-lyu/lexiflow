# Morpheme Coverage Audit — 2026-09-22

> **Historical audit only.** This document records the pre-Etymology-Engine
> verification work completed on 2026-09-22. Its P0/P1/P2 queues are no longer
> the product roadmap or a release gate. Maintained CI now uses
> `scripts/check-morpheme-safety.js`; runtime word explanations start from
> word-level etymology evidence as defined in `docs/ETYMOLOGY_ENGINE_V1.md`.

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

## P1 batch — JAC/JET, EN/EM, CURR/COURS, BI/BIN, CAPIT/CIPIT

This batch resolved another five high-priority candidate families and fixed an
indexed-homograph false-coverage bug.

### JECT / JET / JAC

The discovery family mixed two related but distinct Latin verbs:

- `JECT` remains under Latin `iacio` "throw/cast";
- `JAC` is now a separate authority family under `iaceo/jaceo`
  "lie/be situated";
- `JET` is downstream Romance/English transmission through French
  `jeter/jet`.

LexiFlow therefore no longer treats JAC and JECT as one semantic root.

### EN / EM

`EN` and `EM` are modeled as transmission mappings to the existing Latin
locative `IN-` authority family:

- Latin `in-`
- Old French `en-/em-`
- Middle/Modern English `en-/em-`

They are not inserted as independent Classical Latin prefixes.

### CURR / CURS / COURS

Source-language authority remains:

- `CURR`
- `CURS`

A verified transmission mapping now covers `COURS` through:

- Latin `currere / cursus`
- Old French `cors/course`
- English `course`

Candidate forms `CUR`, `COR`, `CORR`, and `COUR` are intentionally
closed as unsafe or unnecessary pedagogical truncations.

### BI / BIN

The source-language layer now keeps two actual Latin numeral bases separate:

- `BIS` — twice / double;
- `BINI` — two by two / two each.

English learner forms are downstream:

- `BI` → linked to `BIS`;
- `BIN` → linked to `BINI`.

This avoids pretending that the modern English teaching forms are themselves
the Classical Latin dictionary headwords.

### CAPIT / CIPIT vs CAP / CIP / CEPT

A second CAP-like family is now explicitly separated:

- `CAP / CIP / CAPT / CEPT` ← Latin `capio` "take";
- `CAPIT / CIPIT` ← Latin `caput, capitis` "head".

Lewis & Short directly supports `capitis` and
`praeceps, praecipitis < prae-caput`, grounding CAPIT/CIPIT.

The indexed ECDICT candidate `cap2` previously lost its numeric discriminator
during normalization and falsely matched CAP < capio. The coverage audit now
allows candidate-specific review decisions to override raw surface-form matches,
and a regression assertion guarantees CAP2 cannot satisfy itself from the
CAP/take authority family.

### Coverage after the batch

- authority: **81 morphemes / 93 sources**
- transmission: **29 mappings / 56 sources**
- ECDICT raw coverage: **69 covered / 30 partial / 426 missing**
- workflow: **69 complete / 9 closed / 2 deferred / 445 actionable**
- candidate decisions: **16 closed / 3 deferred**
- actionable bands: **P0 0 / P1 37 / P2 408**

The next P1 queue begins with:

- CIS / CID / CIDE
- CLAUS
- AB / ABS
- MOV / MOT / MOB
- SED / SID / SESS
- AC-
- MIS-
- MAN / MANI / MANU / MAIN
- GRAD / GRADE
- VENI / VENE

## P1 batch — CID homograph split and collision registry

This batch resolves the two high-risk discovery families that share the same
normalized teaching form `CID` but come from different Latin verbs.

### CID / CIS / CIDE — cut / kill

Source-language authority:

- `CID / CIS` ← Latin `caedo, cecidi, caesum`;
- Lewis & Short compound `concido, concidi, concisum < caedo` directly
  attests both `-cid-` and `-cis-`.

Downstream transmission:

- `CIDE` is not inserted into Classical Latin authority;
- it is modeled as a Romance/English transmission through Latin
  `-cida / -cidium`, Middle French `-cide`, and English `-cide`;
- the mapping is independently cross-checked with Etymonline and Wiktionary.

### CAD / CAS / CID — fall

A separate authority family now records:

- `CAD / CAS / CID` ← Latin `cado, cecidi, casum`;
- Lewis & Short `accido, accidi < cado` directly grounds the fall-family
  `-cid-` compound form.

This `CID` is not the same family as `CID < caedo`.

### Generic collision architecture

New file:

- `data/morpheme-collisions.json`

The first registered collision is:

- surface form: `CID`;
- `ecdict:cis, cid1, -cide` → `lat-caed`;
- `ecdict:cad, cas, cid2` → `lat-cad`;
- `legacy:cid` → `lat-caed`.

Coverage resolution now follows:

1. candidate-specific decision;
2. candidate-specific collision binding;
3. surface matching only as fallback.

This removes the need for per-family patches such as `if CID2 ...` and turns
the CAP2 lesson into a reusable mechanism.

CI includes regressions proving that:

- cut/kill `CID1` resolves only to `lat-caed`;
- fall `CID2` resolves only to `lat-cad`;
- legacy `CID/CIS` resolves only to the cut family;
- `CIDE` remains outside source-language authority and maps through
  transmission.

### Coverage after the batch

Learning Engine Check #894 passed the full repository suite with:

- authority: **83 morphemes / 97 sources**;
- transmission: **30 mappings / 58 sources**;
- collision registry: **1 surface / 3 candidate bindings**;
- Legacy raw coverage: **31 covered / 6 partial / 31 missing**;
- ECDICT raw coverage: **71 covered / 30 partial / 424 missing**;
- workflow: **71 complete / 9 closed / 2 deferred / 443 actionable**;
- candidate decisions: **16 closed / 3 deferred**;
- actionable bands: **P0 0 / P1 35 / P2 408**.

The next P1 queue begins with:

- CLAUS;
- AB / ABS;
- MOV / MOT / MOB;
- SED / SID / SESS;
- AC-;
- MIS-;
- MAN / MANI / MANU / MAIN;
- GRAD / GRADE;
- VENI / VENE;
- BEN / BON.

## P1 batch — CLAUS, AB/ABS, MOV/MOT/MOB, SED/SID/SESS

This batch resolves four more P1 families while preserving the distinction
between attested source-language forms and pedagogical truncations.

### CLAUS / CLOS / CLUD / CLUS

The existing Latin `claudo` authority family now publishes:

- `CLAUS` — directly grounded by `clausi / clausum`;
- `CLUD` — the frequent compound form `cludo`;
- `CLUS` — the `clus-` branch already grounded in Latin compounds.

`CLOS` remains downstream Romance/English transmission through Old French
`clos / clore`. No new authority family was created merely to satisfy the
candidate row.

### AB- / ABS-

The existing Latin away-prefix authority now includes `ABS-`.

Lewis & Short directly records `ab, a, abs` and related historical variants,
so `ABS-` belongs in source-language authority rather than transmission.

### MOV / MOT / MOB

`MOV / MOT` remain grounded in Latin `moveo, movi, motum`.

`MOB` is intentionally `closed_not_publish`. It is a pedagogical truncation
associated with the later `mobilis/mobile` line, not a separately attested
source-language root form. LexiFlow does not publish it simply to make the
candidate appear fully covered.

### SED / SID / SESS

A new Latin authority family now records:

- `SED` ← `sedeo`;
- `SESS` ← `sessum`;
- `SID` ← compound forms such as `assideo/adsideo`, explicitly linked by
  Lewis & Short to `sedeo`.

This creates a genuine normalized-form collision with the existing separative
prefix:

- `SE-/SED-` = apart;
- `SED/SID/SESS` = sit / be seated.

The collision registry now contains a second surface, `SED`, and binds both
the ECDICT and legacy sitting candidates specifically to `lat-sed-sit`.
Coverage regression tests prove that the separative `lat-se` prefix cannot
satisfy the sitting-root candidate.

### Coverage after the batch

Learning Engine Check #902 passed the complete repository suite with:

- authority: **84 morphemes / 100 sources**;
- transmission: **30 mappings / 58 sources**;
- collision registry: **2 surfaces / 5 candidate bindings**;
- Legacy raw coverage: **32 covered / 5 partial / 31 missing**;
- ECDICT raw coverage: **74 covered / 27 partial / 424 missing**;
- workflow: **74 complete / 10 closed / 2 deferred / 439 actionable**;
- candidate decisions: **17 closed / 3 deferred**;
- actionable bands: **P0 0 / P1 31 / P2 408**.

The next P1 queue should be re-read from the generated audit rather than
continued from the previous static list; the highest remaining families now
exclude CLAUS, AB/ABS, MOV/MOT/MOB, and SED/SID/SESS.



## P1 batch — AC, MIS, MANUS, GRADE, VENE

This batch resolves five additional P1 families and adds explicit handling for
incorrect discovery-language hints.

### AC-

`AC-` is now published inside the existing Latin `AD-` prefix family as an
attested assimilation, backed by the same grammar evidence already used for the
AD-prefix variant system. It is not modeled as an independent prefix.

### MIS-

ECDICT labels `MIS-` as Latin, but Bosworth-Toller directly attests Old
English `mis-` (with historical variants `miss-/mist-/misse-`) as a
Germanic prefix denoting defect or imperfection.

LexiFlow therefore:

- publishes `MIS-` from a new Old English authority record;
- keeps it separate from Latin `MIT/MISS`;
- marks the specific Latin-classified ECDICT candidate
  `closed_not_publish`.

This prevents a wrong origin hint from becoming false verified coverage.

### MAN / MANI / MANU / MAIN

A new Latin `manus` family publishes:

- `MANU` from attested `manu`;
- `MAN` from compounds such as `manceps < manus-capio`;
- `MANI` from `manipulus < manus-pleo`.

`MAIN` remains outside Classical Latin authority and is represented through
Romance/English transmission using the `maintain / maintenance` pathway from
Latin `manu tenere`.

### GRAD / GRADE

The existing `GRAD/GRESS` family now preserves both:

- Latin `gradior / gressus` for step/walk/go;
- Latin `gradus` for step/degree.

`GRADE` is modeled as later French/English transmission from Latin
`gradus`, not as a Classical Latin root form.

### VEN / VENI / VENT / VENE

The existing `venio` authority now publishes `VENI` alongside
`VEN/VENT`, grounded in `venio/venire`.

`VENE` remains downstream transmission through forms such as Old French
`convenir` and English `convene`.

### Coverage after the batch

Learning Engine Check #911 passed the complete repository suite with:

- authority: **86 morphemes / 105 sources**;
- transmission: **33 mappings / 64 sources**;
- Legacy raw coverage: **33 covered / 5 partial / 30 missing**;
- ECDICT raw coverage: **78 covered / 27 partial / 420 missing**;
- workflow: **78 complete / 11 closed / 2 deferred / 434 actionable**;
- candidate decisions: **18 closed / 3 deferred**;
- collision registry: **2 surfaces / 5 candidate bindings**;
- actionable bands: **P0 0 / P1 26 / P2 408**.

The highest remaining P1 queue now begins with:

- BEN / BENE / BON;
- PEND / PENS;
- MICRO-;
- PROB / PROV / PROVE;
- CIRCU- / CIRCUM-;
- HYP- / HYPO-;
- SUPER- / SUPRA- / SUR-;
- HEM / HEMO / HEMAT / HEMATO / HEMA / EMIA / AEMIA;
- APO- / APH-;
- AUT / AUTO.
