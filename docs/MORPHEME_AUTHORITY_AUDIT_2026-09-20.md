# Morpheme Authority Audit — 2026-09-20

## Audit scope

This audit reviewed the 31 morpheme records that existed in PR #73 before the
current core-prefix expansion. The goal was to verify the product boundary and
source chain, not to judge whole-word teaching explanations.

Checks covered:

- approved authority works and source hosts;
- source locator presence;
- lemma / meaning / form evidence;
- lexicon evidence for root families;
- grammar evidence for phonological variants;
- Ancient Greek lemma → stem/root/compound-form evidence;
- separation between source-language forms and later English reflexes.

## Finding corrected

### Latin PRAE- vs English PRE-

The previous record exposed both `PRAE-` and `PRE-` from the Latin authority
layer. Lewis & Short supports Latin `prae`, but the reduced English form
`pre-` belongs to the later Latin/Romance/English transmission layer.

Correction:

- authority teaching form: `PRAE-`;
- source lemma: `prae`;
- English `PRE-` is no longer published by this source-language layer;
- any future `PRE-` mapping must be supported by a separate English historical
  etymology relation.

This prevents the authority layer from silently converting a Latin fact into an
English historical claim.

## Variant handling confirmed

Forms such as `IN- → IM-` remain valid because they are not unsourced aliases:
they are explicitly treated as phonological/compound variants and cite Allen &
Greenough. The audit therefore treats a teaching form as supported when it is
either:

1. an attested source form; or
2. an explicitly listed variant with historical-grammar evidence.

## Current registry after this batch

- 42 morpheme authority records;
- 31 authority source records;
- Latin and Ancient Greek remain separate source-language layers;
- Greek root families require a documented lemma → source stem chain;
- modern-English semantic extensions are excluded from authority facts;
- whole-word stories and semantic bridges remain outside this layer.

## CI gate

`scripts/audit-morpheme-authority.js` now runs in the normal repository check.
Critical findings fail CI. Review findings are printed for manual follow-up.

The audit is intentionally structural/offline. It validates provenance metadata,
source classes, host policy, and evidence relationships without making network
availability a release dependency.

## 2026-09-21 Latin root-family expansion

The next authority batch added FORM, GRAD/GRESS, STA/STAT, CED/CESS,
CLUD/CLUS, CURR/CURS, GEN, VIV and VITA after re-checking their Latin source
forms.

Boundary decisions made during this audit:

- `CEED` is not published from Latin `cedo / cessi / cessum`; it belongs to a
  later English historical mapping layer.
- `VIT` is not collapsed into `vivo`; `VIV` is sourced from `vivo`, while
  `VITA` is stored separately from the attested noun `vita`.
- `JECT` remains withheld. Latin `iacio/jacio` is authoritative for the verb
  'throw/cast', but the English teaching form `JECT` still needs a separately
  sourced transmission/stem chain before publication.
- `CLUS` is allowed because Lewis & Short directly records `clausum` and
  notes `cludo` as a frequent compound form of `claudo`.
- `GEN` is allowed because Lewis & Short explicitly identifies root `gen-`
  under `gigno`.

This keeps the source-language layer conservative: familiar classroom root
spellings are not accepted merely because they are pedagogically common.

