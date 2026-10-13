# Morpheme Coverage Audit — 2026-09-21

## Purpose

This audit answers a product-planning question:

> Which morpheme families should be verified next?

It does **not** treat candidate data as etymological evidence. Candidate coverage
and factual authority remain separate.

## Inputs

### Published factual layers

- 66 source-language authority morphemes;
- 4 verified historical-English transmission mappings.

### Candidate discovery layers

- 68 internal legacy morphology families;
- 525 Latin/Greek root or prefix candidates from the pinned ECDICT
  `wordroot.txt` snapshot.

ECDICT and legacy morphology metadata are discovery inputs only. Their
`meaning`, `origin`, surface forms, and examples cannot publish an authority
record.

## Raw coverage snapshot

| Candidate pool | Total | Covered | Partial | Missing |
| --- | ---: | ---: | ---: | ---: |
| Legacy morphology | 68 | 25 | 8 | 35 |
| ECDICT Latin/Greek roots + prefixes | 525 | 43 | 38 | 444 |

These are **raw candidate-family coverage numbers**, not a final learner-facing
coverage percentage. ECDICT contains many low-value families, spelling variants,
and suffix-like forms grouped under root entries.

## Priority model

Priority is a verification-work score, **not confidence**.

Signals:

- ECDICT example count;
- legacy LexiFlow learning-word references;
- prefix reuse potential;
- whether a family is partially implemented and therefore close to completion.

Bands:

- P0: score >= 60;
- P1: score >= 30;
- P2: score < 30.

Current unresolved pool:

- P0: 8
- P1: 61
- P2: 413

## P0 review queue

| Candidate | Raw examples | Current state | Unresolved forms | Recommended next layer |
| --- | ---: | --- | --- | --- |
| GRAPH / -GRAPHY | 83 | partial | GRAPHY | transmission / derivational review |
| POS / -POSE / PON / -PONE / -POUND | 64 | partial | POS, POSE, PONE, POUND | Latin stem + transmission review |
| MIT / MIS / MITT / MISS / -MISE | 63 | partial | MIS, MITT, MISE | Latin stem + transmission review |
| METR / -METER / -METRY | 86 | missing | METR, METER, METRY | new Greek authority family |
| VERS / VERT | 86 | missing | VERS, VERT | new Latin authority family |
| SPECT / SPEC / SPIC / SPECTRO | 43 | partial | SPEC, SPIC, SPECTRO | Latin stem / transmission review |
| TEN / TIN / TAIN | 37 | partial | TIN | Latin stem / transmission review |
| FER / LAT / -LATE | 32 | partial | LAT, LATE | irregular Latin family review |

## Product interpretation

The P0 list shows two different kinds of work and they must not be mixed.

### New authority families

The clearest missing high-value source-language families are:

- `METR / METER / METRY` candidate family (Greek);
- `VERS / VERT` candidate family (Latin).

They need normal authority verification from LSJ/Smyth or Lewis & Short before
any publication.

### Existing-family transmission or derivation gaps

The remaining P0 rows already have at least one verified authority form. Their
unresolved forms are **not automatically aliases**. Each must be classified as
one of:

1. an attested source-language stem;
2. a historical English/Romance transmission form;
3. a later derivational suffix/combining form;
4. an unsupported pedagogical grouping that should stay unpublished.

For example, the audit deliberately reports `GRAPHY` separately from verified
Greek `GRAPH`; it does not infer that GRAPHY belongs in the Greek authority
record.

## Guardrails added

`scripts/audit-morpheme-coverage.js` now enforces that:

- every candidate remains `candidate_only`;
- candidate sources cannot appear in authority evidence;
- candidate sources cannot appear in transmission evidence;
- the ECDICT discovery snapshot is pinned to a concrete blob SHA;
- coverage gaps do not fail CI merely because they exist.

This prevents a high-coverage candidate from bypassing authority verification.

## Next verification batch

Work should proceed in this order:

1. verify `VERS / VERT` as a Latin authority family;
2. verify `METR / METER / METRY` as a Greek authority/derivational family;
3. audit the irregular `FER / LAT / LATE` family;
4. audit `POS / POSE / PONE / POUND`;
5. audit `MIT / MIS / MITT / MISS / MISE`;
6. then resolve `SPEC / SPIC / SPECTRO`, `TIN`, and `GRAPHY`.

No item moves to production solely because it is P0.
