const fs=require('fs'),path=require('path'),sharp=require('sharp');
const destination=path.join(__dirname,'calculators-before-after.html');
(async()=>{
const source=JSON.parse(fs.readFileSync(path.join(__dirname,'captured.json'),'utf8'));const data=[];const assets={};const lookup=new Map();
const descriptions=JSON.parse(fs.readFileSync(path.join(__dirname,'proposals.json'),'utf8'));
for(const record of source){const {beforeText,afterText,before,after,fullBefore,fullAfter,focus,...r}=record;
const description=descriptions.find(x=>x.id===record.id);r.before=description.before;r.after=description.after;
for(const [key,file] of [['beforeAsset',before],['afterAsset',after],['fullBeforeAsset',fullBefore],['fullAfterAsset',fullAfter]]){
 if(!lookup.has(file)){const id='a'+lookup.size;lookup.set(file,id);const bytes=file.includes('-full.')?await sharp(file).resize({width:760,withoutEnlargement:true}).webp({quality:46}).toBuffer():fs.readFileSync(file);assets[id]='data:image/webp;base64,'+bytes.toString('base64');}
 r[key]=lookup.get(file);
}data.push(r);}
const html=fs.readFileSync(path.join(__dirname,'comparison.template.html'),'utf8').replace('__RECORDS__',JSON.stringify(data)).replace('__ASSETS__',JSON.stringify(assets));
if(Buffer.byteLength(html)>1000000)throw Error('Fragment too big '+Buffer.byteLength(html));
fs.writeFileSync(destination,html);fs.writeFileSync(path.join(__dirname,'manifest.json'),JSON.stringify({entries:data.length,calculators:new Set(data.map(x=>x.slug)).size,proposals:data.filter(x=>x.patch).length,assets:Object.keys(assets).length,bytes:Buffer.byteLength(html)},null,2));console.log(fs.readFileSync(path.join(__dirname,'manifest.json'),'utf8'));
})().catch(e=>{console.error(e);process.exit(1)});
