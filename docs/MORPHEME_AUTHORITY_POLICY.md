# Morpheme Authority Policy

LexiFlow treats roots and prefixes as a factual reference layer, separate from
whole-word teaching content.

## Authority boundary

This layer owns only:

- source language;
- attested source-language lemma or form;
- core source meaning;
- historically supported teaching form(s);
- phonological or morphological variants when an authoritative grammar supports them;
- source metadata and precise locators.

This layer does **not** own:

- a whole-word story;
- a whole-word semantic bridge;
- cultural anecdotes;
- AI-generated etymology;
- runtime string matching that guesses a root from spelling.

## Source hierarchy

For Latin morphemes, prefer Lewis & Short for lexical facts and Allen &
Greenough for historical morphology / phonology. For Greek morphemes, use LSJ
for lexical facts and a standard historical Greek grammar such as Smyth for
morphological rules.

Modern-English word etymology is a separate layer. A modern English word must
not be declared a member of a morpheme family solely because its spelling looks
similar.

## Publication rule

A morpheme may be published only when:

1. its source-language lemma/form is attested;
2. its core meaning is attested;
3. any claimed teaching-form transformation is sourced;
4. any assimilation/variant claim has grammar evidence;
5. the record passes `scripts/check-morpheme-authority.js`.

Unsupported items remain absent rather than being inferred.

## Greek teaching-form rule

For Ancient Greek roots, the English teaching form (for example `GRAPH`,
`LOG/LOGO`, `BIO`, `GEO`, `PHON`) is not accepted merely because it
resembles a Greek lemma in Latin letters.

The registry must keep three layers distinct:

1. the attested Greek lemma, such as `γράφω` or `λόγος`;
2. the attested root/stem/compound form, such as `γραφ-` or `λογο-`;
3. the Latin-letter teaching form used by LexiFlow.

The transition from (1) to (2) must be supported by LSJ, Smyth, or an attested
Greek compound. The teaching form is then a transliteration label for that
verified Greek form. If this chain cannot be sourced, the teaching root is not
published.

This is why a candidate such as `TELE` is intentionally withheld until its
Ancient Greek source form and compound behavior are documented to the same
standard.

## Homograph and collision rule

A surface teaching form is not a globally unique morpheme identifier.

When the same normalized form is independently supported by different
source-language families, LexiFlow must preserve both authorities and resolve
coverage through explicit candidate-to-family bindings in
`data/morpheme-collisions.json`.

The resolution order is:

1. candidate-specific workflow decisions;
2. candidate-specific collision bindings;
3. raw surface-form matching only when no collision binding exists.

A collision binding may restrict a candidate form to one or more verified
authority/transmission records, but it cannot create linguistic facts or alter
authority data.

For example, `CID` is intentionally present in both:

- `CID/CIS < caedo` — cut / strike / kill;
- `CAD/CAS/CID < cado` — fall / happen.

Therefore publication coverage for `cid1` and `cid2` must be family-aware.
The existence of either `CID` authority alone must never satisfy the other
candidate merely because the letters are identical.

This rule generalizes the earlier CAP2 safeguard and prevents indexed
homographs from becoming false coverage.

