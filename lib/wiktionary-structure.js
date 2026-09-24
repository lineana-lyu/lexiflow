"use strict";

const LANGUAGE_HEADINGS = Object.freeze({
  en:"English",
  enm:"Middle English",
  ang:"Old English",
  la:"Latin",
  fro:"Old French",
  fr:"French",
  grc:"Ancient Greek",
  el:"Greek",
  de:"German",
  gem:"Germanic",
  it:"Italian",
  es:"Spanish",
});

const DECOMPOSITION_TEMPLATES = new Set([
  "prefix","suffix","compound","confix","affix","af",
]);

const ANCESTOR_TEMPLATE_TYPES = Object.freeze({
  bor:"borrowed_from",
  borrowed:"borrowed_from",
  lbor:"borrowed_from",
  "learned borrowing":"borrowed_from",
  inh:"inherited_from",
  inherited:"inherited_from",
  der:"derived_from",
  derived:"derived_from",
});

const FORM_OF_TEMPLATES = new Set([
  "past participle of",
  "present participle of",
  "inflection of",
  "form of",
  "plural of",
  "comparative of",
  "superlative of",
  "alternative form of",
  "alternative spelling of",
]);

function clean(value){ return String(value ?? "").trim(); }

function headingForLanguage(code){
  const key=clean(code).toLowerCase();
  return LANGUAGE_HEADINGS[key] || clean(code);
}

function languageSection(wikitext, language="English"){
  const text=String(wikitext || "");
  const heading=headingForLanguage(language);
  if(!heading)return "";
  const escaped=heading.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const re=new RegExp("^=="+escaped+"==\\s*$","m");
  const match=re.exec(text);
  if(!match)return "";
  const rest=text.slice(match.index + match[0].length);
  const next=/^==[^=].*==\s*$/m.exec(rest);
  return next ? rest.slice(0,next.index) : rest;
}

function etymologySectionsFromLanguageSection(section){
  const text=String(section || "");
  const heading=/^===Etymology(?:\s+\d+)?===\s*$/gm;
  const matches=[...text.matchAll(heading)];
  const sections=[];
  for(let i=0;i<matches.length;i++){
    const start=matches[i].index + matches[i][0].length;
    const tail=text.slice(start);
    const next=/^===[^=].*===\s*$/m.exec(tail);
    const raw=(next ? tail.slice(0,next.index) : tail).trim();
    if(raw)sections.push(raw);
  }
  return sections;
}

function splitTopLevel(value, delimiter="|"){
  const text=String(value || "");
  const parts=[];
  let current="";
  let templateDepth=0;
  let linkDepth=0;

  for(let i=0;i<text.length;i++){
    const two=text.slice(i,i+2);
    if(two==="{{"){ templateDepth+=1; current+=two; i+=1; continue; }
    if(two==="}}" && templateDepth>0){ templateDepth-=1; current+=two; i+=1; continue; }
    if(two==="[["){ linkDepth+=1; current+=two; i+=1; continue; }
    if(two==="]]" && linkDepth>0){ linkDepth-=1; current+=two; i+=1; continue; }

    if(text[i]===delimiter && templateDepth===0 && linkDepth===0){
      parts.push(current);
      current="";
      continue;
    }
    current+=text[i];
  }
  parts.push(current);
  return parts;
}

function extractBalancedTemplates(value){
  const text=String(value || "");
  const templates=[];
  const stack=[];

  for(let i=0;i<text.length-1;i++){
    const two=text.slice(i,i+2);
    if(two==="{{"){
      stack.push(i);
      i+=1;
      continue;
    }
    if(two==="}}" && stack.length){
      const start=stack.pop();
      if(stack.length===0){
        templates.push(text.slice(start+2,i));
      }
      i+=1;
    }
  }
  return templates;
}

function parseTemplate(raw){
  const parts=splitTopLevel(raw).map(clean);
  const name=clean(parts.shift()).toLowerCase().replace(/_/g," ");
  const positional=[];
  const named={};

  for(const part of parts){
    const eq=part.indexOf("=");
    const key=eq>0 ? clean(part.slice(0,eq)).toLowerCase() : "";
    if(key && /^[a-z][a-z0-9_-]*$/i.test(key)){
      named[key]=clean(part.slice(eq+1));
    }else{
      positional.push(part);
    }
  }

  return { name, positional, named, raw:clean(raw) };
}

function normalizeSurface(value){
  return clean(value)
    .replace(/^\[\[|\]\]$/g,"")
    .trim();
}

function componentRole(form,index,count,templateName){
  const value=clean(form);
  if(value.endsWith("-"))return "prefix";
  if(value.startsWith("-"))return "suffix";
  if(templateName==="prefix" && index===0)return "prefix";
  if(templateName==="suffix" && index===count-1)return "suffix";
  return "root";
}

function componentGloss(template,index){
  const ordinal=String(index+1);
  return clean(
    template.named["t"+ordinal] ||
    template.named["gloss"+ordinal] ||
    (index===0 ? template.named.t || template.named.gloss : "")
  );
}

function decompositionRelation(template){
  const args=template.positional.filter(Boolean);
  if(args.length<3)return null;
  const languageCode=clean(args[0]).toLowerCase();
  const forms=args.slice(1).map(normalizeSurface).filter(Boolean);
  if(forms.length<2)return null;

  return {
    type:"composed_of",
    languageCode,
    components:forms.map((form,index)=>({
      form,
      role:componentRole(form,index,forms.length,template.name),
      languageCode,
      gloss:componentGloss(template,index),
    })),
    template:template.name,
  };
}

function ancestorRelation(template){
  const relationType=ANCESTOR_TEMPLATE_TYPES[template.name];
  const args=template.positional.filter(Boolean);
  if(!relationType || args.length<3)return null;
  const sourceLanguageCode=clean(args[1]).toLowerCase();
  const term=normalizeSurface(args[2]);
  if(!term)return null;
  return {
    type:relationType,
    languageCode:sourceLanguageCode,
    term,
    template:template.name,
  };
}

const RELATION_STRATEGIES=Object.freeze([
  {
    accepts:template=>DECOMPOSITION_TEMPLATES.has(template.name),
    resolve:decompositionRelation,
  },
  {
    accepts:template=>Object.prototype.hasOwnProperty.call(ANCESTOR_TEMPLATE_TYPES,template.name),
    resolve:ancestorRelation,
  },
]);

function relationKey(relation){
  if(relation.type==="composed_of"){
    return [relation.type,relation.languageCode,relation.components.map(x=>x.role+":"+x.form).join("+")].join("|");
  }
  return [relation.type,relation.languageCode,relation.term].join("|");
}

function extractMentionPlusRelations(section){
  const text=String(section || "");
  const pair=/(\{\{(?:m|l|link)\|[^{}]+\}\})\s*\+\s*(\{\{(?:m|l|link)\|[^{}]+\}\})/g;
  const relations=[];

  for(const match of text.matchAll(pair)){
    const templates=[match[1],match[2]].map(raw=>parseTemplate(raw.slice(2,-2)));
    const languageCodes=templates.map(template=>clean(template.positional[0]).toLowerCase());
    if(!languageCodes[0] || languageCodes[0]!==languageCodes[1])continue;

    const forms=templates.map(template=>normalizeSurface(template.positional[1]));
    if(forms.some(form=>!form))continue;

    relations.push({
      type:"composed_of",
      languageCode:languageCodes[0],
      components:forms.map((form,index)=>({
        form,
        role:componentRole(form,index,forms.length,"affix"),
        languageCode:languageCodes[0],
        gloss:clean(templates[index].named.t || templates[index].named.gloss),
      })),
      template:"mention-plus",
    });
  }

  return relations;
}

function extractEtymologyRelations(rawSections){
  const relations=[];
  const seen=new Set();

  for(const section of Array.isArray(rawSections)?rawSections:[]){
    const candidates=[];

    for(const rawTemplate of extractBalancedTemplates(section)){
      const template=parseTemplate(rawTemplate);
      const strategy=RELATION_STRATEGIES.find(item=>item.accepts(template));
      const relation=strategy?.resolve(template);
      if(relation)candidates.push(relation);
    }

    candidates.push(...extractMentionPlusRelations(section));

    for(const relation of candidates){
      const key=relationKey(relation);
      if(seen.has(key))continue;
      seen.add(key);
      relations.push(relation);
    }
  }

  return relations;
}


function extractFormRelations(languageSectionText){
  const relations=[];
  const seen=new Set();

  for(const rawTemplate of extractBalancedTemplates(languageSectionText)){
    const template=parseTemplate(rawTemplate);
    if(!FORM_OF_TEMPLATES.has(template.name))continue;

    const args=template.positional.filter(Boolean);
    if(args.length<2)continue;

    const languageCode=clean(args[0]).toLowerCase();
    const term=normalizeSurface(args[1]);
    if(!term)continue;

    const relation={
      type:"form_of",
      languageCode,
      term,
      template:template.name,
    };
    const key=relationKey(relation);
    if(seen.has(key))continue;
    seen.add(key);
    relations.push(relation);
  }

  return relations;
}

module.exports={
  LANGUAGE_HEADINGS,
  headingForLanguage,
  languageSection,
  etymologySectionsFromLanguageSection,
  splitTopLevel,
  extractBalancedTemplates,
  parseTemplate,
  extractMentionPlusRelations,
  extractEtymologyRelations,
  extractFormRelations,
};
