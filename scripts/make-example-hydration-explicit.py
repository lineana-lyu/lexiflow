from pathlib import Path

# 1) Example hydration becomes an explicit bridge instead of a global fetch wrapper.
hydration_path=Path("public/example-hydration.js")
hydration=hydration_path.read_text(encoding="utf-8")
request_path='''  function requestPath(input) {
    try {
      const raw = typeof input === "string" ? input : input?.url || "";
      return new URL(raw, location.href).pathname;
    } catch { return ""; }
  }

'''
if request_path in hydration:
    hydration=hydration.replace(request_path,"",1)
old_wrapper='''  window.fetch = async function lexiFlowExampleAwareFetch(input, init) {
    const response = await nativeFetch(input, init);
    const pathname = requestPath(input);
    if (!new Set(["/api/search/smart","/api/dictionary/lookup"]).has(pathname)) return response;
    return new Proxy(response, {
      get(target, prop) {
        if(prop === "json") return async()=>{
          const payload=await target.json();
          if(isLocalDictionaryPayload(payload)) { void hydrateResult(payload.result); void hydratePronunciation(payload.result); }
          return payload;
        };
        const value=Reflect.get(target,prop,target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  };
'''
new_bridge='''  function processPayload(path,payload) {
    if (!new Set(["/api/search/smart","/api/dictionary/lookup"]).has(String(path||""))) return payload;
    if (isLocalDictionaryPayload(payload)) {
      void hydrateResult(payload.result);
      void hydratePronunciation(payload.result);
    }
    return payload;
  }

  window.LexiFlowExampleHydration=Object.freeze({processPayload});
'''
if old_wrapper in hydration:
    hydration=hydration.replace(old_wrapper,new_bridge,1)
elif "LexiFlowExampleHydration=Object.freeze" not in hydration:
    raise SystemExit("example hydration fetch wrapper not found")
for retired in ["window.fetch = async function lexiFlowExampleAwareFetch","new Proxy(response","requestPath(input)"]:
    if retired in hydration:
        raise SystemExit(f"retired example-hydration fetch interception remains: {retired}")
for required in ["function processPayload(path,payload)","LexiFlowExampleHydration=Object.freeze({processPayload})","void hydrateResult(payload.result)","void hydratePronunciation(payload.result)"]:
    if required not in hydration:
        raise SystemExit(f"example hydration bridge contract missing: {required}")
hydration_path.write_text(hydration,encoding="utf-8")

# 2) app.js explicitly hands successful dictionary payloads to the bridge.
app_path=Path("public/app.js")
app=app_path.read_text(encoding="utf-8")
old='''    let payload={};
    try{payload=await response.json();}catch{}
    if(!response.ok){
'''
new='''    let payload={};
    try{payload=await response.json();}catch{}
    if(response.ok&&(path==="/api/search/smart"||path==="/api/dictionary/lookup")){
      try{payload=window.LexiFlowExampleHydration?.processPayload?.(path,payload)||payload;}catch{}
    }
    if(!response.ok){
'''
if "LexiFlowExampleHydration?.processPayload?.(path,payload)" not in app:
    if app.count(old)!=1:
        raise SystemExit(f"app api payload anchor count was {app.count(old)}")
    app=app.replace(old,new,1)
app_path.write_text(app,encoding="utf-8")

# 3) Lock the explicit bridge architecture in runtime cleanup checks.
check_path=Path("scripts/check-runtime-cleanup-v3.js")
check=check_path.read_text(encoding="utf-8")
read_anchor='''const sourceContext=fs.readFileSync(path.join(root,"public","source-context-v3.js"),"utf8");'''
if 'const exampleHydration=fs.readFileSync(path.join(root,"public","example-hydration.js"),"utf8");' not in check:
    if check.count(read_anchor)!=1:
        raise SystemExit("runtime cleanup read anchor missing")
    check=check.replace(read_anchor,read_anchor+'\nconst exampleHydration=fs.readFileSync(path.join(root,"public","example-hydration.js"),"utf8");',1)
anchor='''assert(!product.includes('/api/learning-data'),"product UX must not issue learning-data reads for presentation decoration");'''
addition='''
assert(!exampleHydration.includes("window.fetch =")&&!exampleHydration.includes("window.fetch="),"example hydration must not rewrite global fetch");
assert(exampleHydration.includes("LexiFlowExampleHydration=Object.freeze({processPayload})"),"example hydration must expose a narrow explicit payload bridge");
assert(exampleHydration.includes("void hydrateResult(payload.result)")&&exampleHydration.includes("void hydratePronunciation(payload.result)"),"example hydration bridge must preserve asynchronous example and pronunciation enrichment");
assert(app.includes("LexiFlowExampleHydration?.processPayload?.(path,payload)"),"app dictionary API must explicitly hand successful lookup payloads to Example Hydration");'''
if "example hydration must not rewrite global fetch" not in check:
    if check.count(anchor)!=1:
        raise SystemExit("runtime cleanup example-hydration assertion anchor missing")
    check=check.replace(anchor,anchor+addition,1)
check_path.write_text(check,encoding="utf-8")

# Final static invariants.
hydration=hydration_path.read_text(encoding="utf-8")
app=app_path.read_text(encoding="utf-8")
assert "window.fetch =" not in hydration and "window.fetch=" not in hydration
assert "LexiFlowExampleHydration=Object.freeze({processPayload})" in hydration
assert "LexiFlowExampleHydration?.processPayload?.(path,payload)" in app
