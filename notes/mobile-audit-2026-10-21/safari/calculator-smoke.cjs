const old=JSON.parse(await fs.readFile(out+'/../retest/broad-scan.json','utf8'));const routes=[...new Set(old.filter(r=>r.route.startsWith('/calculators/')).map(r=>r.route))];const checks=[];
for(const profile of['iPhone 13','iPad Pro 11']){
 for(const route of routes){
 const c=await browser.newContext({...pw.devices[profile],locale:'ru-RU'});await c.addCookies([{name:'nb_cookie_consent',value:'1:necessary',url:base},{name:'nb_dev_guest',value:'1',url:base}]);const p=await c.newPage();p.setDefaultTimeout(10000);let errors=[];p.on('pageerror',e=>errors.push(e.message));
  try{
   errors=[];const response=await p.goto(base+route,{waitUntil:'domcontentloaded',timeout:90000});if(response.status()!==200)throw Error('HTTP '+response.status());await p.waitForFunction(()=>!window.history.pushState.toString().includes('[native code]'));await p.waitForTimeout(300);
   const fields=p.locator('main input:visible:not([type=checkbox]):not([type=radio])');let modifiedFields=0;
   for(let i=0;i<Math.min(await fields.count(),2);i++){const e=fields.nth(i);if(await e.isDisabled())continue;const original=await e.inputValue();if(!/^\d+(\.\d+)?$/.test(original))continue;await e.fill('0');await e.press('Tab');await e.fill(original);await e.press('Tab');modifiedFields++;}
   let selects=0;for(const e of await p.locator('main select:visible').all()){const values=await e.locator('option:not([disabled])').evaluateAll(es=>es.map(e=>e.value));if(values.length>1){const original=await e.inputValue();await e.selectOption(values[1]);await e.selectOption(original);selects++;}}
   const tabs=p.getByRole('tab');const count=await tabs.count();for(let i=0;i<count;i++)await tabs.nth(i).tap();if(count)await tabs.first().tap();
   if(errors.length)throw Error(errors.join('; '));const text=await p.locator('main').last().innerText();if(/\bNaN\b|\bInfinity\b/.test(text))throw Error('Invalid numeric result');const m=await metrics(p);if(m.scroll>m.client+1)throw Error('Document overflow');
   const result=p.locator('#calculator-result');if(await result.count())await result.scrollIntoViewIfNeeded();await shot('calc-'+route.split('/').pop()+'-'+profile.replaceAll(' ','-'),p);checks.push({route,profile,status:'passed',modifiedFields,selects,tabs:count});console.log('PASS CALC',profile,route);
  }catch(e){checks.push({route,profile,status:'failed',error:e.message});console.log('FAIL CALC',profile,route,e.message);}
  await fs.writeFile(out+'/calculator-smoke.json',JSON.stringify(checks,null,2));
  await c.close();
 }
}
