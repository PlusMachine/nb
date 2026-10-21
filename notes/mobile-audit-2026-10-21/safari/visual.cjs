const results=[];
async function inspect(profile,path,name,action,admin=false){
 const c=await browser.newContext({...pw.devices[profile],locale:'ru-RU'});const cookies=[{name:'nb_cookie_consent',value:'1:necessary',url:base},{name:'nb_age_ok',value:'1',url:base}];if(admin)cookies.push({name:'nb_dev_account',value:'qa.admin@localhost',url:base});else if(!path.startsWith('/app')&&!path.startsWith('/profile'))cookies.push({name:'nb_dev_guest',value:'1',url:base});await c.addCookies(cookies);const p=await c.newPage();p.setDefaultTimeout(20000);
 try{const response=await p.goto(base+path,{waitUntil:'domcontentloaded',timeout:90000});if(response.status()!==200)throw Error('HTTP '+response.status());await p.waitForFunction(()=>!window.history.pushState.toString().includes('[native code]'));await p.addStyleTag({content:'body>div.fixed:has(> .bg-warning-subtle){display:none!important}'});if(action)await action(p);await shot(name,p);results.push({profile,path,name,status:'passed',...await metrics(p)});console.log('VISUAL',name);}catch(e){results.push({profile,path,name,status:'failed',error:e.message});console.log('FAIL VISUAL',name,e.message);}finally{await c.close();}await fs.writeFile(out+'/visual-checks.json',JSON.stringify(results,null,2));
}
for(const profile of['iPhone SE','iPhone 13','iPhone 13 landscape','iPad Pro 11']){
 await inspect(profile,'/beer/pilsner-urquell','final-qr-'+profile.replaceAll(' ','-'));
}
await inspect('iPhone 13','/beer/pilsner-urquell','final-qr-description-open',async p=>p.locator('summary',{hasText:'Описание пива'}).tap());
await inspect('iPhone 13 landscape','/beer/pilsner-urquell','final-qr-feedback',async p=>{await p.getByRole('button',{name:'Обратная связь',exact:true}).tap();await p.getByRole('dialog',{name:'Обратная связь',exact:true}).waitFor();});
for(const profile of['iPhone 13','iPhone 13 landscape'])await inspect(profile,'/calculators/abv-attenuation','final-public-menu-'+profile.replaceAll(' ','-'),async p=>{await p.getByRole('button',{name:'Открыть меню',exact:true}).tap();await p.getByRole('radio',{name:'Тёмная тема',exact:true}).last().tap();});
await inspect('iPhone SE','/admin/recipes','final-admin-drawer',async p=>{await p.getByRole('button',{name:'Открыть меню',exact:true}).tap();await p.getByRole('dialog').waitFor();},true);
await inspect('iPad Mini landscape','/admin/recipes','final-admin-table',undefined,true);
for(const profile of['iPhone 13','iPad Pro 11']){
 await inspect(profile,'/profile','final-profile-'+profile.replaceAll(' ','-'),async p=>p.locator('input:visible').first().scrollIntoViewIfNeeded());
 await inspect(profile,'/app/master','final-master-'+profile.replaceAll(' ','-'),async p=>p.locator('input:visible').first().scrollIntoViewIfNeeded());
 await inspect(profile,'/app/recipes/ae29d940-0b2a-4d2e-9995-c112b79e5955/edit','final-recipe-'+profile.replaceAll(' ','-'),async p=>p.getByTestId('recipe-toolbar').waitFor());
}
