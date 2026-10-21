const prior=JSON.parse(await fs.readFile(out+'/../retest/broad-scan.json','utf8'));
const routes=[...new Set([...prior.map(r=>r.route),'/app/recipes/new','/app/recipes/ae29d940-0b2a-4d2e-9995-c112b79e5955/edit','/catalog/new'])];
const profiles=['iPhone 13','iPhone 13 landscape','iPad Pro 11','iPad Mini landscape'];global.stopBroad=false;global.broadResults=JSON.parse(await fs.readFile(out+'/broad-scan.json','utf8')).filter(r=>r.status===200&&r.route!=='/recipes');global.broadErrors=JSON.parse(await fs.readFile(out+'/broad-errors.json','utf8'));global.broadRetries=JSON.parse(await fs.readFile(out+'/broad-retries.json','utf8'));const done=new Set(broadResults.map(r=>r.route+'|'+r.profile));
for(const route of routes){
 if(stopBroad)break;
 if(profiles.every(name=>done.has(route+'|'+name)))continue;
 const cookies=[{name:'nb_cookie_consent',value:'1:necessary',url:base},{name:'nb_age_ok',value:'1',url:base}];
 if(route.startsWith('/admin'))cookies.push({name:'nb_dev_account',value:'qa.admin@localhost',url:base});else if(route.includes('a42dbf9d'))cookies.push({name:'nb_dev_account',value:'qa.deep.main.20261020@localhost',url:base});else if(!/^\/(app|profile|settings)(\/|$)/.test(route))cookies.push({name:'nb_dev_guest',value:'1',url:base});
 try{const response=await fetch(base+route,{headers:{cookie:cookies.map(c=>c.name+'='+c.value).join('; ')},signal:AbortSignal.timeout(90000)});await response.text();await new Promise(r=>setTimeout(r,300));}catch(e){console.log('PREWARM',route,e.message);}
 for(const name of profiles){
  if(stopBroad)break;
  if(done.has(route+'|'+name))continue;
  let ok=false;
  for(let attempt=1;attempt<=3&&!ok;attempt++){
   let c;
   try{
    c=await browser.newContext({...pw.devices[name],locale:'ru-RU'});await c.addCookies(cookies);const p=await c.newPage();const errors=[];p.on('pageerror',e=>{const error={route,profile:name,url:p.url(),message:e.message};errors.push(error);broadErrors.push(error);});
    const response=await p.goto(base+route,{waitUntil:'domcontentloaded',timeout:90000});if(response.status()!==200)throw Error('HTTP '+response.status());await p.locator('h1').first().waitFor({timeout:20000});await p.waitForLoadState('load',{timeout:30000});await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(500);if(errors.length)throw Error(errors.map(e=>e.message).join(';'));
    const m=await metrics(p);const fields=await p.locator('input:visible:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]):not([type=file]):not([type=color]),select:visible,textarea:visible').evaluateAll(es=>es.map(e=>({tag:e.tagName,type:e.type,class:e.className,font:getComputedStyle(e).fontSize})).filter(e=>parseFloat(e.font)<16));
    const key='scan'+route.replace(/[^a-z0-9]+/gi,'_')+'-'+name.replaceAll(' ','-');await shot(key,p);broadResults.push({route,profile:name,url:p.url(),status:response.status(),errors,...m,smallTextFields:fields,screenshot:'screens/'+key+'.png'});ok=true;
   }catch(e){broadRetries.push({route,profile:name,attempt,error:e.message});console.log('RETRY SCAN',route,name,attempt,e.message.slice(0,120));await new Promise(r=>setTimeout(r,3000));}finally{await c?.close().catch(()=>{});}
  }
  if(!ok)broadResults.push({route,profile:name,status:'failed'});
  await fs.writeFile(out+'/broad-scan.json',JSON.stringify(broadResults,null,2));await fs.writeFile(out+'/broad-errors.json',JSON.stringify(broadErrors,null,2));await fs.writeFile(out+'/broad-retries.json',JSON.stringify(broadRetries,null,2));
 }
 console.log('SCAN DONE',route,broadResults.length);
}
console.log('BROAD DONE',broadResults.length);
