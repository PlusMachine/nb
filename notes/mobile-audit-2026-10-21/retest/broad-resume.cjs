const original=JSON.parse(await fs.readFile(out+'/../scan.json','utf8'));
const prior=JSON.parse(await fs.readFile(out+'/broad-scan.json','utf8'));
const done=new Set(prior.filter(r=>r.status===200).map(r=>r.route));
const routes=[...new Set(original.filter(r=>r.status===200).map(r=>r.route))].filter(r=>!done.has(r));
global.broadResults=prior.filter(r=>r.status===200);global.broadErrors=[];global.scanAttempts=[];
const scanContext=await browser.newContext({viewport:{width:360,height:800},isMobile:true,hasTouch:true,locale:'ru-RU'});
let p=await scanContext.newPage();
const listen=()=>p.on('pageerror',e=>broadErrors.push({url:p.url(),message:e.message}));listen();
for(const route of routes){
 await scanContext.clearCookies();
 const cookies=[{name:'nb_cookie_consent',value:'1:necessary',url:base}];
 if(route.startsWith('/admin'))cookies.push({name:'nb_dev_account',value:'qa.admin@localhost',url:base});
 else if(route.includes('a42dbf9d'))cookies.push({name:'nb_dev_account',value:'qa.deep.main.20261020@localhost',url:base});
 else if(!/^\/(app|profile|settings)(\/|$)/.test(route))cookies.push({name:'nb_dev_guest',value:'1',url:base});
 await scanContext.addCookies(cookies);
 let success=false;
 for(let attempt=1;attempt<=3&&!success;attempt++){
  try{
   console.log('SCAN',route,'attempt',attempt);
   const response=await p.goto(base+route,{waitUntil:'domcontentloaded',timeout:90000});
   if(response.status()!==200)throw Error('HTTP '+response.status());
   await p.locator('h1').first().waitFor({state:'visible',timeout:20000});await p.waitForTimeout(350);
   const sizes=route.startsWith('/calculators/')?[[320,740],[390,844],[768,1024],[834,1112],[1024,768]]:[[360,800],[834,1112],[1024,768]];
   const rows=[];
   for(const[width,height]of sizes){await p.setViewportSize({width,height});await p.waitForTimeout(100);const m=await metrics(p);const name='scan'+route.replace(/[^a-z0-9]+/gi,'_')+'-'+width;await shot(name,p);rows.push({route,url:p.url(),status:response.status(),requested:{width,height},...m,screenshot:'screens/'+name+'.png'});}
   broadResults.push(...rows);success=true;console.log('PASS SCAN',route);
  }catch(e){scanAttempts.push({route,attempt,error:e.message});console.log('RETRY',route,e.message.slice(0,140));await p.close().catch(()=>{});p=await scanContext.newPage();listen();if(attempt<3)await p.waitForTimeout(5000);}
 }
 if(!success)broadResults.push({route,error:'Failed after 3 attempts'});
 await fs.writeFile(out+'/broad-scan.json',JSON.stringify(broadResults,null,2));
 await fs.writeFile(out+'/broad-errors.json',JSON.stringify(broadErrors,null,2));
 await fs.writeFile(out+'/broad-retries.json',JSON.stringify(scanAttempts,null,2));
}
await scanContext.close();console.log('BROAD RESUME DONE',broadResults.length);
