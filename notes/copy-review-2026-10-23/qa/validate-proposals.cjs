const fs=require('fs'),ts=require('typescript');
const doc=JSON.parse(fs.readFileSync('notes/copy-review-2026-10-23/proposals.json','utf8'));const cache=new Map;const failures=[];
for(const r of doc.proposals){
 if(!r.before||!r.after||r.before===r.after)failures.push(r.id+': empty or identical');
 if(r.kind==='Описание пива'&&r.after.length>220)failures.push(r.id+': long tagline');
 if(r.decision!=='pending')failures.push(r.id+': preselected decision');
 for(const ref of r.sources){
  if(!cache.has(ref.file)){
   const sf=ts.createSourceFile(ref.file,fs.readFileSync(ref.file,'utf8'),ts.ScriptTarget.Latest,true);const strings=[];
   function visit(n){if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||ts.isJsxText(n)||ts.isTemplateHead(n)||ts.isTemplateMiddle(n)||ts.isTemplateTail(n))strings.push({line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1,text:n.text.replace(/\s+/g,' ').trim()});ts.forEachChild(n,visit)}visit(sf);cache.set(ref.file,strings);
  }
  if(!cache.get(ref.file).some(s=>s.line===ref.line&&s.text===r.before))failures.push(r.id+': stale source '+ref.file+':'+ref.line);
 }
}
const result={proposals:doc.proposals.length,sourceFiles:cache.size,sourceReferences:doc.proposals.reduce((a,r)=>a+r.sources.length,0),failures};
fs.writeFileSync('notes/copy-review-2026-10-23/qa/source-validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(failures.length)process.exit(1);
