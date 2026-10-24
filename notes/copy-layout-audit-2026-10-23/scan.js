global.widths=[320,360,390,430,639,640,767,768,834,1023,1024,1280,1440,1920];
global.copyRows=JSON.parse(await fs.readFile('/home/dopefish/projects/nb/notes/copy-review-2026-10-23/decisions-applied.json','utf8')).resolutions.filter(r=>r.application==='apply');
global.changedTexts=copyRows.filter(r=>r.kind!=='Описание пива').map(r=>r.replacement);
global.scanResults=[];global.discovered={};
global.layoutMetrics=async(p)=>p.evaluate(texts=>{
 const norm=s=>s.replace(/\s+/g,' ').trim(),w=document.documentElement.clientWidth;
 const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&s.opacity!=='0'};
 const scrollContainer=e=>{for(let a=e.parentElement;a&&a!==document.body;a=a.parentElement){const s=getComputedStyle(a);if(/auto|scroll/.test(s.overflowX)&&a.scrollWidth>a.clientWidth+2)return true;}return false;};
 const exact=new Set(texts.map(norm));const found=new Set(),outside=[],clipped=[],overlaps=[];
 const controls=[...document.querySelectorAll('button,a,label,h1,h2,h3,p,dt,dd,summary,th,td,input,textarea,select,[role="menuitem"]')].filter(visible);
 for(const e of controls){
  const text=norm(e.textContent||'');if(!text)continue;
  const changed=exact.has(text);if(changed)found.add(text);
  const r=e.getBoundingClientRect(),style=getComputedStyle(e);const item={tag:e.tagName,text:text.slice(0,180),changed,cls:String(e.className).slice(0,160),box:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}};
  if((r.left< -2||r.right>w+2)&&!scrollContainer(e)&&text.length>=4)outside.push(item);
  if(changed&&e.clientWidth>0&&e.scrollWidth>e.clientWidth+2&&!scrollContainer(e)&&!String(e.className).match(/truncate|line-clamp/))clipped.push({...item,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth});
  if(changed&&e.clientHeight>0&&e.scrollHeight>e.clientHeight+3&&/hidden|clip/.test(style.overflowY)&&!String(e.className).includes('line-clamp'))clipped.push({...item,vertical:true});
 }
 const buttons=controls.filter(e=>e.matches('button,[role=tab]'));
 for(let i=0;i<buttons.length;i++){const a=buttons[i],ar=a.getBoundingClientRect();for(let j=i+1;j<buttons.length;j++){const b=buttons[j];if(a.parentElement!==b.parentElement||a.contains(b)||b.contains(a))continue;const br=b.getBoundingClientRect();if(Math.min(ar.right,br.right)-Math.max(ar.left,br.left)>2&&Math.min(ar.bottom,br.bottom)-Math.max(ar.top,br.top)>2)overlaps.push({a:norm(a.textContent||'').slice(0,80),b:norm(b.textContent||'').slice(0,80)});}}
 return {client:w,scroll:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth-w,outside:outside.slice(0,20),clipped:clipped.slice(0,20),overlaps:overlaps.slice(0,10),found:[...found]};
},changedTexts);
global.auditView=async(p,key,route,width,status=200)=>{
 await p.setViewportSize({width,height:width<=430?844:width<1024?1000:900});
 await p.waitForTimeout(130);
 const m=await layoutMetrics(p);const r={key,route,width,url:p.url(),status,...m};
 if([320,834,1280].includes(width)||m.overflow>1||m.clipped.length||m.overlaps.length){const name=key.replace(/[^a-z0-9]+/gi,'_')+'-'+width+'.png';await p.screenshot({path:out+'/screens/'+name,scale:'css'});r.screenshot='screens/'+name;}
 scanResults.push(r);
 return r;
};
const publicRoutes=['/','/demo','/brewforge','/catalog','/recipes','/recipes/pilsner-urquell','/bjcp','/bjcp/bjcp-3b-czech-premium-pale-lager','/labels','/articles','/market','/login','/offline','/calculators'];
const calculatorRoutes=['abv-attenuation','beer-color','bottling','brewhouse-efficiency','brewing-water-volume','dilution-boiloff','hop-freshness','hydrometer-correction','ibu','keg-carbonation','mash-infusion','priming-sugar','refractometer-correction','speise-krausen','unit-converter','water-ph','yeast-starter'].map(s=>'/calculators/'+s);
const userRoutes=['/catalog/new','/app','/app/ingredients','/app/shopping','/app/recipes','/app/recipes/new','/app/recipes/7440adc5-2cbf-41b2-9263-54c7450f25a6/edit','/app/recipes/32012342-387a-40e7-bfb2-a2b9cb4187e3/edit','/app/brew-batches','/app/brew-batches/40939e9b-934f-45c3-bca1-16d627b1cc04','/app/devices','/app/equipment','/app/master','/app/saved','/profile'];
const adminRoutes=['/admin','/admin/ingredients','/admin/ingredients/new','/admin/ingredients/merge','/admin/ingredients/moderation','/admin/articles','/admin/articles/new','/admin/masters','/admin/feedback','/admin/push','/admin/recipes','/admin/devices','/admin/firmware'];
const guestCalc=await contexts.guest.newPage();guestCalc.on('pageerror',e=>errors.push({account:'guest',url:guestCalc.url(),message:e.message}));
async function run(p,routes,role){for(const route of routes){try{
 const response=await p.goto(base+route,{waitUntil:'domcontentloaded',timeout:90000});
 await p.locator('h1,main').first().waitFor({state:'visible',timeout:30000});
 await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(500);
 const status=response?.status();discovered[role+route]=await p.locator('a[href]').evaluateAll(es=>[...new Set(es.map(e=>e.getAttribute('href')))].filter(s=>s?.startsWith('/')).slice(0,130));
 for(const width of widths)await auditView(p,role+route,route,width,status);
 const problems=scanResults.filter(x=>x.route===route&&(x.overflow>1||x.clipped.length||x.overlaps.length));
 console.log(JSON.stringify({role,route,status,views:widths.length,problemWidths:problems.map(x=>x.width)}));
 }catch(e){scanResults.push({route,role,error:e.message});console.log('ROUTE_ERROR',role,route,e.message.slice(0,180));}
 await fs.writeFile(out+'/scan.json',JSON.stringify(scanResults,null,2));await fs.writeFile(out+'/errors.json',JSON.stringify(errors,null,2));await fs.writeFile(out+'/discovered.json',JSON.stringify(discovered,null,2));
}}
await Promise.all([run(pages.guest,publicRoutes,'guest'),run(guestCalc,calculatorRoutes,'calculator'),run(pages.user,userRoutes,'user'),run(pages.admin,adminRoutes,'admin')]);
await guestCalc.close();
console.log('BROAD_SCAN_DONE',scanResults.length);
