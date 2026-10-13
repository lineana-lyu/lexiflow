# Morpheme Transmission Policy

This layer maps verified source-language morphemes to later English teaching
forms when the English form is not itself an attested Latin or Greek source
form.

## Boundary

Examples that belong here:

- Latin `prae-` → English `pre-`
- Latin `facio / factum` family → English teaching form `FECT`
- Latin `tenere` family → English teaching form `TAIN`
- Latin `cedere` family → English teaching form `CEED`

Examples that do **not** belong here:

- `JECT`, because Lewis & Short directly attests compound forms with
  `jeci, jectum` from `jacio`; it is therefore source-language authority data.
- whole-word semantic explanations;
- learner stories;
- runtime spelling guesses.

## Publication rule

A transmission mapping may be published only when:

1. the target form links to an existing verified authority morpheme;
2. the target form is not already present in that authority morpheme's
   source-language teaching forms;
3. at least two independent English etymology references support the
   historical relationship;
4. the historical pathway is explicit;
5. at least one real English evidence word demonstrates the mapping;
6. the mapping passes `scripts/check-morpheme-transmission.js`.

The current cross-check pair is:

- Online Etymology Dictionary — reference-only factual verification;
- Wiktionary — structured etymology metadata under CC BY-SA / GFDL.

LexiFlow stores its own normalized factual pathway. It does not copy source
prose.

## Product responsibility

The authority layer answers:

> What is the source-language morpheme?

The transmission layer answers:

> Why does the learner see a different form in English?

The word-explanation layer may consume both, but it cannot invent or overwrite
either.
