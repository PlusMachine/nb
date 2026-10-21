const rows=[];
for(const mode of ['fresh','resize','manipulation']){
 const c=await browser.newContext({...pw.devices['iPhone SE']});await c.addCookies([{name:'nb_cookie_consent',value:'1%3Anecessary',url:base},{name:'nb_age_ok',value:'1',url:base},{name:'nb_dev_guest',value:'1',url:base}]);const p=await c.newPage();p.setDefaultTimeout(10000);
 await p.goto(base+'/beer/pilsner-urquell');await p.waitForFunction(()=>!window.history.pushState.toString().includes('[native code]'));await p.addStyleTag({content:'nextjs-portal,body>div.fixed:has(> .bg-warning-subtle){display:none!important}'+(mode==='manipulation'?'a,summary{touch-action:manipulation}':'')});
 await p.evaluate(()=>{window.tapEvents=[];for(const name of ['touchstart','touchend','click'])document.addEventListener(name,e=>window.tapEvents.push({type:e.type,target:e.target?.textContent?.slice(0,60)}),true)});
 const summary=p.locator('summary',{hasText:'Описание пива'});await summary.tap();await summary.tap();
 if(mode!=='fresh'){await p.setViewportSize({width:375,height:715});await p.locator('summary').waitFor();await p.setViewportSize({width:320,height:568});}
 const a=p.getByRole('link',{name:'Рецепт этого пива',exact:true});await a.tap();await p.waitForURL('**/recipes/pilsner-urquell',{timeout:4000}).catch(()=>{});const row={mode,url:p.url(),events:await p.evaluate(()=>window.tapEvents??[])};rows.push(row);console.log('TAP',row);await c.close();
}
await fs.writeFile(out+'/qr-tap-probe.json',JSON.stringify(rows,null,2));
