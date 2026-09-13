const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const index=fs.readFileSync(path.join(root,"public","index.html"),"utf8");
const product=fs.readFileSync(path.join(root,"public","product-ux.js"),"utf8");
const productCss=fs.readFileSync(path.join(root,"public","product-ux.css"),"utf8");
const runtime=fs.readFileSync(path.join(root,"public","runtime-fixes.js"),"utf8");
const sourceContext=fs.readFileSync(path.join(root,"public","source-context-v3.js"),"utf8");
const pkg=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));

const retired=[
  "public/feedback-fixes.js",
  "public/final-ux.js",
  "public/final-ux.css",
  "public/learning-flow-fixes.js",
  "public/learning-flow-fixes.css",
  "public/product-ux-v2.js",
  "public/product-ux-v2.css",
  "public/README_ICON_FIX.txt",
  "public/icon-test.txt",
  "public/icon-v2.png",
  "public/icon-v3.b64.txt",
  "scripts/apply-core-runtime-v2.py",
  "scripts/check-runtime-authority-v2.js",
  "scripts/check-study-entry-v3.js",
];

for(const file of retired){
  assert(!fs.existsSync(path.join(root,file)),`retired runtime/debug artifact must stay deleted: ${file}`);
}

for(const name of [
  "feedback-fixes.js",
  "final-ux.js",
  "final-ux.css",
  "learning-flow-fixes.js",
  "learning-flow-fixes.css",
  "product-ux-v2.js",
  "product-ux-v2.css",
  "icon-v2.png",
  "icon-v3.b64.txt",
]){
  assert(!index.includes(name),`${name} must not be referenced by public/index.html`);
}

assert(index.includes('<link rel="icon" type="image/png" href="./icon.png" />'),"index.html must use the approved icon.png asset");
assert(fs.existsSync(path.join(root,"public","icon.png")),"public/icon.png must exist");
assert(fs.existsSync(path.join(root,"build","icon.ico")),"build/icon.ico must exist for Windows packaging");
assert(product.includes("applyAppIcon"),"canonical product UX runtime must own app icon decoration");
assert(productCss.includes(".brand .logo.lexi-brand-icon"),"canonical product UX CSS must own app icon styling");
assert(!product.includes("window.fetch ="),"product UX must not rewrite global fetch; Learning Data Gateway V3 owns learning-data transport observation");
assert(!product.includes("cloneJsonResponse"),"new-user defaults must not be implemented by product-level response rewriting");

assert(runtime.includes("transport-only"),"runtime compatibility must stay transport-only");
assert(!runtime.includes("MutationObserver"),"runtime compatibility must not decorate stage DOM through a global observer");
assert(!runtime.includes("visual-image-canvas")&&!runtime.includes("scene-panel.is-loading"),"legacy Visualize DOM selectors must stay out of runtime compatibility");
assert(!runtime.includes("background-generation-note"),"V3 Visualize renderer must be the only owner of image-generation progress UI");

assert(sourceContext.includes("function syncFromGateway()"),"Source Context V3 must reuse the canonical learning-data snapshot");
assert(sourceContext.includes("requestAnimationFrame(()=>{scheduled=false;syncFromGateway();decorate();})"),"Source Context DOM mutations must decorate from the gateway snapshot without a GET");
assert(!sourceContext.includes("requestAnimationFrame(async()=>{scheduled=false;await refresh();decorate();})"),"Source Context must not refetch learning data on every DOM mutation");
assert(sourceContext.includes('window.addEventListener("lexiflow:today-plan-data",schedule)'),"Source Context must resync after authoritative Today data changes");

assert(!(pkg.scripts?.check||"").includes("public/feedback-fixes.js"),"package check must not retain the removed feedback shim");
assert(!(pkg.scripts?.check||"").includes("public/product-ux-v2.js"),"package check must not retain Product UX V2");
assert(!(pkg.scripts?.check||"").includes("check-runtime-authority-v2.js"),"package checks must not retain the obsolete V2 authority check");
assert(!(pkg.scripts?.check||"").includes("check-study-entry-v3.js"),"package checks must not retain the retired Study Entry check");

console.log("Runtime cleanup V3 checks passed.");