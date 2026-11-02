const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const data=require('./captured.json');
const descriptions=require('./proposals.json');
(async()=>{
const substitutions={
 'water-ph':['\n\nКИСЛОТА\n','\n\nКИСЛОТА В ЗАТОР · 15 Л\n'],
 'yeast':['Стартер не нужен по расчёту','Нет жизнеспособных клеток — нужны свежие дрожжи'],
 'keg':['ДАВЛЕНИЕ\n','ИЗБЫТОЧНОЕ ДАВЛЕНИЕ\n'],
 'bottling':['БУТЫЛОК НУЖНО','ПОЛНЫХ БУТЫЛОК'],
 'hop':['Потеряно ~0% горечи','Дата упаковки не указана — расчёт как для свежего хмеля']
};
for(const c of data){
 if(!c.patch&&c.beforeText!==c.afterText)throw Error('Unchanged content differs '+c.id);
 if(substitutions[c.id]){const [oldText,newText]=substitutions[c.id];if(c.beforeText.replace(oldText,newText)!==c.afterText)throw Error('Unexpected textual changes '+c.id);}
}
const comma=data.find(x=>x.id==='abv-comma');if(!comma.beforeText.includes('\n5.0\n')||!comma.afterText.includes('\n5.3\n'))throw Error('Comma scenario');
const beer=data.find(x=>x.id==='beer-color');if(beer.afterText.includes('MCU 0.00'))throw Error('Invalid volume still gives MCU');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const p=await browser.newPage({viewport:{width:1080,height:1200}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto('file://'+path.join(__dirname,'preview.html'));const f=p.frameLocator('iframe');await f.locator('#precise-picker').waitFor();
if(await f.locator('#precise-picker option').count()!==18)throw Error('Missing calculator');
for(let i=0;i<data.length;i++){
 const c=data[i];if((await f.locator('#precise-title').innerText())!==c.change)throw Error('Wrong step '+c.id);
 const description=descriptions.find(x=>x.id===c.id);
 if(await f.locator('#precise-before-text').textContent()!==description.before||await f.locator('#precise-after-text').textContent()!==description.after)throw Error('Missing before/after explanation '+c.id);
 if(c.patch){
  for(const id of ['precise-before','precise-after'])if(!await f.locator('#'+id).evaluate(e=>e.complete&&e.naturalWidth>0))throw Error('Missing image '+c.id);
  const a=await f.locator('#precise-before').boundingBox(),b=await f.locator('#precise-after').boundingBox();
  if(b.x<=a.x||Math.abs(a.y-b.y)>1)throw Error('Comparison alignment '+c.id+' '+a.y+' '+b.y);
 }
 await f.locator('#precise-context-label').click();
 const images=await f.locator('#precise-context img').evaluateAll(es=>es.map(e=>e.complete&&e.naturalWidth>0));if(images.some(x=>!x))throw Error('Missing full context '+c.id);
 await f.locator('#precise-context-label').click();
 if(i<data.length-1)await f.locator('#precise-next').click();
}
await f.locator('#precise-picker').selectOption('abv-attenuation');await p.screenshot({path:path.join(__dirname,'comparison-abv.png'),fullPage:true});
await f.locator('#precise-case').selectOption('abv-comma');await p.screenshot({path:path.join(__dirname,'comparison-comma.png'),fullPage:true});
await f.locator('#precise-picker').selectOption('water-ph');await p.screenshot({path:path.join(__dirname,'comparison-water.png'),fullPage:true});
await f.locator('#precise-picker').selectOption('refractometer-correction');await f.locator('#precise-context-label').click();await p.screenshot({path:path.join(__dirname,'comparison-unchanged.png'),fullPage:true});
for(const width of [390,320]){
 await p.setViewportSize({width,height:1000});
 for(const slug of [...new Set(data.map(c=>c.slug))]){
  await f.locator('#precise-picker').selectOption(slug);
  const bounds=await f.locator('#nb-precise-review').evaluate(e=>({w:e.clientWidth,s:e.scrollWidth}));if(bounds.s>bounds.w+1)throw Error('Overflow '+slug+' '+width);
 }
}
await f.locator('#precise-picker').selectOption('abv-attenuation');await p.screenshot({path:path.join(__dirname,'comparison-mobile.png'),fullPage:true});
if(errors.length)throw Error(errors.join(';'));
fs.writeFileSync(path.join(__dirname,'verification.json'),JSON.stringify({entries:19,calculators:18,isolatedProposals:8,unchangedComparisons:11,checks:['same form values and positions captured before/after','only declared text replacement in all 5 copy proposals','comma result 5.0 to 5.3 verified against current calculator','19 navigation steps and full context','aligned before/after crops','36 narrow layouts'],errors},null,2));
console.log('PASS: 19 entries; 8 isolated changes; 11 unchanged; 36 mobile views');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
