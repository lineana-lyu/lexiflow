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
  fetchWiktionaryEvidence,
}=require("../lib/etymology-evidence");
const {
  buildEvidenceGraph,
}=require("../lib/etymology-graph");
const {PersistentEtymologyCache}=require("../lib/etymology-cache");
const {
  createEtymologyService,
  validateAiExplanation,
}=require("../lib/etymology-service");

function page(sections){
  return sections.join("\n");
}

function fixtureResponse(wikitext){
  return {
    ok:true,
    async json(){ return {parse:{wikitext}}; },
  };
}

async function main(){
  const tempDir=await fs.mkdtemp(path.join(os.tmpdir(),"lexiflow-etymology-v2-"));
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
      "Inherited from Middle English enamoured, ultimately related to Old French.",
      "===Verb===",
      "# {{past participle of|en|enamor}}",
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
      "Borrowed from {{bor|en|la|fascinatus}}, from {{m|la|fascinum}} + {{m|la|-o}}.",
      "===Verb===",
      "# To evoke intense interest or attraction.",
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
    const word=parsed.searchParams.get("page");
    return fixtureResponse(pages[word] || "");
  };

  const wiktionaryProvider=(word,options={})=>fetchWiktionaryEvidence(word,{
    ...options,
    fetchImpl:fakeFetch,
    timeoutMs:1000,
  });

  try{
    const misRelations=extractEtymologyRelations([
      "From {{inh|en|enm|mys-understanden}}, equivalent to {{prefix|en|mis-|understand}}."
    ]);
    const misComposition=misRelations.find(item=>item.type==="composed_of");
    assert(misComposition,"prefix template must become a composition relation");
    assert.deepStrictEqual(
      misComposition.components.map(item=>item.form),
      ["mis-","understand"],
      "misunderstand must resolve into explicit source components"
    );

    const fascinateRelations=extractEtymologyRelations([
      "from {{m|la|fascinum}} + {{m|la|-o}}"
    ]);
    assert(
      fascinateRelations.some(item=>item.type==="composed_of" && item.components.map(x=>x.form).join("+")==="fascinum+-o"),
      "generic mention-plus morphology must be captured"
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
    assert(misSource?.relations?.some(item=>item.type==="composed_of"),"Wiktionary evidence must expose structured relations");

    const graph=await buildEvidenceGraph({
      word:"misunderstand",
      sources:[misSource],
      wiktionaryProvider,
      maxDepth:2,
      maxNodes:18,
      maxProviderCalls:10,
    });

    const misNode=graph.nodes.find(node=>node.kind==="component" && node.display==="mis-");
    const understandNode=graph.nodes.find(node=>node.kind==="component" && node.display==="understand");
    assert(misNode && understandNode,"graph must contain both explicit components");
    assert(
      misNode.authority.some(item=>item.authorityId==="ang-mis"),
      "verified Old English MIS authority must enrich the component"
    );
    assert(
      graph.sources.some(source=>source.provider==="authority" && /Bosworth-Toller/i.test(source.title)),
      "authority citations must be carried into the graph"
    );
    assert(
      graph.sources.some(source=>source.id==="wiktionary:en:understand"),
      "component lookup must enrich understand instead of stopping at the surface split"
    );
    assert(graph.limits.providerCalls<=10,"graph traversal must stay bounded");

    const enamorSource=await wiktionaryProvider("enamor",{languageCode:"en",sourceId:"wiktionary"});
    const enamorGraph=await buildEvidenceGraph({
      word:"enamor",
      sources:[enamorSource],
      wiktionaryProvider,
      maxDepth:2,
      maxNodes:18,
      maxProviderCalls:10,
    });
    assert(
      ["en-","amor","-er"].every(form=>enamorGraph.nodes.some(node=>node.kind==="component" && node.display===form)),
      "Old French enamor decomposition must be discoverable through the evidence graph"
    );
    assert(
      enamorGraph.sources.some(source=>source.id==="wiktionary:fro:amor"),
      "component enrichment must query the component in its historical language"
    );

    const fascinateSource=await wiktionaryProvider("fascinate",{languageCode:"en",sourceId:"wiktionary"});
    const fascinateGraph=await buildEvidenceGraph({
      word:"fascinate",
      sources:[fascinateSource],
      wiktionaryProvider,
    });
    assert(
      fascinateGraph.nodes.some(node=>node.kind==="component" && node.display==="fascinum"),
      "fascinate must retain useful Latin component structure when explicitly stated"
    );

    let aiCalls=0;
    const cache=new PersistentEtymologyCache({filePath:cachePath,ttlMs:60000,maxEntries:30});
    const service=createEtymologyService({
      cache,
      merriamWebsterProvider:async()=>null,
      wiktionaryProvider,
      aiRunner:async prompt=>{
        aiCalls+=1;
        assert(prompt.includes("Evidence Graph:"),"AI must receive the structured graph instead of a single prose blob");
        assert(prompt.includes("不要新增图中不存在的构词成分"),"prompt must forbid invented components");

        if(prompt.includes("表面单词：enamored")){
          return JSON.stringify({
            origin:{confidence:"high",sourcePath:"Old French → Middle English → English"},
            morphology:{
              confidence:"high",
              components:[
                {nodeId:"component:fro:en-",meaningZh:"使进入某种状态"},
                {nodeId:"component:fro:amor",meaningZh:"爱、爱意"},
              ],
            },
            learnerExplanationZh:"enamor 进入英语前与 Old French 中表示“爱”的 amor 有关，en- 带有“使进入某种状态”的作用。于是 enamored 可以理解为“进入爱恋、着迷的状态”，后来也自然用于表示“倾心于、迷恋的”。",
          });
        }

        return JSON.stringify({
          origin:{confidence:"high",sourcePath:"Middle English mys-understanden → English misunderstand"},
          morphology:{
            confidence:"high",
            components:[
              {nodeId:"component:en:mis-",meaningZh:"错误地、不当地"},
              {nodeId:"component:en:understand",meaningZh:"理解"},
            ],
          },
          learnerExplanationZh:"mis- 带有“错误地、不当地”的意思，加在 understand 前面，就是“理解错了”。因此 misunderstand 很自然地发展成今天的“误解、误会”。",
        });
      },
    });

    const first=await service.explain("misunderstand",{meaningZh:"误解"});
    assert.strictEqual(first.status,"verified_explanation");
    assert.strictEqual(first.origin.confidence,"high");
    assert.strictEqual(first.morphology.components.length,2);
    assert.strictEqual(first.morphology.components[0].sourceLanguage,"Old English");
    assert(!/证据表明|证据不足|无法可靠/.test(first.learnerExplanationZh),"learner copy must not expose audit language");
    assert(first.sources.every(source=>!("facts" in source)),"public result must not expose raw provider prose");

    const cached=await service.explain("misunderstand",{meaningZh:"误解"});
    assert.strictEqual(cached.cacheHit,true,"second lookup must hit persistent cache");
    assert.strictEqual(aiCalls,1,"cache hit must avoid repeated AI work");

    const enamored=await service.explain("enamored",{meaningZh:"迷恋的"});
    assert.strictEqual(enamored.lookupWord,"enamored","surface lookup remains stable when no app lemma is supplied");
    assert(enamored.morphology.components.some(item=>item.form==="amor"),"form-of traversal must reach the lexical lemma and expose its historical root component");
    assert(!enamored.learnerExplanationZh.startsWith("证据"),"learner explanation must start from the word, not from audit language");

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

    const badGraph={
      rootId:"word:en:test",
      nodes:[
        {id:"word:en:test",kind:"word",display:"test",evidenceSourceIds:["wiktionary"],authority:[]},
      ],
      edges:[],
      sources:[],
    };
    assert.throws(
      ()=>validateAiExplanation({
        origin:{confidence:"high",sourcePath:"Latin → English"},
        morphology:{confidence:"high",components:[{nodeId:"component:la:fake",meaningZh:"伪造"}]},
        learnerExplanationZh:"自然解释。",
      },badGraph),
      err=>err?.code==="ETYMOLOGY_AI_UNGROUNDED",
      "AI must not invent a component outside the graph"
    );

    assert.throws(
      ()=>validateAiExplanation({
        origin:{confidence:"high",sourcePath:"Latin → English"},
        morphology:{confidence:"insufficient",components:[]},
        learnerExplanationZh:"证据表明这个词来自拉丁语，因此不拆。",
      },badGraph),
      err=>err?.code==="ETYMOLOGY_AI_AUDIT_COPY",
      "audit-style copy must be rejected before reaching the learner UI"
    );

    await assert.rejects(
      ()=>service.explain("two words"),
      err=>err?.code==="ETYMOLOGY_INVALID_WORD",
      "phrases remain outside the word-etymology contract"
    );

    const cacheOnDisk=JSON.parse(await fs.readFile(cachePath,"utf8"));
    assert.strictEqual(cacheOnDisk.schema,"lexiflow-etymology-cache-v1");
    assert(Object.keys(cacheOnDisk.entries).length>=2,"verified sense-aware explanations must persist in the temp cache");

    console.log("Etymology Engine V2 checks passed.");
    console.log("Fixture provider calls:",fetchCalls);
  }finally{
    await fs.rm(tempDir,{recursive:true,force:true});
  }
}

main().catch(err=>{
  console.error(err);
  process.exitCode=1;
});
