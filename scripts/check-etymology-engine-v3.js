"use strict";

const assert=require("assert");
const fs=require("fs/promises");
const os=require("os");
const path=require("path");

const {
  extractEtymologyRelations,
}=require("../lib/wiktionary-structure");
const {
  extractMerriamWebsterEvidence,
  decodeRevisionSource,
  decodeParseSource,
  fetchWiktionaryPageSource,
  fetchWiktionaryEvidence,
}=require("../lib/etymology-evidence");
const {
  buildEvidenceGraph,
  selectPrimaryComposition,
}=require("../lib/etymology-graph");
const {PersistentEtymologyCache}=require("../lib/etymology-cache");
const {
  createEtymologyService,
  validateAiExplanation,
}=require("../lib/etymology-service");

function page(sections){
  return sections.join("\n");
}

function queryFixtureResponse(wikitext,{missing=false}={}){
  return {
    ok:true,
    async json(){
      return {
        query:{
          pages:[
            missing
              ? {title:"missing",missing:true}
              : {title:"fixture",revisions:[{slots:{main:{content:wikitext}}}]},
          ],
        },
      };
    },
  };
}

function parseFixtureResponse(wikitext,{legacyShape=false}={}){
  return {
    ok:true,
    async json(){
      return {
        parse:{
          wikitext:legacyShape ? {"*":wikitext} : wikitext,
        },
      };
    },
  };
}

function requiredComponentsFromPrompt(prompt){
  const marker="Required Components:\n";
  const start=prompt.indexOf(marker);
  const end=prompt.indexOf("\nEvidence Graph:",start);
  assert(start>=0 && end>start,"prompt must expose Required Components before Evidence Graph");
  return JSON.parse(prompt.slice(start+marker.length,end));
}

function meaningFor(form){
  const table={
    "mis-":"错误地、不当地",
    "understand":"理解",
    "en-":"使进入某种状态",
    "amor":"爱、爱意",
    "-er":"构成动词的后缀",
    "fascinum":"魔法、魅惑、护身符",
    "-ō":"构成动词的后缀",
    "ad-":"向、朝、靠近",
    "iaceō":"躺、位于",
  };
  return table[form] || "与该词历史构成相关";
}

async function main(){
  const tempDir=await fs.mkdtemp(path.join(os.tmpdir(),"lexiflow-etymology-v3-"));
  const cachePath=path.join(tempDir,"cache.json");

  const pages={
    "misunderstand":page([
      "==English==",
      "===Etymology===",
      "From {{inh|en|enm|mys-understanden}}, equivalent to {{prefix|en|mis-|understand}}.",
      "===Verb===",
      "# To understand incorrectly.",
    ]),
    "mis-":page([
      "==English==",
      "===Etymology===",
      "From {{inh|en|ang|mis-}}.",
      "===Prefix===",
      "# Wrongly, badly, or incorrectly.",
      "==Old English==",
      "===Prefix===",
      "# Wrongly or badly.",
    ]),
    "understand":page([
      "==English==",
      "===Etymology===",
      "From {{inh|en|ang|understandan}}.",
      "===Verb===",
      "# To grasp the meaning of something.",
    ]),
    "mys-understanden":page([
      "==Middle English==",
      "===Etymology===",
      "From earlier Germanic material.",
      "===Verb===",
      "# To misunderstand.",
    ]),
    "enamored":page([
      "==English==",
      "===Etymology===",
      "Inherited from {{inh|en|enm|enamoured}}, a {{pcal|en|fro|enamore}}, past participle of {{m|fro|enamorer}}, {{m|fro|enamourer}}; compare {{m|en|amour}} and {{m|en|enamor}}, {{m|en|enamour}}.",
      "===Adjective===",
      "# In love, amorous.",
    ]),
    "enamor":page([
      "==English==",
      "===Etymology===",
      "From Middle English enamouren, ultimately from Old French {{m|fro|enamorer}}, equivalent to {{af|fro|en-|amor|-er}}.",
      "===Verb===",
      "# To cause to be in love.",
    ]),
    "en-":page([
      "==Old French==",
      "===Prefix===",
      "# In, into, or causing to be in a state.",
    ]),
    "amor":page([
      "==Old French==",
      "===Etymology===",
      "From Latin amor.",
      "===Noun===",
      "# Love or affection.",
    ]),
    "-er":page([
      "==Old French==",
      "===Suffix===",
      "# A verb-forming suffix.",
    ]),
    "fascinate":page([
      "==English==",
      "===Etymology===",
      "Borrowed from {{bor|en|la|fascinatus}}, perfect passive participle of {{m|la|fascino}}, from {{m|la|fascinum|t=charm, spell, witchcraft}} + {{m|la|-ō|t=verb-forming suffix}}.",
      "===Verb===",
      "# To evoke intense interest or attraction.",
    ]),
    "fascinum":page([
      "==Latin==",
      "===Etymology===",
      "Of uncertain deeper origin.",
      "===Noun===",
      "# A charm, spell, or witchcraft.",
    ]),
    "-ō":page([
      "==Latin==",
      "===Suffix===",
      "# A verb-forming suffix used to form first-conjugation verbs.",
    ]),
    "adjacent":page([
      "==English==",
      "===Etymology===",
      "Borrowed from {{bor|en|la|adiacens}}, from {{prefix|la|ad-|iaceo}}.",
      "===Adjective===",
      "# Next to or adjoining something else.",
    ]),
  };

  let fetchCalls=0;
  const fakeFetch=async url=>{
    fetchCalls+=1;
    const parsed=new URL(url);
    const action=parsed.searchParams.get("action");
    const word=parsed.searchParams.get("titles") || parsed.searchParams.get("page");
    const source=pages[word] || "";
    return action==="query"
      ? queryFixtureResponse(source,{missing:!source})
      : parseFixtureResponse(source);
  };

  const wiktionaryProvider=(word,options={})=>fetchWiktionaryEvidence(word,{
    ...options,
    fetchImpl:fakeFetch,
    timeoutMs:1000,
  });

  try{
    const decodedQuery=decodeRevisionSource({
      query:{pages:[{revisions:[{slots:{main:{content:pages.adjacent}}}]}]},
    });
    assert.strictEqual(decodedQuery.state,"source","query/revisions response must decode to source text");

    const decodedLegacyParse=decodeParseSource({
      parse:{wikitext:{"*":pages.adjacent}},
    });
    assert.strictEqual(decodedLegacyParse.state,"source","legacy parse.wikitext[*] responses must remain compatible");

    let fallbackCalls=0;
    const fallbackFetch=async url=>{
      fallbackCalls+=1;
      const parsed=new URL(url);
      return parsed.searchParams.get("action")==="query"
        ? {ok:true,async json(){return {query:{unexpected:true}};}}
        : parseFixtureResponse(pages.adjacent,{legacyShape:true});
    };
    const fallbackSource=await fetchWiktionaryPageSource("adjacent",{
      fetchImpl:fallbackFetch,
      timeoutMs:1000,
    });
    assert.strictEqual(fallbackSource.strategy,"parse-wikitext","invalid primary response must fall back to parse transport");
    assert.strictEqual(fallbackCalls,2,"transport fallback must stop after the first valid source");

    const missingSource=await fetchWiktionaryEvidence("missingword",{
      fetchImpl:fakeFetch,
      timeoutMs:1000,
    });
    assert.strictEqual(missingSource,null,"a confirmed missing page is not a provider outage");

    const fascinateRelations=extractEtymologyRelations([
      "from {{m|la|fascinum|t=charm, spell, witchcraft}} + {{m|la|-ō|t=verb-forming suffix}}"
    ]);
    const fascinateComposition=fascinateRelations.find(item=>item.type==="composed_of");
    assert(fascinateComposition,"mention-plus morphology must create a composition");
    assert.deepStrictEqual(
      fascinateComposition.components.map(item=>item.form),
      ["fascinum","-ō"],
      "Unicode historical suffixes must survive structured parsing"
    );

    const mwPayload=[
      {
        meta:{id:"project:1",stems:["project"]},
        hwi:{hw:"project"},
        et:[["text","Latin {it}proicere{/it}, from {it}pro-{/it} forward + {it}jacere{/it} to throw"]],
      },
      {
        meta:{id:"projector:1",stems:["projector"]},
        hwi:{hw:"projector"},
        et:[["text","unrelated nearby headword evidence"]],
      },
    ];
    const mw=extractMerriamWebsterEvidence(mwPayload,"project");
    assert(mw && mw.facts.length===1,"MW exact headword isolation must remain intact");
    assert(mw.facts[0].text.includes("proicere"),"MW etymology markup must normalize");

    const misSource=await wiktionaryProvider("misunderstand",{languageCode:"en",sourceId:"wiktionary"});
    const misGraph=await buildEvidenceGraph({
      word:"misunderstand",
      sources:[misSource],
      wiktionaryProvider,
      maxDepth:3,
      maxNodes:18,
      maxProviderCalls:10,
    });
    const misSelected=selectPrimaryComposition(misGraph);
    assert.deepStrictEqual(
      misSelected.componentNodeIds.map(id=>misGraph.nodes.find(node=>node.id===id)?.display),
      ["mis-","understand"],
      "direct structured morphology must deterministically own displayed components"
    );

    const enamoredSource=await wiktionaryProvider("enamored",{languageCode:"en",sourceId:"wiktionary"});
    const enamoredGraph=await buildEvidenceGraph({
      word:"enamored",
      sources:[enamoredSource],
      wiktionaryProvider,
      maxDepth:3,
      maxNodes:18,
      maxProviderCalls:10,
    });
    const enamoredSelected=selectPrimaryComposition(enamoredGraph);
    assert(enamoredSelected,"related etymon traversal must find a usable composition");
    assert.strictEqual(enamoredSelected.confidence,"medium","related-etymon morphology must be distinguished from direct morphology");
    assert.deepStrictEqual(
      enamoredSelected.componentNodeIds.map(id=>enamoredGraph.nodes.find(node=>node.id===id)?.display),
      ["en-","amor","-er"],
      "enamored must be able to reach the documented enamor decomposition without word-specific code"
    );

    const fascinateSource=await wiktionaryProvider("fascinate",{languageCode:"en",sourceId:"wiktionary"});
    const fascinateGraph=await buildEvidenceGraph({
      word:"fascinate",
      sources:[fascinateSource],
      wiktionaryProvider,
      maxDepth:3,
      maxNodes:18,
      maxProviderCalls:10,
    });
    const fascinateSelected=selectPrimaryComposition(fascinateGraph);
    assert.deepStrictEqual(
      fascinateSelected.componentNodeIds.map(id=>fascinateGraph.nodes.find(node=>node.id===id)?.display),
      ["fascinum","-ō"],
      "explicit fascinum + -ō evidence must force both components into the display contract"
    );
    assert(
      fascinateGraph.sources.some(source=>source.id==="wiktionary:la:-ō"),
      "Unicode suffixes must be queryable in their historical language"
    );

    assert(misGraph.limits.providerCalls<=10);
    assert(enamoredGraph.limits.providerCalls<=10);
    assert(fascinateGraph.limits.providerCalls<=10);

    let aiCalls=0;
    const cache=new PersistentEtymologyCache({filePath:cachePath,ttlMs:60000,maxEntries:30});
    const service=createEtymologyService({
      cache,
      merriamWebsterProvider:async()=>null,
      wiktionaryProvider,
      aiRunner:async prompt=>{
        aiCalls+=1;
        assert(prompt.includes("Required Components:"),"AI must receive deterministic required components");
        assert(prompt.includes("不得自行省略后缀、词根或构词成分"),"prompt must forbid AI-side component omission");
        const required=requiredComponentsFromPrompt(prompt);

        let sourcePath="English";
        let learnerExplanationZh="这个词的历史构成和今天的意思可以从这些已确定的成分联系起来理解。";
        if(prompt.includes("表面单词：misunderstand")){
          sourcePath="Middle English → English";
          learnerExplanationZh="mis- 有“错误地、不当地”的意思，和 understand 组合后就是“理解错了”，因此形成今天“误解、误会”的含义。";
        }else if(prompt.includes("表面单词：enamored")){
          sourcePath="Old French → Middle English → English";
          learnerExplanationZh="这个词沿着 Old French 表示“使陷入爱恋状态”的构词进入英语，其中 amor 表示“爱”。因此 enamored 从“处在爱恋之中”自然发展为“倾心于、迷恋的”。";
        }else if(prompt.includes("表面单词：fascinate")){
          sourcePath="Latin → English";
          learnerExplanationZh="Latin fascinum 原本和“魔法、魅惑”有关，配合构成动词的 -ō 形成相关动词。于是“像被施了魔法一样吸引住”逐渐发展成今天“令人入神、使着迷”的意思。";
        }

        return JSON.stringify({
          origin:{confidence:"high",sourcePath},
          morphology:{
            components:required.map(item=>({
              nodeId:item.nodeId,
              meaningZh:meaningFor(item.form),
            })),
          },
          learnerExplanationZh,
        });
      },
    });

    const first=await service.explain("misunderstand",{meaningZh:"误解"});
    assert.strictEqual(first.status,"verified_explanation");
    assert.strictEqual(first.morphology.components.length,2);
    assert(!/证据表明|证据不足|无法可靠/.test(first.learnerExplanationZh));

    const cached=await service.explain("misunderstand",{meaningZh:"误解"});
    assert.strictEqual(cached.cacheHit,true,"second lookup must hit persistent cache");
    assert.strictEqual(aiCalls,1,"cache hit must avoid repeated AI work");

    const enamored=await service.explain("enamored",{meaningZh:"迷恋的"});
    assert.deepStrictEqual(
      enamored.morphology.components.map(item=>item.form),
      ["en-","amor","-er"],
      "service must expose every deterministically selected enamor component"
    );

    const fascinate=await service.explain("fascinate",{meaningZh:"使着迷"});
    assert.deepStrictEqual(
      fascinate.morphology.components.map(item=>item.form),
      ["fascinum","-ō"],
      "AI must not be able to omit the documented verb-forming suffix"
    );

    const directComposition={
      confidence:"high",
      componentNodeIds:["component:la:fascinum","component:la:-~C5~8D"],
    };
    const validationGraph={
      rootId:"word:en:fascinate",
      nodes:[
        {id:"word:en:fascinate",kind:"word",display:"fascinate",evidenceSourceIds:["wiktionary"],authority:[]},
        {id:"component:la:fascinum",kind:"component",display:"fascinum",role:"root",evidenceSourceIds:["wiktionary"],authority:[],glosses:["charm"]},
        {id:"component:la:-~C5~8D",kind:"component",display:"-ō",role:"suffix",evidenceSourceIds:["wiktionary"],authority:[],glosses:["verb-forming suffix"]},
      ],
      edges:[],
      sources:[],
    };
    assert.throws(
      ()=>validateAiExplanation({
        origin:{confidence:"high",sourcePath:"Latin → English"},
        morphology:{
          components:[
            {nodeId:"component:la:fascinum",meaningZh:"魔法、魅惑"},
          ],
        },
        learnerExplanationZh:"这个词从“魅惑”发展出今天“使着迷”的意思。",
      },validationGraph,directComposition),
      err=>err?.code==="ETYMOLOGY_AI_COMPONENT_SET_CHANGED",
      "AI omission of a required suffix must be rejected"
    );

    assert.throws(
      ()=>validateAiExplanation({
        origin:{confidence:"high",sourcePath:"Latin → English"},
        morphology:{components:[
          {nodeId:"component:la:fascinum",meaningZh:"魔法、魅惑"},
          {nodeId:"component:la:-~C5~8D",meaningZh:"构成动词"},
        ]},
        learnerExplanationZh:"证据表明这个词来自拉丁语。",
      },validationGraph,directComposition),
      err=>err?.code==="ETYMOLOGY_AI_AUDIT_COPY",
      "audit-style copy must be rejected before learner UI"
    );

    let providerFailureAiCalls=0;
    const unavailableService=createEtymologyService({
      cache:new PersistentEtymologyCache({filePath:path.join(tempDir,"provider-down.json")}),
      merriamWebsterProvider:async()=>null,
      wiktionaryProvider:async()=>{
        const err=new Error("provider down");
        err.code="ETYMOLOGY_WIKTIONARY_UNAVAILABLE";
        throw err;
      },
      aiRunner:async()=>{providerFailureAiCalls+=1;return "{}";},
    });
    const unavailable=await unavailableService.explain("adjacent");
    assert.strictEqual(unavailable.status,"provider_unavailable","provider outages must not masquerade as missing etymology");
    assert.strictEqual(providerFailureAiCalls,0,"AI must not run when all etymology evidence providers are unavailable/empty");
    assert(
      unavailable.providerStates.some(item=>item.provider==="wiktionary" && item.status==="failed"),
      "provider outage diagnostics must remain auditable"
    );

    let noEvidenceAiCalls=0;
    const emptyService=createEtymologyService({
      cache:new PersistentEtymologyCache({filePath:path.join(tempDir,"empty.json")}),
      merriamWebsterProvider:async()=>null,
      wiktionaryProvider:async()=>null,
      aiRunner:async()=>{noEvidenceAiCalls+=1;return "{}";},
    });
    const empty=await emptyService.explain("opaque");
    assert.strictEqual(empty.status,"insufficient_evidence");
    assert.strictEqual(noEvidenceAiCalls,0,"AI must not be called without word-level evidence");

    await assert.rejects(
      ()=>service.explain("two words"),
      err=>err?.code==="ETYMOLOGY_INVALID_WORD",
      "phrases remain outside the word-etymology contract"
    );

    const cacheOnDisk=JSON.parse(await fs.readFile(cachePath,"utf8"));
    assert.strictEqual(cacheOnDisk.schema,"lexiflow-etymology-cache-v1");
    assert(Object.keys(cacheOnDisk.entries).length>=3,"verified V3 explanations must persist in the temp cache");

    console.log("Etymology Engine V3 checks passed.");
    console.log("Fixture provider calls:",fetchCalls);
  }finally{
    await fs.rm(tempDir,{recursive:true,force:true});
  }
}

main().catch(err=>{
  console.error(err);
  process.exitCode=1;
});
