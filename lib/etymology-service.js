"use strict";

const {
  normalizeWord,
  fetchWiktionaryEvidence,
  evidenceFingerprint,
} = require("./etymology-evidence");
const { headingForLanguage } = require("./wiktionary-structure");
const { PersistentEtymologyCache } = require("./etymology-cache");
const { buildEvidenceGraph, selectPrimaryComposition, graphNodeMap } = require("./etymology-graph");

const EXPLANATION_SCHEMA = "lexiflow-etymology-explanation-v3";
const CONFIDENCE = new Set(["high","medium","insufficient"]);

function clean(value){ return String(value ?? "").trim(); }

function extractJson(text){
  const raw=clean(text);
  if(!raw)return null;
  const fenced=raw.match(/\`\`\`(?:json)?\s*([\s\S]*?)\`\`\`/i);
  const source=fenced ? fenced[1].trim() : raw;
  try{return JSON.parse(source);}catch{}
  const start=source.indexOf("{");
  const end=source.lastIndexOf("}");
  if(start<0 || end<=start)return null;
  try{return JSON.parse(source.slice(start,end+1));}catch{return null;}
}

function publicSources(sources){
  return (Array.isArray(sources)?sources:[]).map(source=>({
    id:clean(source.id),
    provider:clean(source.provider),
    title:clean(source.title),
    url:clean(source.url),
    languageCode:clean(source.languageCode),
    language:clean(source.language),
    evidenceType:clean(source.evidenceType),
    license:clean(source.license),
    factCount:Array.isArray(source.facts)?source.facts.length:0,
  }));
}

function promptGraph(graph){
  return {
    rootId:graph.rootId,
    nodes:(graph.nodes || []).map(node=>({
      id:node.id,
      kind:node.kind,
      form:node.display,
      role:node.role || "",
      languageCode:node.languageCode || "",
      evidenceSourceIds:node.evidenceSourceIds || [],
      glosses:node.glosses || [],
      authority:(node.authority || []).map(item=>({
        authorityId:item.authorityId,
        sourceLanguage:item.sourceLanguage,
        sourceLemma:item.sourceLemma,
        meaningsZh:item.meaningsZh,
        meaningsEn:item.meaningsEn,
      })),
    })),
    edges:graph.edges || [],
    sources:(graph.sources || []).map(source=>({
      id:source.id,
      title:source.title,
      language:source.language,
      facts:(source.facts || []).slice(0,5).map(fact=>({
        kind:fact.kind,
        text:clean(fact.text).slice(0,1000),
      })),
    })),
  };
}

function requiredComponentsForPrompt(graph,composition){
  if(!composition)return [];
  const nodeMap=graphNodeMap(graph);
  return composition.componentNodeIds
    .map(nodeId=>nodeMap.get(nodeId))
    .filter(Boolean)
    .map(node=>({
      nodeId:node.id,
      form:node.display,
      role:node.role || "root",
      languageCode:node.languageCode || "",
      glosses:node.glosses || [],
      authority:(node.authority || []).map(item=>({
        authorityId:item.authorityId,
        sourceLanguage:item.sourceLanguage,
        sourceLemma:item.sourceLemma,
        meaningsZh:item.meaningsZh,
        meaningsEn:item.meaningsEn,
      })),
      evidenceSourceIds:node.evidenceSourceIds || [],
    }));
}

function buildPrompt({surfaceWord,lookupWord,meaningZh,graph,composition}){
  const requiredComponents=requiredComponentsForPrompt(graph,composition);
  return [
    "你是 LexiFlow 的英语词源学习解释器。后台已经完成词级词源检索、关系解析和构词证据补全；你只能使用下面的 Evidence Graph。",
    "不要根据拼写猜词根，不要新增、删除或替换 Required Components。",
    "是否展示构词成分由结构化证据决定，不由你决定；你只负责解释这些已经确定的成分。",
    "你的任务是把可靠事实讲成适合英语学习者理解的中文，而不是写证据审计报告。",
    "",
    "表面单词："+surfaceWord,
    lookupWord!==surfaceWord ? "词典原形："+lookupWord : "",
    meaningZh ? "当前学习义："+meaningZh : "",
    "",
    "Required Components:",
    JSON.stringify(requiredComponents,null,2),
    "",
    "Evidence Graph:",
    JSON.stringify(promptGraph(graph),null,2),
    "",
    "输出规则：",
    "1. origin 只概括历史来源与传播路径。来源清楚时正常讲，不要因为某个词缀难翻译就降低整个词源解释。",
    "2. morphology.components 必须与 Required Components 一一对应：nodeId 完全相同、数量相同、顺序相同。",
    "3. 每个 required component 都必须给出简洁自然的 meaningZh。优先采用 authority.meaningsZh；其次翻译 glosses；最后依据该节点关联的词典事实概括。",
    "4. 不得自行省略后缀、词根或构词成分。例如结构证据明确给出 X + Y，就必须分别解释 X 和 Y。",
    "5. learnerExplanationZh 用 2-4 句自然中文回答“这个词为什么会有今天这个意思”，把构词和语义演变连起来。",
    "6. learnerExplanationZh 禁止出现“证据表明、现有证据、证据不足、无法可靠拆分、因此不拆、证据未明确”等后台审计措辞。",
    "7. Required Components 为空时，morphology.components=[]；此时仍可正常讲可靠的整词历史来源和意义演变。",
    "8. 只有整体历史来源都无法说明时，origin.confidence=insufficient。",
    "",
    "只输出 JSON：",
    JSON.stringify({
      origin:{
        confidence:"high|medium|insufficient",
        sourcePath:"Latin → Old French → English",
      },
      morphology:{
        components:requiredComponents.map(item=>({
          nodeId:item.nodeId,
          meaningZh:"该成分在这里的简洁中文含义",
        })),
      },
      learnerExplanationZh:"面向学习者的自然中文解释",
    }),
  ].filter(Boolean).join("\n");
}

function normalizeConfidence(value){
  const confidence=clean(value).toLowerCase();
  if(!CONFIDENCE.has(confidence)){
    const err=new Error("Invalid etymology confidence");
    err.code="ETYMOLOGY_AI_INVALID";
    throw err;
  }
  return confidence;
}

function primaryAuthority(node){
  return Array.isArray(node?.authority) && node.authority.length===1 ? node.authority[0] : null;
}

function authorityMeaningZh(authority){
  return (authority?.meaningsZh || []).map(clean).filter(Boolean).join("、");
}

function resolveComponent(node,item){
  const authority=primaryAuthority(node);
  const meaningZh=authorityMeaningZh(authority) || clean(item?.meaningZh);
  return {
    nodeId:node.id,
    form:node.display,
    role:node.role || "root",
    meaningZh,
    sourceLanguage:authority?.sourceLanguage || headingForLanguage(node.languageCode) || "",
    sourceForm:authority?.sourceLemma || node.display,
    evidenceSourceIds:[
      ...(node.evidenceSourceIds || []),
      ...(authority?.sourceIds || []),
    ].filter(Boolean),
  };
}

function validateRequiredComponentItems(items,graph,composition){
  const requiredIds=composition?.componentNodeIds || [];
  const supplied=Array.isArray(items) ? items : [];

  if(supplied.length!==requiredIds.length){
    const err=new Error("AI changed the required morphology component count");
    err.code="ETYMOLOGY_AI_COMPONENT_SET_CHANGED";
    throw err;
  }

  const nodeMap=graphNodeMap(graph);
  return requiredIds.map((nodeId,index)=>{
    const item=supplied[index];
    if(clean(item?.nodeId)!==nodeId){
      const err=new Error("AI changed required morphology component identity/order");
      err.code="ETYMOLOGY_AI_COMPONENT_SET_CHANGED";
      throw err;
    }

    const node=nodeMap.get(nodeId);
    if(!node || node.kind!=="component"){
      const err=new Error("Required morphology node is missing from graph");
      err.code="ETYMOLOGY_GRAPH_INVALID";
      throw err;
    }

    const grounded=(node.evidenceSourceIds || []).length>0 || (node.authority || []).length>0;
    if(!grounded){
      const err=new Error("Required morphology node is ungrounded");
      err.code="ETYMOLOGY_GRAPH_INVALID";
      throw err;
    }

    const component=resolveComponent(node,item);
    if(!component.meaningZh){
      const err=new Error("AI component meaning is empty at index "+index);
      err.code="ETYMOLOGY_AI_INVALID";
      throw err;
    }
    return component;
  });
}

function validateAiExplanation(parsed,graph,composition=null){
  if(!parsed || typeof parsed!=="object"){
    const err=new Error("AI returned invalid etymology JSON");
    err.code="ETYMOLOGY_AI_INVALID";
    throw err;
  }

  const originConfidence=normalizeConfidence(parsed.origin?.confidence);
  const sourcePath=clean(parsed.origin?.sourcePath);
  const learnerExplanationZh=clean(parsed.learnerExplanationZh);

  if(!learnerExplanationZh){
    const err=new Error("AI learner explanation is empty");
    err.code="ETYMOLOGY_AI_INVALID";
    throw err;
  }

  const forbiddenAuditCopy=/证据表明|现有证据|证据不足|无法可靠|因此不拆|证据未明确/i;
  if(forbiddenAuditCopy.test(learnerExplanationZh)){
    const err=new Error("AI leaked audit language into learner explanation");
    err.code="ETYMOLOGY_AI_AUDIT_COPY";
    throw err;
  }

  const components=validateRequiredComponentItems(
    parsed.morphology?.components,
    graph,
    composition
  );

  return {
    origin:{confidence:originConfidence,sourcePath},
    morphology:{
      confidence:composition?.confidence || "insufficient",
      components,
    },
    learnerExplanationZh,
  };
}

function evidenceStatus(validated){
  const scores={high:2,medium:1,insufficient:0};
  return Math.max(
    scores[validated.origin.confidence] || 0,
    scores[validated.morphology.confidence] || 0
  )>0 ? "verified_explanation" : "insufficient_evidence";
}

function createEtymologyService({
  cache=new PersistentEtymologyCache(),
  merriamWebsterProvider=async()=>null,
  wiktionaryProvider=(word,options)=>fetchWiktionaryEvidence(word,options),
  aiRunner=null,
  graphBuilder=buildEvidenceGraph,
  promptVersion=EXPLANATION_SCHEMA,
}={}){
  async function gather(word){
    const providers=[
      {
        name:"merriam-webster",
        run:()=>merriamWebsterProvider(word),
      },
      {
        name:"wiktionary",
        run:()=>wiktionaryProvider(word,{languageCode:"en",sourceId:"wiktionary"}),
      },
    ];

    const settled=await Promise.allSettled(
      providers.map(provider=>Promise.resolve().then(provider.run))
    );
    const sources=[];
    const providerErrors=[];
    const providerStates=[];

    settled.forEach((item,index)=>{
      const provider=providers[index];
      if(item.status==="rejected"){
        const code=clean(item.reason?.code) || "ETYMOLOGY_PROVIDER_FAILED";
        providerErrors.push({provider:provider.name,code});
        providerStates.push({provider:provider.name,status:"failed",code});
        return;
      }

      const value=item.value;
      if(value?.facts?.length){
        sources.push(value);
        providerStates.push({provider:provider.name,status:"available"});
        return;
      }

      providerStates.push({provider:provider.name,status:"empty"});
    });

    return {sources,providerErrors,providerStates};
  }

  function emptyEvidenceResult({surfaceWord,lookupWord,providerErrors,providerStates}){
    const providerFailed=providerStates.some(item=>item.status==="failed");
    return {
      schema:EXPLANATION_SCHEMA,
      status:providerFailed ? "provider_unavailable" : "insufficient_evidence",
      word:surfaceWord,
      lookupWord,
      origin:{confidence:"insufficient",sourcePath:""},
      morphology:{confidence:"insufficient",components:[]},
      learnerExplanationZh:providerFailed
        ? "词源来源暂时连接失败，请稍后重试。"
        : "暂时没有找到足够可靠的词源信息。",
      sources:[],
      providerErrors,
      providerStates,
      cacheHit:false,
    };
  }

  async function explain(inputWord,{meaningZh="",lemma="",forceRefresh=false}={}){
    const surfaceWord=normalizeWord(inputWord);
    let lookupWord=surfaceWord;
    if(clean(lemma)){
      try{ lookupWord=normalizeWord(lemma); }catch{}
    }

    const normalizedMeaning=clean(meaningZh).replace(/\s+/g," ").slice(0,120);
    const baseKey=[promptVersion,surfaceWord,lookupWord,normalizedMeaning].join("|");

    if(!forceRefresh){
      const cached=await cache.get(baseKey);
      if(cached)return {...cached,cacheHit:true};
    }

    const {sources,providerErrors,providerStates}=await gather(lookupWord);
    if(!sources.length){
      return emptyEvidenceResult({
        surfaceWord,
        lookupWord,
        providerErrors,
        providerStates,
      });
    }

    const graph=await graphBuilder({
      word:lookupWord,
      sources,
      wiktionaryProvider,
      maxDepth:3,
      maxNodes:18,
      maxProviderCalls:10,
    });

    const graphSources=graph.sources || [];
    const fingerprint=evidenceFingerprint(graphSources);
    const composition=selectPrimaryComposition(graph);

    if(typeof aiRunner!=="function"){
      return {
        schema:EXPLANATION_SCHEMA,
        status:"evidence_ready_ai_unavailable",
        word:surfaceWord,
        lookupWord,
        origin:{confidence:"insufficient",sourcePath:""},
        morphology:{confidence:"insufficient",components:[]},
        learnerExplanationZh:"词源来源已经找到，但解释服务暂时不可用。",
        sources:publicSources(graphSources),
        evidenceSummary:{
          nodeCount:(graph.nodes || []).length,
          edgeCount:(graph.edges || []).length,
          componentCount:(graph.nodes || []).filter(node=>node.kind==="component").length,
          selectedComponentCount:composition?.componentNodeIds?.length || 0,
        },
        providerErrors,
        providerStates,
        cacheHit:false,
      };
    }

    const prompt=buildPrompt({
      surfaceWord,
      lookupWord,
      meaningZh:normalizedMeaning,
      graph,
      composition,
    });

    let output;
    try{
      output=await aiRunner(prompt,30000);
    }catch(err){
      return {
        schema:EXPLANATION_SCHEMA,
        status:"evidence_ready_ai_unavailable",
        word:surfaceWord,
        lookupWord,
        origin:{confidence:"insufficient",sourcePath:""},
        morphology:{confidence:"insufficient",components:[]},
        learnerExplanationZh:"词源来源已经找到，但解释服务暂时没有完成。",
        sources:publicSources(graphSources),
        evidenceSummary:{
          nodeCount:(graph.nodes || []).length,
          edgeCount:(graph.edges || []).length,
          componentCount:(graph.nodes || []).filter(node=>node.kind==="component").length,
        },
        providerErrors:[
          ...providerErrors,
          {provider:"ai",code:clean(err?.code) || "ETYMOLOGY_AI_UNAVAILABLE"},
        ],
        cacheHit:false,
      };
    }

    const validated=validateAiExplanation(extractJson(output),graph,composition);
    const result={
      schema:EXPLANATION_SCHEMA,
      status:evidenceStatus(validated),
      word:surfaceWord,
      lookupWord,
      origin:validated.origin,
      morphology:validated.morphology,
      learnerExplanationZh:validated.learnerExplanationZh,
      sources:publicSources(graphSources),
      evidenceFingerprint:fingerprint,
      evidenceSummary:{
        nodeCount:(graph.nodes || []).length,
        edgeCount:(graph.edges || []).length,
        componentCount:(graph.nodes || []).filter(node=>node.kind==="component").length,
        selectedComponentCount:composition?.componentNodeIds?.length || 0,
      },
      providerErrors,
      cacheHit:false,
    };

    if(result.status==="verified_explanation"){
      await cache.set(baseKey,result);
    }
    return result;
  }

  return Object.freeze({explain});
}

module.exports={
  EXPLANATION_SCHEMA,
  extractJson,
  buildPrompt,
  validateAiExplanation,
  createEtymologyService,
};
