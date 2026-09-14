"use strict";

const assert = require("assert");
const { compactEntry } = require("./prepare-phrase-dictionary");
const { rowToResult } = require("../lib/phrase-dictionary");

const compact = compactEntry({
  headword:"hang out",
  normalized_headword:"hang out",
  pos_groups:[{
    pos:"verb",
    pronunciations:[
      { ipa:"hæŋ aʊt", tags:["US"] },
      { ipa:"hæŋ aʊt", tags:["UK"] },
    ],
    meanings:[
      {
        sense_id:"s-literal",
        priority:"rare",
        short_gloss:"挂出",
        learner_explanation:"把某物悬挂在外面。",
        examples:[{text:"Hang out the flag.",translation:"把旗子挂出去。"}],
      },
      {
        sense_id:"s-common",
        priority:"core",
        short_gloss:"闲逛；一起待着",
        learner_explanation:"和朋友轻松地待在一起或消磨时间。",
        examples:[{text:"We often hang out after class.",translation:"我们下课后经常一起待着。"}],
      },
    ],
  }],
});

assert(compact, "multiword Open Dictionary entry should compact");
assert.strictEqual(compact.phoneticUs, "hæŋ aʊt", "US whole-expression IPA should be retained");
assert(/闲逛|一起待着/.test(compact.senses[0].meaningZh), "core learner sense must outrank a rare literal sense");
assert(!/挂出/.test(compact.senses[0].meaningZh), "literal component-like meaning must not become the primary learning sense when a core idiomatic sense exists");

const result = rowToResult({
  normalized_headword:compact.normalizedHeadword,
  headword:compact.headword,
  phonetic_us:compact.phoneticUs,
  phonetic_any:compact.phoneticAny,
  senses_json:JSON.stringify(compact.senses),
});
assert(result?.phraseCard && result?.dictionaryExact, "phrase result should be an exact local phrase card");
assert.strictEqual(result.phonetic, "/hæŋ aʊt/", "whole phrase IPA must be displayed as a single phrase transcription");
assert(/闲逛|一起待着/.test(result.senses[0].meaningZh), "phrase lookup must expose learner-oriented idiomatic meaning");
assert.strictEqual(result.audioUrl, "", "Open Dictionary supplies IPA/meaning, not fake component audio");


const partial = compactEntry({
  headword:"look forward to",
  normalized_headword:"look forward to",
  pos_groups:[{
    pos:"verb",
    pronunciations:[{ ipa:"ˈfɔrwərd", tags:["US"] }],
    meanings:[{
      sense_id:"s-look-forward",
      priority:"core",
      short_gloss:"期待；盼望",
      learner_explanation:"期待未来发生的事情。",
      examples:[{text:"I'm really looking forward to seeing you next weekend.",translation:"我真的很期待下周末见到你。"}],
    }],
  }],
});
assert(partial, "look forward to should remain a valid phrase entry");
assert.strictEqual(partial.phoneticUs, "", "single-component IPA must not be stored as a whole three-word phrase transcription");
const partialLegacyRow = rowToResult({
  normalized_headword:"look forward to",
  headword:"look forward to",
  phonetic_us:"ˈfɔrwərd",
  phonetic_any:"ˈfɔrwərd",
  senses_json:JSON.stringify(partial.senses),
});
assert.strictEqual(partialLegacyRow.phonetic, "", "runtime must also reject component IPA from an already-built legacy phrase database");

const complete = compactEntry({
  headword:"look forward to",
  normalized_headword:"look forward to",
  pos_groups:[{
    pos:"verb",
    pronunciations:[{ ipa:"lʊk ˈfɔrwərd tə", tags:["US"] }],
    meanings:[{
      sense_id:"s-look-forward-complete",
      priority:"core",
      short_gloss:"期待；盼望",
      learner_explanation:"期待未来发生的事情。",
      examples:[{text:"I look forward to hearing from you.",translation:"我期待收到你的回复。"}],
    }],
  }],
});
assert.strictEqual(complete.phoneticUs, "lʊk ˈfɔrwərd tə", "a verified full three-word IPA should be retained");

console.log("Phrase dictionary V5 checks passed");
