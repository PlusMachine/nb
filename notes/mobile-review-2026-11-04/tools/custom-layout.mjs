import fs from 'node:fs/promises';
import net from 'node:net';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const root=new URL('../',import.meta.url).pathname.replace(/\/$/,'');
const base='http://127.0.0.1:3105';
const results=[];
const sessions=JSON.parse(await fs.readFile('/tmp/nb-mobile-review-sessions.json','utf8'));
const cookie=sessions.find(x=>x.email==='qa.mobile.20261021@localhost').cookie;
for(let i=0;i<30;i++) {
  const ready=await new Promise(resolve=>{const s=net.connect(3105,'127.0.0.1');s.once('connect',()=>{s.destroy();resolve(true);});s.once('error',()=>resolve(false));});
  if(ready)break;
  await new Promise(resolve=>setTimeout(resolve,1000));
}
const browser=await chromium.launch({headless:true});
try {
  const context=await browser.newContext({viewport:{width:320,height:740},isMobile:true,hasTouch:true,locale:'ru-RU'});
  await context.addCookies([{...cookie,url:base},{name:'nb_cookie_consent',value:'1:necessary',url:base},{name:'nb_age_ok',value:'1',url:base}]);
  const page=await context.newPage();
  await page.goto(`${base}/catalog/custom/aa33e3d6-610f-4f53-9a32-83e12ddb32b6/edit`,{waitUntil:'domcontentloaded',timeout:90000});
  await page.getByRole('button',{name:'Сохранить изменения',exact:true}).waitFor({timeout:30000});
  await page.addStyleTag({content:'nextjs-portal {display:none!important}'});
  for(const width of [320,360,390,768,1280]) {
    await page.setViewportSize({width,height:width>=768?1000:740});
    for(let kind=0;kind<6;kind++) {
      await page.locator('main section').first().locator(':scope > div.grid').getByRole('button').nth(kind).click();
      const measured=await page.evaluate(()=>{
        const fields=[...document.querySelectorAll('main input,main select,main textarea')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0;});
        const bad=fields.flatMap(el=>{
          const r=el.getBoundingClientRect(),section=el.closest('section');if(!section)return[];
          const box=section.getBoundingClientRect(),style=getComputedStyle(section);
          const left=box.left+parseFloat(style.borderLeftWidth)+parseFloat(style.paddingLeft);
          const right=box.right-parseFloat(style.borderRightWidth)-parseFloat(style.paddingRight);
          return r.left<left-1||r.right>right+1?[{placeholder:el.getAttribute('placeholder'),left:r.left,right:r.right,sectionLeft:left,sectionRight:right}]:[];
        });
        const labels=[...document.querySelectorAll('main label > div')].filter(el=>el.clientWidth>0&&el.scrollWidth>el.clientWidth+1).map(el=>el.textContent);
        return {width:innerWidth,scroll:document.documentElement.scrollWidth,fields:fields.length,bad,labels};
      });
      assert.equal(measured.scroll,width,JSON.stringify(measured));
      assert.equal(measured.bad.length,0,JSON.stringify(measured));
      assert.equal(measured.labels.length,0,JSON.stringify(measured));
      results.push({kind,ok:true,...measured});
    }
    if(width===320||width===390)await page.screenshot({path:`${root}/screenshots/verified-custom-contained-${width}.png`,fullPage:true,scale:'css',animations:'disabled'});
  }
  await page.setViewportSize({width:320,height:740});
  await page.goto(base+'/catalog/new',{waitUntil:'domcontentloaded',timeout:60000});
  await page.getByRole('button',{name:'Сохранить ингредиент',exact:true}).waitFor();
  await page.addStyleTag({content:'nextjs-portal {display:none!important}'});
  await page.screenshot({path:`${root}/screenshots/verified-custom-create-320.png`,fullPage:true,scale:'css',animations:'disabled'});
  results.push({create:true,width:320,ok:await page.evaluate(()=>document.documentElement.scrollWidth===320)});
} catch(error) {results.push({ok:false,error:error.message});}
finally {
  await browser.close();
  await fs.writeFile(`${root}/custom-layout.json`,JSON.stringify(results,null,2)+'\n');
  console.log(JSON.stringify({checks:results.length,failed:results.filter(x=>!x.ok)}));
}
