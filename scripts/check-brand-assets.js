"use strict";

const fs=require("fs");
const path=require("path");
const zlib=require("zlib");

function assert(condition,message){if(!condition)throw new Error(message);}

function paeth(a,b,c){
  const p=a+b-c;
  const pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
  return pa<=pb&&pa<=pc?a:pb<=pc?b:c;
}

function validatePng(file){
  const data=fs.readFileSync(file);
  assert(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),"App icon must be a real PNG file");
  let offset=8,width=0,height=0,bitDepth=0,colorType=-1;
  const idat=[];
  let hasEnd=false;
  while(offset+12<=data.length){
    const length=data.readUInt32BE(offset);
    const type=data.toString("ascii",offset+4,offset+8);
    const start=offset+8,end=start+length;
    assert(end+4<=data.length,`PNG chunk ${type} is truncated`);
    if(type==="IHDR"){
      width=data.readUInt32BE(start);height=data.readUInt32BE(start+4);
      bitDepth=data[start+8];colorType=data[start+9];
    }else if(type==="IDAT")idat.push(data.subarray(start,end));
    else if(type==="IEND"){hasEnd=true;break;}
    offset=end+4;
  }
  assert(hasEnd&&idat.length,"App icon PNG must contain image data and a valid end marker");
  assert(width===height&&width>=256,"App icon PNG must be square and at least 256px");
  assert(bitDepth===8&&colorType===6,"App icon PNG must use 8-bit RGBA pixels");

  const bytesPerPixel=4;
  const stride=width*bytesPerPixel;
  const raw=zlib.inflateSync(Buffer.concat(idat));
  assert(raw.length===height*(stride+1),"App icon PNG scanline data is incomplete");
  const pixels=Buffer.alloc(height*stride);
  let sourceOffset=0;
  for(let y=0;y<height;y++){
    const filter=raw[sourceOffset++];
    const rowOffset=y*stride;
    for(let x=0;x<stride;x++){
      const value=raw[sourceOffset++];
      const left=x>=bytesPerPixel?pixels[rowOffset+x-bytesPerPixel]:0;
      const above=y?pixels[rowOffset-stride+x]:0;
      const upperLeft=y&&x>=bytesPerPixel?pixels[rowOffset-stride+x-bytesPerPixel]:0;
      const decoded=filter===0?value
        :filter===1?(value+left)&255
        :filter===2?(value+above)&255
        :filter===3?(value+Math.floor((left+above)/2))&255
        :filter===4?(value+paeth(left,above,upperLeft))&255
        :NaN;
      assert(Number.isFinite(decoded),`Unsupported PNG filter ${filter}`);
      pixels[rowOffset+x]=decoded;
    }
  }
  const alphaAt=(x,y)=>pixels[y*stride+x*bytesPerPixel+3];
  for(const [x,y] of [[0,0],[width-1,0],[0,height-1],[width-1,height-1]]){
    assert(alphaAt(x,y)<=8,"App icon must keep transparent outer corners");
  }
  assert(alphaAt(Math.floor(width/2),Math.floor(height/2))>=240,"App icon center must remain visible");
}

function validateIco(file){
  const data=fs.readFileSync(file);
  assert(data.length>=6,"Windows icon is truncated");
  assert(data.readUInt16LE(0)===0&&data.readUInt16LE(2)===1,"Windows icon must have a valid ICO header");
  const count=data.readUInt16LE(4);
  assert(count>=6,"Windows icon must contain multiple resolutions");
  const sizes=[];
  for(let index=0;index<count;index++){
    const entry=6+index*16;
    assert(entry+16<=data.length,"Windows icon directory is truncated");
    const width=data[entry]||256;
    const height=data[entry+1]||256;
    const length=data.readUInt32LE(entry+8);
    const offset=data.readUInt32LE(entry+12);
    assert(width===height,"Every Windows icon frame must be square");
    assert(length>0&&offset+length<=data.length,"Windows icon frame points outside the file");
    const png=data.subarray(offset,offset+8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const dib=data.readUInt32LE(offset)===40;
    assert(png||dib,"Every Windows icon frame must contain PNG or DIB image data");
    sizes.push(width);
  }
  for(const required of [16,32,48,64,128,256])assert(sizes.includes(required),`Windows icon is missing ${required}px frame`);
}

const root=path.join(__dirname,"..");
validatePng(path.join(root,"public","icon.png"));
validateIco(path.join(root,"build","icon.ico"));
console.log("Brand asset checks passed.");
