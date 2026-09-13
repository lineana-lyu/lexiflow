const fs=require("fs");
const path=require("path");

const root=path.join(__dirname,"..");
const dir=path.join(root,"public");
const files=fs.readdirSync(dir).filter(name=>name.endsWith(".js")).sort();
let count=0;
for(const name of files){
  const source=fs.readFileSync(path.join(dir,name),"utf8");
  const lines=source.split(/\r?\n/);
  const hits=[];
  for(let i=0;i<lines.length;i++)if(lines[i].includes("/api/learning-data"))hits.push(i);
  if(!hits.length)continue;
  console.log(`\n=== ${name} (${hits.length}) ===`);
  for(const i of hits){
    count++;
    const from=Math.max(0,i-5),to=Math.min(lines.length-1,i+8);
    console.log(`--- line ${i+1} ---`);
    for(let j=from;j<=to;j++)console.log(`${String(j+1).padStart(5," ")}: ${lines[j]}`);
  }
}
console.log(`\nTOTAL_ACCESS_POINTS=${count}`);
