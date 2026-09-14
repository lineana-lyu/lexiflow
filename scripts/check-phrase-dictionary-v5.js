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
console.log("Phrase dictionary V5 checks passed");
