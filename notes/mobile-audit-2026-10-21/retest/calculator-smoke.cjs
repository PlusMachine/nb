const originalRows=JSON.parse(await fs.readFile(out+'/../scan.json','utf8'));const checks=[];const check=async(name,fn)=>{try{const details=await fn();checks.push({name,status:'passed',...details});console.log('PASS CALC',name);}catch(e){checks.push({name,status:'failed',error:e.message});console.log('FAIL CALC',name,e.message);}await fs.writeFile(out+'/calculator-smoke.json',JSON.stringify(checks,null,2));};
const slugs=[...new Set(originalRows.filter(r=>r.route?.startsWith('/calculators/')).map(r=>r.route))];
const c=await browser.newContext({viewport:{width:360,height:800},isMobile:true,hasTouch:true,locale:'ru-RU'});await c.addCookies([{name:'nb_cookie_consent',value:'1:necessary',url:base},{name:'nb_dev_guest',value:'1',url:base}]);const p=await c.newPage();p.setDefaultTimeout(6000);let localErrors=[];p.on('pageerror',e=>localErrors.push(e.message));
for(const [width,height] of [[360,800],[834,1112]])for(const route of slugs){await p.setViewportSize({width,height});localErrors=[];await check(width+'px Calculator input/select smoke '+route,async()=>{
 await p.goto(base+route,{waitUntil:'domcontentloaded',timeout:60000});await p.waitForFunction(()=>!window.history.pushState.toString().includes('[native code]'));await p.waitForTimeout(300);
 const fields=p.locator('main input:visible:not([type=checkbox]):not([type=radio])');
 let modified=0;
 for(let i=0;i<Math.min(await fields.count(),2);i++){const e=fields.nth(i);if(await e.isDisabled())continue;const original=await e.inputValue();if(!/^\d+(\.\d+)?$/.test(original))continue;await e.fill('0');await e.press('Tab');await e.fill(original);await e.press('Tab');modified++;}
 let selects=0;for(const e of await p.locator('main select:visible').all()){const values=await e.locator('option:not([disabled])').evaluateAll(es=>es.map(e=>e.value));if(values.length>1){let orig=await e.inputValue();await e.selectOption(values[1]);await e.selectOption(orig);selects++;}}
 const tabs=p.getByRole('tab');const n=await tabs.count();for(let i=0;i<n;i++)await tabs.nth(i).click();if(n)await tabs.first().click();
 if(localErrors.length)throw Error(localErrors.join(';'));
 const text=await p.locator('main').last().innerText();if(/\bNaN\b|\bInfinity\b/.test(text))throw Error('invalid output');
 const result=p.locator('#calculator-result');if(await result.count())await result.scrollIntoViewIfNeeded();await shot('calc-result-'+route.split('/').pop()+'-'+width,p);
 return {modifiedFields:modified,selects,tabs:n};
 });}
await c.close();
