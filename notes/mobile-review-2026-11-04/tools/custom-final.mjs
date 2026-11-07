import fs from 'node:fs/promises';
import net from 'node:net';
import { chromium } from 'playwright';

const base='http://127.0.0.1:3105';
const id='aa33e3d6-610f-4f53-9a32-83e12ddb32b6';
const root=new URL('../',import.meta.url).pathname.replace(/\/$/,'');
let browser;
const result={};
try {
  for(let attempt=0;attempt<30;attempt++) {
    const ready=await new Promise(resolve=>{
      const socket=net.connect(3105,'127.0.0.1');
      socket.once('connect',()=>{socket.destroy();resolve(true);});
      socket.once('error',()=>resolve(false));
    });
    if(ready) break;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  const sessions=JSON.parse(await fs.readFile('/tmp/nb-mobile-review-sessions.json','utf8'));
  const cookie=sessions.find(s=>s.email==='qa.mobile.20261021@localhost').cookie;
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:320,height:740},isMobile:true,hasTouch:true,locale:'ru-RU'});
  await context.addCookies([{...cookie,url:base},{name:'nb_cookie_consent',value:'1:necessary',url:base},{name:'nb_age_ok',value:'1',url:base}]);
  const page=await context.newPage();
  const response=await page.goto(`${base}/catalog/custom/${id}/edit`,{waitUntil:'domcontentloaded',timeout:90000});
  const save=page.getByRole('button',{name:'Сохранить изменения',exact:true});
  await save.waitFor({timeout:30000});
  await page.addStyleTag({content:'nextjs-portal {display:none!important}'});
  Object.assign(result,{status:response.status(),...await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))});
  await page.screenshot({path:`${root}/screenshots/verified-custom-edit-320.png`,fullPage:true,scale:'css',animations:'disabled'});
  await save.click();
  await page.waitForURL(u=>u.pathname===`/catalog/custom/${id}`,{waitUntil:'domcontentloaded',timeout:45000});
  result.saved=true;
  result.url=page.url();
} catch(error) {
  result.error=error.message;
} finally {
  await browser?.close();
  await fs.writeFile(`${root}/custom-edit-fixed.json`,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
}
