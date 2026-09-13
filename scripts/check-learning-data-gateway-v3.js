const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const exists=name=>fs.existsSync(path.join(root,name));

const index=read("public/index.html");
const source=read("public/learning-data-gateway-v3.js");
const sourceContext=read("public/source-context-v3.js");
const app=read("public/app.js");

assert(index.includes('<script src="./learning-core-v3.js"></script>'),"Learning Core V3 must be active");
assert(!index.includes('<script src="./learning-core-v2.js"></script>'),"Learning Core V2 must not remain in the runtime load chain");
assert(index.includes('<script src="./learning-data-gateway-v3.js"></script>'),"Learning Data Gateway V3 must be active");
assert(!index.includes('<script src="./learning-engine-v2.js"></script>'),"Learning Engine V2 must not remain in the runtime load chain");
assert(!exists("public/learning-engine-v2.js"),"Learning Engine V2 source must stay deleted after gateway promotion");
assert(!index.includes('<script src="./legacy-data-fix.js"></script>'),"legacy data fetch shim must not remain in the runtime load chain");
assert(!exists("public/legacy-data-fix.js"),"legacy data fetch shim must stay deleted after gateway consolidation");
assert(index.indexOf("learning-core-v3.js")<index.indexOf("learning-data-gateway-v3.js"),"Learning Core V3 must load before the V3 data gateway");
assert(index.indexOf("learning-data-gateway-v3.js")<index.indexOf("studyday-boundary-v3.js"),"V3 data gateway must normalize learning data before downstream runtime modules");
assert(index.indexOf("learning-data-gateway-v3.js")<index.indexOf("source-context-v3.js"),"Gateway hook API must exist before Source Context registers persistence hooks");
assert(index.indexOf("learning-data-gateway-v3.js")<index.indexOf("app.js"),"Gateway hook API must exist before the base app registers confirmed-snapshot synchronization");

assert(source.includes('endpoint!=="/api/learning-data"'),"gateway must be scoped to the learning-data endpoint");
assert(source.includes("core.normalizeData"),"gateway must normalize every learning dataset");
assert(source.includes("core.crossDayPatch"),"gateway must preserve deterministic cross-day guards for non-stage app writes");
assert(source.includes("core.buildDailyPlan"),"gateway must preserve the frozen DailyPlan model on writes");
assert(source.includes('learningDataAuthority:source.learningDataAuthority||"gateway-v3"'),"gateway writes must identify V3 authority");
assert(source.includes("repairLegacyMeanings"),"gateway must absorb the old safe Chinese-meaning migration");
assert(source.includes('migrationAuthority:"legacy-meaning-v3"'),"legacy meaning repairs must be explicitly identified when persisted");
assert(source.includes("const outgoingMutators=new Set()")&&source.includes("const afterPersistListeners=new Set()"),"gateway must centralize feature persistence hooks");
assert(source.includes("function registerOutgoingMutator")&&source.includes("function registerAfterPersist"),"gateway must expose explicit outgoing and successful-persist hooks");
assert(source.includes("applyOutgoingMutators(body)"),"gateway must apply registered feature mutations before deterministic normalization");
assert(source.includes('normalizeOutgoing({data,migrationAuthority:"legacy-meaning-v3"},{skipMutators:true})'),"legacy meaning migration must not consume feature drafts through outgoing hooks");
assert(source.includes("const response=await upstreamFetch(input,requestWithJson(init,body));"),"gateway must await the actual persistence response");
assert(source.includes("if(response.ok&&body?.data?.cards)commitSnapshot(body.data"),"gateway snapshot must advance only after a successful POST");
assert(!/normalizeOutgoing[\s\S]*latestData\s*=/.test(source.split("function commitSnapshot")[0]),"normalization must not optimistically advance the authoritative snapshot before persistence succeeds");
assert(source.includes("current:currentSnapshot"),"gateway must expose a defensive in-memory snapshot");
assert(source.includes("registerOutgoingMutator,")&&source.includes("registerAfterPersist,"),"gateway public bridge must expose only explicit persistence hook registration");
assert(source.includes("LexiFlowLearningDataGatewayV3=Object.freeze"),"gateway must expose only a narrow diagnostics bridge");
assert(!source.includes("/api/ai/visual-scene"),"learning-data gateway must not intercept AI behavior");
assert(!source.includes("MutationObserver")&&!source.includes("setInterval"),"learning-data gateway must not own UI decoration or polling");
assert(!source.includes("连续学习")&&!source.includes("initial-review-rate")&&!source.includes("review-rate"),"gateway must not contain retired product UI behavior");

assert(!sourceContext.includes("window.fetch =")&&!sourceContext.includes("window.fetch="),"Source Context V3 must not install another global learning-data fetch wrapper");
assert(sourceContext.includes("gateway.registerOutgoingMutator(outgoingMutator)"),"Source Context must preserve source metadata through the gateway outgoing hook");
assert(sourceContext.includes("gateway.registerAfterPersist(afterPersist)"),"Source Context must observe only successful persistence before clearing a draft");
assert(sourceContext.includes("pendingDraftCardIds"),"Source Context must track draft attachment until persistence succeeds");
assert(app.includes("learningDataGateway.registerAfterPersist")&&app.includes("state.data=normalizeLearningData(snapshot)"),"base app state must follow Gateway-confirmed persistence so generic full-data saves cannot revive a stale snapshot");
assert(app.includes('appShellAuthority:"v1"'),"base app learning-data writes must identify their authority for persistence diagnostics");
assert(!app.includes('navigator.sendBeacon("/api/learning-data"'),"base app must not bypass the Learning Data Gateway with a direct learning-data beacon");
assert(app.includes('void fetch("/api/learning-data"')&&app.includes("keepalive:true")&&app.includes('reason:"beforeunload"'),"beforeunload persistence must stay on the Gateway-observed fetch path while requesting keepalive delivery");
assert(!app.includes('recordActivity("card-created",card.id);saveData();'),"new-card creation must not enqueue a duplicate whole-data save after recordActivity already persists the mutation");
assert(app.includes("const target=getCard(cardId);")&&app.includes("target.updatedAt=new Date().toISOString();saveData();"),"async pronunciation hydration must re-resolve the current card after awaiting the dictionary service");

console.log("Learning Data Gateway V3 checks passed.");