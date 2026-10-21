const old = JSON.parse(await fs.readFile(out+'/../scan.json','utf8'));
const prior=JSON.parse(await fs.readFile(out+'/broad-scan.json','utf8'));
const completed=new Set(prior.filter(r=>r.status===200).map(r=>r.route));
const routes=[...new Set(old.filter(r=>r.status===200).map(r=>r.route))].filter(r=>!completed.has(r));
global.broadResults=prior.filter(r=>r.status===200);global.broadErrors=[];
const publicContext=await browser.newContext({viewport:{width:360,height:800},isMobile:true,hasTouch:true,locale:'ru-RU'});
await publicContext.addCookies([{name:'nb_dev_guest',value:'1',url:base},{name:'nb_cookie_consent',value:'1:necessary',url:base}]);
const userContext=await browser.newContext({viewport:{width:360,height:800},isMobile:true,hasTouch:true,locale:'ru-RU'});
await userContext.addCookies([{name:'nb_cookie_consent',value:'1:necessary',url:base}]);
const adminContext=await browser.newContext({viewport:{width:360,height:800},isMobile:true,hasTouch:true,locale:'ru-RU'});
await adminContext.addCookies([{name:'nb_dev_account',value:'qa.admin@localhost',url:base},{name:'nb_cookie_consent',value:'1:necessary',url:base}]);
const deepContext=await browser.newContext({viewport:{width:360,height:800},isMobile:true,hasTouch:true,locale:'ru-RU'});
await deepContext.addCookies([{name:'nb_dev_account',value:'qa.deep.main.20261020@localhost',url:base},{name:'nb_cookie_consent',value:'1:necessary',url:base}]);
const pages = await Promise.all([publicContext,userContext,adminContext,deepContext].map(async c=>{const p=await c.newPage();p.on('pageerror',e=>broadErrors.push({url:p.url(),message:e.message}));return p;}));
for(const route of routes) {
 const p=route.startsWith('/admin')?pages[2]:route.includes('a42dbf9d')?pages[3]:/^\/(app|profile|settings)(\/|$)/.test(route)?pages[1]:pages[0];
 try {
  const response=await p.goto(base+route,{waitUntil:'domcontentloaded',timeout:60000});
  await p.locator('h1').first().waitFor({state:'visible',timeout:20000});
  await p.waitForTimeout(450);
  const sizes=route.startsWith('/calculators/')?[[320,740],[390,844],[768,1024],[834,1112],[1024,768]]:[[360,800],[834,1112],[1024,768]];
  for(const[width,height]of sizes){
   await p.setViewportSize({width,height});await p.waitForTimeout(100);
   const m=await metrics(p),name='scan'+route.replace(/[^a-z0-9]+/gi,'_')+'-'+width;
   await shot(name,p);
   const r={route,url:p.url(),status:response.status(),requested:{width,height},...m,screenshot:'screens/'+name+'.png'};
   broadResults.push(r);
   console.log(JSON.stringify({route,width,status:r.status,overflow:m.scroll-m.client}));
  }
 } catch(e){broadResults.push({route,error:e.message});console.log('SCAN ERROR',route,e.message);}
 await fs.writeFile(out+'/broad-scan.json',JSON.stringify(broadResults,null,2));
 await fs.writeFile(out+'/broad-errors.json',JSON.stringify(broadErrors,null,2));
}
for(const c of [publicContext,userContext,adminContext,deepContext])await c.close();
console.log('BROAD SCAN DONE',broadResults.length);
