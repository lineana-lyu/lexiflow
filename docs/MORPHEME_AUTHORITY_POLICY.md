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
