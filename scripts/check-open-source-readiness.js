"use strict";

const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const pkg=JSON.parse(read("package.json"));

assert(pkg.license==="Apache-2.0","package metadata must advertise Apache-2.0");
for(const file of ["LICENSE","NOTICE","PRIVACY.md","CODE_SIGNING_POLICY.md","CONTRIBUTING.md","SECURITY.md","THIRD_PARTY_NOTICES.md"]){
  assert(fs.existsSync(path.join(root,file)),`${file} must ship with the open-source project`);
}
assert(read("LICENSE").includes("Apache License")&&read("LICENSE").includes("Version 2.0"),"LICENSE must contain Apache License 2.0");
assert(read("NOTICE").includes("Copyright 2026 lineana-lyu"),"NOTICE must identify the LexiFlow copyright owner");
assert(read("PRIVACY.md").includes("Codex-assisted text and image features")&&read("PRIVACY.md").includes("Kokoro model download"),"privacy policy must disclose optional external AI and model-download behavior");
const signingPolicy=read("CODE_SIGNING_POLICY.md");
assert(signingPolicy.includes("Free code signing provided by")&&/certificate\s+by \[SignPath Foundation\]/.test(signingPolicy),"SignPath attribution must remain in the code signing policy");
assert(read("README.md").includes("CODE_SIGNING_POLICY.md")&&read("README.md").includes("PRIVACY.md"),"README must link the signing and privacy policies");
const packaged=new Set(pkg.build?.files||[]);
for(const file of ["LICENSE","NOTICE","PRIVACY.md","CODE_SIGNING_POLICY.md","THIRD_PARTY_NOTICES.md"]){
  assert(packaged.has(file),`${file} must be included in Windows packages`);
}
console.log("Open-source release readiness checks passed.");
