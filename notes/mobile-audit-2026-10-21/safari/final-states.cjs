const checks=[];
for(const [profile,path,role] of [['iPhone SE','/admin/recipes','admin'],['iPhone 13 landscape','/calculators/abv-attenuation','guest'],['iPhone 13 landscape','/calculators/dilution-boiloff','user']]){
 const c=await browser.newContext({...pw.devices[profile],locale:'ru-RU'});const cookies=[{name:'nb_cookie_consent',value:'1%3Anecessary',url:base},{name:'nb_age_ok',value:'1',url:base}];if(role==='admin')cookies.push({name:'nb_dev_account',value:'qa.admin@localhost',url:base});if(role==='guest')cookies.push({name:'nb_dev_guest',value:'1',url:base});await c.addCookies(cookies);const p=await c.newPage();
 try{
  await p.goto(base+path);await p.waitForFunction(()=>!window.history.pushState.toString().includes('[native code]'));await p.addStyleTag({content:'body>div.fixed:has(> .bg-warning-subtle){display:none!important}'});
  if(role==='admin'){
   await p.getByRole('button',{name:'Открыть меню',exact:true}).tap();const d=p.getByRole('dialog');await d.waitFor();await p.waitForFunction(()=>document.querySelector('[role=dialog]')?.getBoundingClientRect().x>=-1);await shot('final-admin-drawer',p);await d.getByRole('button',{name:'Закрыть',exact:true}).tap();await d.waitFor({state:'hidden'});
  }else if(role==='guest'){
   await p.getByRole('button',{name:'Открыть меню',exact:true}).tap();const dark=p.getByRole('radio',{name:'Тёмная тема',exact:true}).last();await dark.tap();await p.waitForFunction(()=>[...document.querySelectorAll('[role=radio][aria-label="Тёмная тема"]')].every(e=>e.getAttribute('aria-checked')==='true'));await shot('final-public-menu-iPhone-13-landscape',p);
  }else{
   await p.waitForFunction(()=>localStorage.getItem('hmelo.calculators.dilution-boiloff.lastState'));
   await p.getByRole('group',{name:'Что делаем',exact:true}).getByRole('button',{name:'Уварить',exact:true}).tap();const b=p.getByRole('group',{name:'Что рассчитать',exact:true}).getByRole('button',{name:'Время кипячения',exact:true});await b.tap();await p.waitForFunction(()=>JSON.parse(localStorage.getItem('hmelo.calculators.dilution-boiloff.lastState')).mode==='extra_boil_time');await p.waitForTimeout(750);if(await b.getAttribute('aria-pressed')!=='true')throw Error('Selection reverted');await shot('final-calculator-landscape',p);const state=await p.evaluate(()=>JSON.parse(localStorage.getItem('hmelo.calculators.dilution-boiloff.lastState')));checks.push({profile,path,state});
   await p.setViewportSize({width:390,height:664});await p.waitForFunction(()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nb-sticky-bar-h'))>0);await p.setViewportSize({width:750,height:342});await p.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--nb-sticky-bar-h')==='0px');
  }
  checks.push({profile,path,status:'passed'});console.log('PASS FINAL STATE',profile,path);
 }catch(e){checks.push({profile,path,status:'failed',error:e.message});console.log('FAIL FINAL STATE',e.message);}finally{await c.close();}
}
await fs.writeFile(out+'/final-states.json',JSON.stringify(checks,null,2));
