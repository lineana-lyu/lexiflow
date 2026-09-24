"use strict";

const {
  normalizeWord,
  fetchWiktionaryEvidence,
  evidenceFingerprint,
} = require("./etymology-evidence");
const { headingForLanguage } = require("./wiktionary-structure");
const { PersistentEtymologyCache } = require("./etymology-cache");
const { buildEvidenceGraph, graphNodeMap } = require("./etymology-graph");

const EXPLANATION_SCHEMA = "lexiflow-etymology-explanation-v2";
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

function buildPrompt({surfaceWord,lookupWord,meaningZh,graph}){
  return [
    "你是 LexiFlow 的英语词源学习解释器。后台已经完成词级词源检索、关系解析和构词证据补全；你只能使用下面的 Evidence Graph。",
    "不要根据拼写猜词根，不要新增图中不存在的构词成分。",
    "你的任务是把可靠事实讲成适合英语学习者理解的中文，而不是写证据审计报告。",
    "",
    "表面单词："+surfaceWord,
    lookupWord!==surfaceWord ? "词典原形："+lookupWord : "",
    meaningZh ? "当前学习义："+meaningZh : "",
    "",
    "Evidence Graph:",
    JSON.stringify(promptGraph(graph),null,2),
    "",
    "输出规则：",
    "1. origin 只概括历史来源与传播路径。来源清楚但构词不够清楚时，origin 仍可为 high/medium。",
    "2. morphology.components 只能引用 graph 中 kind=component 的 nodeId；不要创造 nodeId。",
    "3. component 的中文含义优先使用 authority.meaningsZh；没有 authority 时，才依据该节点关联的词典事实概括。",
    "4. 如果某个成分的含义不清楚，就不要展示该成分；不要输出“未说明”“证据未明确说明”等占位文案。",
    "5. learnerExplanationZh 用 2-4 句自然中文回答“这个词为什么会有今天这个意思”。允许只讲可靠的历史语义演变，不要求每个词都必须拆成词根词缀。",
    "6. learnerExplanationZh 禁止出现“证据表明、现有证据、证据不足、无法可靠拆分、因此不拆”等后台审计措辞。",
    "7. 如果来源本身可靠，但不能安全拆构词，morphology.confidence=insufficient、components=[]，同时正常写 learnerExplanationZh。",
    "8. 只有整体历史来源都无法说明时，origin.confidence=insufficient。",
    "",
    "只输出 JSON：",
    JSON.stringify({
      origin:{
        confidence:"high|medium|insufficient",
        sourcePath:"Latin → Old French → English",
      },
      morphology:{
        confidence:"high|medium|insufficient",
        components:[
          {nodeId:"component:la:ad-",meaningZh:"向、朝"},
        ],
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

function resolveComponent(node,item){
  const authority=primaryAuthority(node);
  return {
    nodeId:node.id,
    form:node.display,
    role:node.role || "root",
    meaningZh:clean(item?.meaningZh),
    sourceLanguage:authority?.sourceLanguage || headingForLanguage(node.languageCode) || "",
    sourceForm:authority?.sourceLemma || node.display,
    evidenceSourceIds:[
      ...(node.evidenceSourceIds || []),
      ...(authority?.sourceIds || []),
    ].filter(Boolean),
  };
}

function validateAiExplanation(parsed,graph){
  if(!parsed || typeof parsed!=="object"){
    const err=new Error("AI returned invalid etymology JSON");
    err.code="ETYMOLOGY_AI_INVALID";
    throw err;
  }

  const originConfidence=normalizeConfidence(parsed.origin?.confidence);
  const morphologyConfidence=normalizeConfidence(parsed.morphology?.confidence);
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

  const nodeMap=graphNodeMap(graph);
  const requested=morphologyConfidence==="insufficient"
    ? []
    : (Array.isArray(parsed.morphology?.components)?parsed.morphology.components:[]).slice(0,8);

  const components=requested.map((item,index)=>{
    const nodeId=clean(item?.nodeId);
    const node=nodeMap.get(nodeId);
    if(!node || node.kind!=="component"){
      const err=new Error("AI referenced an unknown morphology node at index "+index);
      err.code="ETYMOLOGY_AI_UNGROUNDED";
      throw err;
    }
    const grounded=(node.evidenceSourceIds || []).length>0 || (node.authority || []).length>0;
    if(!grounded){
      const err=new Error("AI referenced an ungrounded morphology node at index "+index);
      err.code="ETYMOLOGY_AI_UNGROUNDED";
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

  return {
    origin:{confidence:originConfidence,sourcePath},
    morphology:{confidence:morphologyConfidence,components},
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
    const settled=await Promise.allSettled([
      Promise.resolve().then(()=>merriamWebsterProvider(word)),
      Promise.resolve().then(()=>wiktionaryProvider(word,{languageCode:"en",sourceId:"wiktionary"})),
    ]);
    const providerNames=["merriam-webster","wiktionary"];
    const sources=[];
    const providerErrors=[];

    settled.forEach((item,index)=>{
      if(item.status==="fulfilled"){
        if(item.value?.facts?.length)sources.push(item.value);
        return;
      }
      providerErrors.push({
        provider:providerNames[index],
        code:clean(item.reason?.code) || "ETYMOLOGY_PROVIDER_FAILED",
      });
    });

    return {sources,providerErrors};
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

    const {sources,providerErrors}=await gather(lookupWord);
    if(!sources.length){
      return {
        schema:EXPLANATION_SCHEMA,
        status:"insufficient_evidence",
        word:surfaceWord,
        lookupWord,
        origin:{confidence:"insufficient",sourcePath:""},
        morphology:{confidence:"insufficient",components:[]},
        learnerExplanationZh:"暂时没有找到足够可靠的词源信息。",
        sources:[],
        providerErrors,
        cacheHit:false,
      };
    }

    const graph=await graphBuilder({
      word:lookupWord,
      sources,
      wiktionaryProvider,
      maxDepth:2,
      maxNodes:18,
      maxProviderCalls:10,
    });

    const graphSources=graph.sources || [];
    const fingerprint=evidenceFingerprint(graphSources);

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
        },
        providerErrors,
        cacheHit:false,
      };
    }

    const prompt=buildPrompt({
      surfaceWord,
      lookupWord,
      meaningZh:normalizedMeaning,
      graph,
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

    const validated=validateAiExplanation(extractJson(output),graph);
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
