const c=await browser.newContext({viewport:{width:320,height:740},isMobile:true,hasTouch:true,locale:'ru-RU'});
await c.addCookies([{name:'nb_cookie_consent',value:'1:necessary',url:base}]);
const p=await c.newPage();p.setDefaultTimeout(15000);global.downloadChecks=[];
for(const[width,height]of[[320,740],[834,1112]]){
 await p.setViewportSize({width,height});
 await p.goto(base+'/app/recipes/ae29d940-0b2a-4d2e-9995-c112b79e5955/edit',{waitUntil:'domcontentloaded',timeout:60000});
 await p.waitForFunction(()=>!window.history.pushState.toString().includes('[native code]'));
 const toolbar=p.getByTestId('recipe-toolbar');await toolbar.waitFor();
 if(width<640){await toolbar.getByRole('button',{name:'Действия с рецептом',exact:true}).click();await p.getByRole('menuitem',{name:'Наклейки',exact:true}).click();}
 else await toolbar.getByRole('link',{name:'Наклейки',exact:true}).click();
 await p.waitForURL('**/app/recipes/*/labels',{timeout:60000});
 await p.getByRole('button',{name:'75×120 мм',exact:true}).click();
 const image=p.getByRole('img',{name:/Превью наклейки/});await image.waitFor({timeout:30000});
 await p.getByRole('textbox',{name:'Стиль',exact:true}).click();await p.getByRole('textbox',{name:'Стиль',exact:true}).fill('Mobile QA');
 await shot('recipe-label-fields-'+width,p);
 for(const format of ['PNG','PDF']){
  const[d]=await Promise.all([p.waitForEvent('download',{timeout:30000}),p.getByRole('link',{name:'Скачать '+format,exact:true}).click()]);
  const path=out+'/recipe-label-'+width+'.'+format.toLowerCase();await d.saveAs(path);const data=await fs.readFile(path);
  const signature=format==='PNG'?data.subarray(1,4).toString()==='PNG':data.subarray(0,4).toString()==='%PDF';
  if(!signature)throw Error('Wrong '+format+' signature');
  downloadChecks.push({width,format,file:d.suggestedFilename(),bytes:data.length,signature});console.log('PASS DOWNLOAD',width,format,data.length);
 }
}
await fs.writeFile(out+'/label-downloads.json',JSON.stringify(downloadChecks,null,2));await c.close();
