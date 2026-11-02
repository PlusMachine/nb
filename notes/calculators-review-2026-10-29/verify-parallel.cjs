const fs=require('fs'),path=require('path'),{pathToFileURL}=require('url');
const {chromium}=require('playwright');
const dir='/mnt/c/Users/artyo/.codex/visualizations/2026/10/29/01a18909-144b-7212-b6be-c8cf1ac5bdc7';
// Coverage: simultaneous panels, all 54 step explanations/highlights, zoom cycle,
// working calculator interactions, next-calculator navigation, narrow layouts.
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1080,height:1300},locale:'ru-RU'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.join(dir,'parallel-preview.html')).href);
 const f=page.frameLocator('iframe');await f.locator('#nb-review-picker').waitFor();
 const options=await f.locator('#nb-review-picker option').evaluateAll(es=>es.map(e=>({id:e.value,title:e.textContent})));
 if(options.length!==18)throw Error('Expected 18');
 let steps=0;
 for(const c of options){
  await f.locator('#nb-review-picker').selectOption(c.id);
  if(await f.locator('#nb-review-after h2').textContent()!==c.title)throw Error('Title mismatch');
  if(!await f.locator('#nb-review-before').isVisible()||!await f.locator('#nb-review-after').isVisible())throw Error('Both must be visible');
  const a=await f.locator('.compare-side').nth(0).boundingBox(),b=await f.locator('.compare-side').nth(1).boundingBox();
  if(b.x<a.x+a.width-1||Math.abs(a.y-b.y)>1)throw Error('Not side by side '+c.id);
  for(let i=0;i<3;i++){
   await f.locator('[data-review-step="'+i+'"]').click();
   if(await f.locator('[data-review-step="'+i+'"]').getAttribute('aria-pressed')!=='true')throw Error('Wrong step');
   const t=await f.locator('#nb-review-explanation').innerText();
   if(!t.includes('Сейчас')||!t.includes('Предлагаю')||!t.includes('Зачем'))throw Error('Missing explanation');
   if(await f.locator('.review-highlight').count()!==1)throw Error('Missing focus '+c.id);
   steps++;
  }
 }
 await f.locator('#nb-review-picker').selectOption('abv-attenuation');
 await page.screenshot({path:path.join(dir,'parallel-abv.png'),fullPage:true});
 await f.locator('[data-review-step="1"]').click();
 await page.screenshot({path:path.join(dir,'parallel-abv-result.png'),fullPage:true});
 await f.locator('#nb-review-zoom').click();
 if(await f.locator('#nb-review-zoom').textContent()!=='Увеличить снимок')throw Error('Zoom reset');
 await f.locator('#nb-review-picker').selectOption('water-ph');
 await f.locator('[data-review-step="2"]').click();
 await page.screenshot({path:path.join(dir,'parallel-water.png'),fullPage:true});
 await f.locator('#nb-review-picker').selectOption('bottling');
 await f.getByRole('button',{name:'0,33 л',exact:true}).click();
 if(!(await f.locator('#nb-live-result').innerText()).includes('60'))throw Error('Live bottling');
 await f.locator('[data-review-step="2"]').click();await f.locator('#nb-review-next').click();
 if(await f.locator('#nb-review-picker').inputValue()==='bottling')throw Error('Next calculator');
 for(const width of [390,320]){
  await page.setViewportSize({width,height:1200});
  for(const c of options){
   await f.locator('#nb-review-picker').selectOption(c.id);
   const widths=await f.locator('#nb-calculator-review').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));
   if(widths.scroll>widths.client+2)throw Error('Mobile overflow '+c.id+' '+width+' '+JSON.stringify(widths));
  }
 }
 await f.locator('#nb-review-picker').selectOption('abv-attenuation');
 await page.screenshot({path:path.join(dir,'parallel-mobile.png'),fullPage:true});
 if(errors.length)throw Error(errors.join('; '));
 fs.writeFileSync(path.join(dir,'parallel-verification.json'),JSON.stringify({calculators:options.length,explanationSteps:steps,checks:['both screens side by side','step descriptions and highlighting','screenshot zoom','live bottling','next calculator','18 mobile views at 390 and 320 without overflow'],pageErrors:errors},null,2));
 console.log('PASS: '+options.length+' calculators, '+steps+' explanation steps, 36 mobile views');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
