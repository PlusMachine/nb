const checks=[];
for(const profile of ['iPhone 13','iPad Pro 11','iPad Mini landscape']){
 const c=await browser.newContext({...pw.devices[profile],locale:'ru-RU',acceptDownloads:true});
 await c.addCookies([{name:'nb_cookie_consent',value:'1:necessary',url:base},{name:'nb_age_ok',value:'1',url:base}]);
 const p=await c.newPage();p.setDefaultTimeout(30000);
 try{
  await p.goto(base+'/app/recipes/ae29d940-0b2a-4d2e-9995-c112b79e5955/edit',{waitUntil:'domcontentloaded',timeout:90000});
  await p.waitForFunction(()=>!window.history.pushState.toString().includes('[native code]'));
  const toolbar=p.getByTestId('recipe-toolbar');await toolbar.waitFor();
  if(p.viewportSize().width<640){await toolbar.getByRole('button',{name:'Действия с рецептом',exact:true}).tap();await p.getByRole('menuitem',{name:'Наклейки',exact:true}).tap();}
  else await toolbar.getByRole('link',{name:'Наклейки',exact:true}).tap();
  await p.waitForURL('**/app/recipes/*/labels',{timeout:90000});
  await p.getByRole('button',{name:'75×120 мм',exact:true}).tap();
  await p.getByRole('img',{name:/Превью наклейки/}).waitFor({timeout:30000});
  const style=p.getByRole('textbox',{name:'Стиль',exact:true});await style.tap();await style.fill('Safari QA');await style.press('Tab');
  await shot('recipe-label-'+profile.replaceAll(' ','-'),p);
  for(const format of['PNG','PDF']){
   const link=p.getByRole('link',{name:'Скачать '+format,exact:true});const href=await link.getAttribute('href');const labelUrl=p.url();
   const [response]=await Promise.all([p.waitForResponse(r=>r.url()===new URL(href,base).href,{timeout:30000}),link.tap()]);
   if(response.status()!==200)throw Error('Export HTTP '+response.status());
   const api=await p.request.get(new URL(href,base).href);const data=await api.body();
   const file='recipe-label-'+profile.replaceAll(' ','-')+'.'+format.toLowerCase();await fs.writeFile(out+'/'+file,data);
   const valid=format==='PNG'?data.subarray(1,4).toString()==='PNG':data.subarray(0,4).toString()==='%PDF';if(!valid)throw Error('Bad '+format);
   const attachment=(await response.allHeaders())['content-disposition'];if(!attachment?.startsWith('attachment;'))throw Error('Missing attachment header');
   checks.push({profile,format,file,bytes:data.length,valid,clicked:true,http:response.status(),attachment,browserSaveVerified:false,limitation:'WPE standalone download probe does not emit download even with valid attachment or download attribute'});console.log('PASS EXPORT DELIVERY',profile,format,data.length);
   await p.goto(labelUrl,{waitUntil:'domcontentloaded'});await p.getByRole('link',{name:'Скачать PNG',exact:true}).waitFor();
  }
 }catch(e){checks.push({profile,error:e.message});console.log('FAIL DOWNLOAD',profile,e.message);}finally{await c.close();}
}
await fs.writeFile(out+'/label-downloads.json',JSON.stringify(checks,null,2));
