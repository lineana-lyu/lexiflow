"use strict";

const morphemeAuthority=require("./morpheme-authority");

const GRAPH_SCHEMA="lexiflow-etymology-evidence-graph-v1";
const QUERYABLE_TERM=/^-?[a-z][a-z'-]{0,63}$/i;

function clean(value){ return String(value ?? "").trim(); }
function normalizedTerm(value){ return clean(value).toLowerCase(); }

function stableNodeId(kind,languageCode,value){
  const safe=normalizedTerm(value).replace(/[^a-z0-9'-]+/g,"-");
  return [kind,clean(languageCode).toLowerCase() || "und",safe].join(":");
}

function unique(values){
  return [...new Set((values || []).map(clean).filter(Boolean))];
}

function authorityForForm(form){
  const direct=morphemeAuthority.findByTeachingForm(form);
  const stripped=clean(form).replace(/^-|-$/g,"");
  const fallback=direct.length ? [] : morphemeAuthority.findByTeachingForm(stripped);
  return [...direct,...fallback].map(item=>{
    const evidence=morphemeAuthority.evidenceFor(item.id);
    const sourceRecords=(evidence?.sources || []).map(source=>({
      id:"authority:"+source.id,
      provider:"authority",
      title:source.work || source.title || source.id,
      url:source.url || "",
      languageCode:"",
      language:item.sourceLanguage || "",
      evidenceType:"historical_lexicography",
      license:source.publicDomain ? "Public domain" : "",
      facts:[{
        kind:"authority",
        text:[
          item.sourceLemma ? "lemma: "+item.sourceLemma : "",
          (item.coreMeaningEn || []).length ? "meaning: "+item.coreMeaningEn.join("; ") : "",
        ].filter(Boolean).join(" · "),
      }],
    }));
    return {
      authorityId:item.id,
      teachingForms:item.teachingForms || [],
      sourceLanguage:item.sourceLanguage || "",
      sourceLemma:item.sourceLemma || "",
      meaningsZh:item.coreMeaningZh || [],
      meaningsEn:item.coreMeaningEn || [],
      sourceIds:sourceRecords.map(source=>source.id),
      sourceRecords,
    };
  });
}

function publicSource(source){
  return {
    id:clean(source?.id),
    provider:clean(source?.provider),
    title:clean(source?.title),
    url:clean(source?.url),
    languageCode:clean(source?.languageCode),
    language:clean(source?.language),
    evidenceType:clean(source?.evidenceType),
    license:clean(source?.license),
    facts:(source?.facts || []).map(fact=>({
      kind:clean(fact?.kind) || "etymology",
      text:clean(fact?.text),
    })).filter(fact=>fact.text),
  };
}

function createGraph(word){
  const rootId=stableNodeId("word","en",word);
  return {
    schema:GRAPH_SCHEMA,
    rootId,
    nodes:new Map([[rootId,{
      id:rootId,
      kind:"word",
      term:normalizedTerm(word),
      display:clean(word),
      languageCode:"en",
      depth:0,
      evidenceSourceIds:[],
      authority:[],
      glosses:[],
    }]]),
    edges:[],
    sources:new Map(),
    edgeKeys:new Set(),
  };
}

function ensureNode(graph,{kind,term,display,languageCode,depth,role="",gloss=""}){
  const value=clean(term || display);
  if(!value)return null;
  const id=stableNodeId(kind,languageCode,value);
  const existing=graph.nodes.get(id);
  if(existing){
    existing.depth=Math.min(existing.depth,depth);
    if(role && !existing.role)existing.role=role;
    if(gloss)existing.glosses=unique([...(existing.glosses || []),gloss]);
    return existing;
  }
  const node={
    id,
    kind,
    term:normalizedTerm(value),
    display:clean(display || value),
    languageCode:clean(languageCode).toLowerCase(),
    depth,
    role:clean(role),
    evidenceSourceIds:[],
    authority:[],
    glosses:gloss ? [clean(gloss)] : [],
  };
  graph.nodes.set(id,node);
  return node;
}

function addEdge(graph,from,to,type,meta={}){
  if(!from || !to || from===to)return;
  const key=[from,type,to].join("|");
  if(graph.edgeKeys.has(key))return;
  graph.edgeKeys.add(key);
  graph.edges.push({from,to,type,...meta});
}

function attachSource(graph,node,source){
  if(!source?.id)return;
  graph.sources.set(source.id,publicSource(source));
  node.evidenceSourceIds=unique([...node.evidenceSourceIds,source.id]);
}

function applyAuthority(graph,node,provider=authorityForForm){
  if(node.kind!=="component")return;
  const matches=(provider(node.display) || []).slice(0,4);
  node.authority=matches.map(item=>{
    for(const source of item.sourceRecords || []){
      graph.sources.set(source.id,publicSource(source));
      node.evidenceSourceIds=unique([...node.evidenceSourceIds,source.id]);
    }
    const {sourceRecords,...publicAuthority}=item;
    return publicAuthority;
  });
}

function ingestRelations(graph,parent,source,depth,maxNodes){
  const relations=Array.isArray(source?.relations) ? source.relations : [];
  const created=[];

  for(const relation of relations){
    if(graph.nodes.size>=maxNodes)break;

    if(relation.type==="composed_of"){
      for(const component of relation.components || []){
        if(graph.nodes.size>=maxNodes)break;
        const node=ensureNode(graph,{
          kind:"component",
          term:component.form,
          display:component.form,
          languageCode:component.languageCode || relation.languageCode || parent.languageCode,
          depth:depth+1,
          role:component.role,
          gloss:component.gloss || "",
        });
        if(!node)continue;
        attachSource(graph,node,source);
        addEdge(graph,parent.id,node.id,"composed_of",{
          role:component.role || "",
          sourceId:source.id,
        });
        created.push(node);
      }
      continue;
    }

    const term=clean(relation.term);
    if(!term)continue;
    const node=ensureNode(graph,{
      kind:"ancestor",
      term,
      display:term,
      languageCode:relation.languageCode || "",
      depth:depth+1,
    });
    if(!node)continue;
    attachSource(graph,node,source);
    addEdge(graph,parent.id,node.id,relation.type,{sourceId:source.id});
    created.push(node);
  }

  return created;
}

function queryDescriptor(node){
  const term=clean(node.display || node.term);
  if(!QUERYABLE_TERM.test(term))return null;
  return {
    term,
    languageCode:node.languageCode || "en",
    sourceId:["wiktionary",node.languageCode || "en",normalizedTerm(term)].join(":"),
  };
}

async function buildEvidenceGraph({
  word,
  sources=[],
  wiktionaryProvider=null,
  authorityProvider=authorityForForm,
  maxDepth=2,
  maxNodes=18,
  maxProviderCalls=10,
}={}){
  const graph=createGraph(word);
  const root=graph.nodes.get(graph.rootId);
  const queue=[];

  for(const source of sources){
    attachSource(graph,root,source);
    queue.push(...ingestRelations(graph,root,source,0,maxNodes));
  }

  const visited=new Set();
  let providerCalls=0;

  while(queue.length && providerCalls<maxProviderCalls){
    const node=queue.shift();
    if(!node || visited.has(node.id))continue;
    visited.add(node.id);

    applyAuthority(graph,node,authorityProvider);
    if(node.depth>=maxDepth || typeof wiktionaryProvider!=="function")continue;

    const query=queryDescriptor(node);
    if(!query)continue;

    let source=null;
    try{
      providerCalls+=1;
      source=await wiktionaryProvider(query.term,{
        languageCode:query.languageCode,
        sourceId:query.sourceId,
      });
    }catch{
      source=null;
    }
    if(!source)continue;

    attachSource(graph,node,source);
    queue.push(...ingestRelations(graph,node,source,node.depth,maxNodes));
  }

  for(const node of graph.nodes.values())applyAuthority(graph,node,authorityProvider);

  return {
    schema:GRAPH_SCHEMA,
    rootId:graph.rootId,
    nodes:[...graph.nodes.values()].map(node=>({
      ...node,
      evidenceSourceIds:unique(node.evidenceSourceIds),
    })),
    edges:graph.edges,
    sources:[...graph.sources.values()],
    limits:{maxDepth,maxNodes,maxProviderCalls,providerCalls},
  };
}

function graphNodeMap(graph){
  return new Map((graph?.nodes || []).map(node=>[node.id,node]));
}

module.exports={
  GRAPH_SCHEMA,
  authorityForForm,
  buildEvidenceGraph,
  graphNodeMap,
};
