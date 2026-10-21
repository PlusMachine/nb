const source=JSON.parse(await fs.readFile(out+'/../retest/broad-scan.json','utf8'));
const routes=[...new Set([...source.map(r=>r.route),'/app/recipes/new','/app/recipes/ae29d940-0b2a-4d2e-9995-c112b79e5955/edit','/catalog/new'])];
global.broadResults=JSON.parse(await fs.readFile(out+'/broad-scan.json','utf8')).filter(r=>r.status===200&&!r.smallTextFields?.length);global.broadErrors=JSON.parse(await fs.readFile(out+'/broad-errors.json','utf8'));global.broadRetries=JSON.parse(await fs.readFile(out+'/broad-retries.json','utf8'));global.stopBroad=false;
const done=new Set(broadResults.map(r=>r.route+'|'+r.profile));
const groups=[{device:'iPhone 13',modes:[['iPhone 13',390,664],['iPhone 13 landscape',750,342]]},{device:'iPad Pro 11',modes:[['iPad Pro 11',834,1194],['iPad Mini landscape',1024,768]]}];
async function resetGroup(g){await g.c?.close().catch(()=>{});g.c=await browser.newContext({...pw.devices[g.device],locale:'ru-RU'});g.p=await g.c.newPage();g.errors=[];g.p.on('pageerror',e=>{const r={route:g.p.url(),profile:g.profile,message:e.message};g.errors.push(r);broadErrors.push(r);});}for(const g of groups)await resetGroup(g);let activeRoutes=0;
for(const route of routes){
 if(stopBroad)break;if(groups.every(g=>g.modes.every(([name])=>done.has(route+'|'+name))))continue;
 if(++activeRoutes%6===0)for(const g of groups)await resetGroup(g);for(const g of groups)await g.p.goto('about:blank');
 const cookies=[{name:'nb_cookie_consent',value:'1:necessary',url:base},{name:'nb_age_ok',value:'1',url:base}];if(route.startsWith('/admin'))cookies.push({name:'nb_dev_account',value:'qa.admin@localhost',url:base});else if(route.includes('a42dbf9d'))cookies.push({name:'nb_dev_account',value:'qa.deep.main.20261020@localhost',url:base});else if(!/^\/(app|profile|settings)(\/|$)/.test(route))cookies.push({name:'nb_dev_guest',value:'1',url:base});
 try{const response=await fetch(base+route,{headers:{cookie:cookies.map(c=>c.name+'='+c.value).join('; ')},signal:AbortSignal.timeout(90000)});await response.text();await new Promise(r=>setTimeout(r,300));}catch(e){console.log('PREWARM',route,e.message);}
 for(const g of groups){
  if(stopBroad)break;if(g.modes.every(([name])=>done.has(route+'|'+name)))continue;await g.c.clearCookies();await g.c.addCookies(cookies);let ok=false;
  for(let attempt=1;attempt<=3&&!ok;attempt++){
   try{g.errors=[];g.profile=g.device;const response=await g.p.goto(base+route,{waitUntil:'domcontentloaded',timeout:90000});if(response.status()!==200)throw Error('HTTP '+response.status());await g.p.locator(route.startsWith('/app/recipes/')?'[data-testid=recipe-toolbar]':'h1').first().waitFor({timeout:20000});await g.p.waitForLoadState('load',{timeout:30000});await g.p.evaluate(()=>document.fonts.ready);await g.p.waitForTimeout(350);if(g.errors.length)throw Error(g.errors.map(e=>e.message).join(';'));
    const rows=[];for(const[name,width,height]of g.modes){if(done.has(route+'|'+name))continue;g.profile=name;await g.p.setViewportSize({width,height});await g.p.waitForTimeout(150);const m=await metrics(g.p);const fields=await g.p.locator('input:visible:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]):not([type=file]):not([type=color]),select:visible,textarea:visible').evaluateAll(es=>es.map(e=>({tag:e.tagName,type:e.type,class:e.className,font:getComputedStyle(e).fontSize})).filter(e=>parseFloat(e.font)<16));const key='scan'+route.replace(/[^a-z0-9]+/gi,'_')+'-'+name.replaceAll(' ','-');await shot(key,g.p);rows.push({route,profile:name,url:g.p.url(),status:response.status(),errors:[...g.errors],...m,smallTextFields:fields,screenshot:'screens/'+key+'.png'});}
    broadResults.push(...rows);for(const row of rows)done.add(row.route+'|'+row.profile);ok=true;
   }catch(e){broadRetries.push({route,profile:g.device,attempt,error:e.message});console.log('RETRY',route,g.device,attempt,e.message.slice(0,100));await new Promise(r=>setTimeout(r,3000));}
  }
  if(!ok)for(const[name]of g.modes)if(!done.has(route+'|'+name))broadResults.push({route,profile:name,status:'failed'});
  await fs.writeFile(out+'/broad-scan.json',JSON.stringify(broadResults,null,2));await fs.writeFile(out+'/broad-errors.json',JSON.stringify(broadErrors,null,2));await fs.writeFile(out+'/broad-retries.json',JSON.stringify(broadRetries,null,2));
 }
 console.log('SCAN DONE',route,broadResults.length);
}
for(const g of groups)await g.c.close();console.log('BROAD DONE',broadResults.length);
