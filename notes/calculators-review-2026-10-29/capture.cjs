const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const out = __dirname;
const base = 'http://127.0.0.1:3107';
const slugs = ['index','abv-attenuation','refractometer-correction','hydrometer-correction','dilution-boiloff','ibu','brewing-water-volume','mash-infusion','water-ph','yeast-starter','priming-sugar','keg-carbonation','bottling','speise-krausen','beer-color','brewhouse-efficiency','hop-freshness','unit-converter'];
(async()=>{
 await fs.mkdir(path.join(out,'before'),{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1280,height:1000},locale:'ru-RU',colorScheme:'light'});
 await context.addCookies([{name:'nb_cookie_consent',value:'1:necessary',url:base},{name:'nb_dev_guest',value:'1',url:base}]);
 const page=await context.newPage(); const records=[];
 page.on('pageerror',e=>console.log('PAGEERROR',e.message));
 for (const slug of slugs) {
   await page.goto(base+'/calculators'+(slug==='index'?'':'/'+slug),{waitUntil:'networkidle',timeout:120000});
   await page.waitForTimeout(250);
   const main=page.locator('main').last();
   const body=await main.innerText();
   await fs.writeFile(path.join(out,'before',slug+'.txt'),body);
   const bounds=await main.boundingBox();
   await page.screenshot({path:path.join(out,'before',slug+'.png'),fullPage:true});
   const fields=await main.locator('input,select').evaluateAll(es=>es.map(e=>({name:e.getAttribute('aria-label'),label:e.closest('label')?.innerText,value:e.value,type:e.type})));
   records.push({slug,title:await page.title(),bounds,fields});
   console.log('CAPTURED',slug,body.length);
 }
 await page.setViewportSize({width:390,height:844});
 for(const slug of ['ibu','water-ph','abv-attenuation','bottling']) {
   await page.goto(base+'/calculators/'+slug,{waitUntil:'networkidle',timeout:60000});
   await page.screenshot({path:path.join(out,'before',slug+'-mobile.png'),fullPage:true});
 }
 await fs.writeFile(path.join(out,'capture.json'),JSON.stringify(records,null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
