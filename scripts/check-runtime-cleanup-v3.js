const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const index=fs.readFileSync(path.join(root,"public","index.html"),"utf8");
const pkg=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));

const retired=[
  "public/feedback-fixes.js",
  "public/final-ux.js",
  "public/final-ux.css",
  "public/README_ICON_FIX.txt",
  "public/icon-test.txt",
  "public/icon-v2.png",
  "public/icon-v3.b64.txt",
];

for(const file of retired){
  assert(!fs.existsSync(path.join(root,file)),`retired runtime/debug artifact must stay deleted: ${file}`);
}

for(const name of ["feedback-fixes.js","final-ux.js","final-ux.css","icon-v2.png","icon-v3.b64.txt"]){
  assert(!index.includes(name),`${name} must not be referenced by public/index.html`);
}

assert(index.includes('<link rel="icon" type="image/png" href="./icon.png" />'),"index.html must use the approved icon.png asset");
assert(fs.existsSync(path.join(root,"public","icon.png")),"public/icon.png must exist");
assert(fs.existsSync(path.join(root,"build","icon.ico")),"build/icon.ico must exist for Windows packaging");
assert(!(pkg.scripts?.check||"").includes("public/feedback-fixes.js"),"package check must not retain the removed feedback shim");

console.log("Runtime cleanup V3 checks passed.");
