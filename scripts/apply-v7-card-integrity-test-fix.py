from pathlib import Path
p=Path(__file__).resolve().parents[1]/"scripts/check-expression-query-v4.js"
s=p.read_text(encoding="utf-8")
old='assert(!runtime.includes(\'result = coreLexicon.lookupExact(query.toLowerCase(), "primary"\')&&runtime.includes(\'result = localPhraseResult(query.toLowerCase(), "primary")\'), "multiword search must use the curated local phrase dictionary rather than raw Core/ECDICT phrase semantics");'
new='assert(!runtime.includes(\'result = coreLexicon.lookupExact(query.toLowerCase(), "primary"\')&&runtime.includes(\'ensureWholePhrasePhonetic(localPhraseResult(query.toLowerCase(), "primary")\'), "multiword search must use the curated local phrase dictionary and complete whole-phrase IPA before returning");'
if old not in s: raise SystemExit("missing smart phrase assertion")
s=s.replace(old,new,1)
old='assert(runtime.includes(\'const localPhrase = localPhraseResult(word, mode)\')&&runtime.includes(\'expressionQuery.resolveEnglishExpression(word)\'), "direct phrase lookup must use local phrase dictionary first and AI whole-expression resolution only as fallback");'
new='assert(runtime.includes(\'const localPhrase = await ensureWholePhrasePhonetic(localPhraseResult(word, mode), word)\')&&runtime.includes(\'expressionQuery.resolveEnglishExpression(word)\'), "direct phrase lookup must use local phrase dictionary with complete IPA first and AI whole-expression resolution only as fallback");'
if old not in s: raise SystemExit("missing direct phrase assertion")
s=s.replace(old,new,1)
p.write_text(s,encoding="utf-8")
print("Expression regression contract aligned.")
