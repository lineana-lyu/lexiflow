from pathlib import Path

p=Path('server.js')
s=p.read_text(encoding='utf-8')

def once(old,new,label):
    global s
    if old not in s:
        raise SystemExit(f'missing anchor: {label}')
    s=s.replace(old,new,1)

once('''  const source = exactEntries[0];
  if (!source) return { phonetic:"", audioUrl:"", exactMatch:false };
  return { phonetic: pronunciationFromEntry(source), audioUrl: audioUrlFromEntry(source), exactMatch:true };''','''  const source = exactEntries[0];
  if (!source) return { phonetic:"", audioUrl:"", exactMatch:false };
  // Learner's Dictionary exposes IPA directly. Do not convert a different
  // Merriam-Webster pronunciation notation into an approximate IPA here.
  const pronunciations = Array.isArray(source?.hwi?.prs) ? source.hwi.prs : [];
  const ipa = pronunciations.find(pr => pr && pr.ipa)?.ipa || "";
  return { phonetic: normalizeIpa(ipa), audioUrl: audioUrlFromEntry(source), exactMatch:true };''','strict Learners IPA')

once('''  "alternatives":[{"word":"alternative","pos":"noun|verb|adjective|adverb|phrase","meaningZh":"中文","intentEn":"precise sense in English"}]''','''  "alternatives":[{"word":"alternative","pos":"noun|verb|adjective|adverb|phrase","meaningZh":"中文","intentEn":"precise sense in English","exampleEn":"natural example containing this exact alternative","exampleZh":"自然中文翻译","confidence":0.9}]''','alternative examples prompt')

once('''          intentEn: String(item.intentEn || "").trim(),
        })).filter(item => /^[a-z][a-z '-]*$/i.test(item.word))''','''          intentEn: String(item.intentEn || "").trim(),
          exampleEn: String(item.exampleEn || "").trim(),
          exampleZh: String(item.exampleZh || "").trim(),
          confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : null,
        })).filter(item => /^[a-z][a-z '-]*$/i.test(item.word))''','parse alternative examples')

old='''  const result = await merriamWebsterLookup(word, "primary", {
    intentEn,
    learningContent,
    avoidVisualEn: learningContent.avoidVisualEn,
    sourceQuery,
    normalizedQuery: resolved.normalizedChinese,
    alternatives: [resolved.primary, ...(resolved.alternatives || [])]
      .filter(item => item?.word && item.word.toLowerCase() !== word)
      .map(item => ({ word:item.word, meaningZh:item.meaningZh || resolved.normalizedChinese || sourceQuery })),
  });
  if (result?.senses?.length && !result.semanticMismatch) return result;
  return null;'''
new='''  const result = await merriamWebsterLookup(word, "primary", {
    intentEn,
    learningContent,
    avoidVisualEn: learningContent.avoidVisualEn,
    sourceQuery,
    normalizedQuery: resolved.normalizedChinese,
    alternatives: [resolved.primary, ...(resolved.alternatives || [])]
      .filter(item => item?.word && item.word.toLowerCase() !== word)
      .map(item => ({ word:item.word, meaningZh:item.meaningZh || resolved.normalizedChinese || sourceQuery })),
  });
  if (result?.semanticMismatch) return { kind:"semantic-mismatch", result };
  if (result?.senses?.length) {
    const example = String(result.senses[0]?.exampleEn || "").trim();
    // Never display a target word/phrase next to an example that does not
    // actually contain that target. This is the exact inconsistency that made
    // 笔筒 show as "behold" beside a "pen holder" sentence.
    if (!example || !example.toLowerCase().includes(word.toLowerCase())) {
      return { kind:"content-mismatch", result };
    }
    return { kind:"verified", result };
  }
  return { kind:"not-exact", result };'''
once(old,new,'candidate verification result')

old='''    for (const candidate of allCandidates) {
      if (preferredWord && candidate.word.toLowerCase() !== preferredWord) continue;
      const verified = await lookupResolvedChineseCandidate(candidate, resolved, q);
      if (verified) return verified;
      if (candidate.word.includes(" ")) return buildResolvedPhraseCard(candidate, resolved, q);
    }

    for (const candidate of allCandidates) {
      if (candidate.word.includes(" ")) return buildResolvedPhraseCard(candidate, resolved, q);
      const verified = await lookupResolvedChineseCandidate(candidate, resolved, q);
      if (verified) return verified;
    }'''
new='''    for (const candidate of allCandidates) {
      if (preferredWord && candidate.word.toLowerCase() !== preferredWord) continue;
      const checked = await lookupResolvedChineseCandidate(candidate, resolved, q);
      if (checked?.kind === "verified") return checked.result;
      // Only use the phrase fallback when Merriam-Webster has no exact phrase
      // entry. A real dictionary entry with the wrong sense must be rejected.
      if (checked?.kind === "not-exact" && candidate.word.includes(" ")) {
        return buildResolvedPhraseCard(candidate, resolved, q);
      }
    }

    for (const candidate of allCandidates) {
      const checked = await lookupResolvedChineseCandidate(candidate, resolved, q);
      if (checked?.kind === "verified") return checked.result;
      if (checked?.kind === "not-exact" && candidate.word.includes(" ")) {
        return buildResolvedPhraseCard(candidate, resolved, q);
      }
    }'''
once(old,new,'safe phrase fallback loops')

p.write_text(s,encoding='utf-8')
