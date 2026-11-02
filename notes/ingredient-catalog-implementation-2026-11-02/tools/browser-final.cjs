const {chromium}=require('/home/dopefish/projects/nb/node_modules/playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const root='/home/dopefish/projects/nb/notes/ingredient-catalog-implementation-2026-11-02';
const auth=JSON.parse(fs.readFileSync(root+'/private/browser-auth.json','utf8'));
const base='http://127.0.0.1:3183';
const resultPath=root+'/browser-result.json';
const report=fs.existsSync(resultPath)?JSON.parse(fs.readFileSync(resultPath,'utf8')):{checks:[],errors:[]};
const stage=process.argv[2]||'public';
const check=(id,passed,extra={})=>{report.checks=report.checks.filter(row=>row.id!==id);report.checks.push({id,passed,...extra});fs.writeFileSync(resultPath,JSON.stringify(report,null,2));console.log(JSON.stringify({id,passed}));assert.ok(passed,id)};
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'ru-RU'});
 await context.addCookies([{name:'nb_session',value:auth.token,url:base},{name:'nb_cookie_consent',value:'1:necessary',url:base}]);
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>{report.errors.push(String(error));fs.writeFileSync(resultPath,JSON.stringify(report,null,2))});
 const go=async(path)=>{await page.goto(base+path,{waitUntil:'networkidle',timeout:60000})};
 if(stage==='public'){
  const mobile=await browser.newContext({viewport:{width:320,height:900},isMobile:true,hasTouch:true,locale:'ru-RU'});
  await mobile.addCookies([{name:'nb_cookie_consent',value:'1:necessary',url:base}]);
  const small=await mobile.newPage();
  const ids=['bestmalz-best-heidelberg-malt','viking-malt-caramel-250-fi-special','gb-challenger-standard','fermentis-la-01','iodophor-sanitizer','calcium-chloride-dihydrate','acidulated-malt','aeration-dechlorination','rice-hulls-nesolozhenka','muntons-premium-pilsner-ekstrakty-kontsentraty'];
  for(const width of [320,390]){
   await small.setViewportSize({width,height:900});
   for(const id of ids){
    await small.goto(base+'/catalog/system/'+id,{waitUntil:'networkidle',timeout:60000});
    const text=await small.locator('main').last().innerText();
    const overflow=await small.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    check('responsive_'+width+'_'+id,!overflow,{width});
    const headingFits=await small.locator('h1').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return [...range.getClientRects()].every(rect=>rect.left>=0&&rect.right<=innerWidth+1)});
    check('heading_fits_'+width+'_'+id,headingFits,{width});
    if(width===320){
     if(id==='gb-challenger-standard')check('hop_ranges_effective_alpha',text.includes('6.5–8.5%')&&text.includes('7.5%')&&text.includes('0.5–1.5 мл/100 г'));
     if(id==='fermentis-la-01')check('la01_verified_packages',text.includes('500 г')&&text.includes('10 кг')&&text.includes('источник не подтверждён'));
     if(id==='iodophor-sanitizer')check('iodophor_nominal_ml',text.includes('118,3 мл')&&text.includes('473 мл')&&text.includes('946 мл')&&text.includes('4 fl oz'));
     if(id==='aeration-dechlorination')check('method_reference_actions',!text.includes('Добавить на склад')&&!text.includes('Создать свой вариант')&&text.includes('Как применять'));
     if(id==='acidulated-malt')check('acidulated_reference_choice',!text.includes('Добавить на склад')&&text.toLowerCase().includes('производител'));
     if(id==='rice-hulls-nesolozhenka')check('hulls_no_fake_extraction',text.includes('Фильтрация затора')&&!text.includes('Экстрактивность'));
     if(['gb-challenger-standard','fermentis-la-01','iodophor-sanitizer','acidulated-malt','rice-hulls-nesolozhenka'].includes(id))await small.screenshot({path:root+'/screenshots/'+id+'-320.png',fullPage:true});
    }
   }
  }
  await go('/catalog/system/weyermann-dark-wheat-de-base');check('merged_wheat_redirect',page.url().endsWith('/weyermann--wheat-malt-dark'));
  await go('/catalog/malts?manufacturer=The+Swaen&maltType=base&ebcMin=2&ebcMax=5&q=pilsner');
  check('combined_malt_filters',(await page.locator('tbody tr').first().innerText()).includes('The Swaen'));
  await page.getByRole('button',{name:'Сбросить фильтры',exact:true}).click();await page.waitForURL(url=>!url.searchParams.has('manufacturer'));
  check('filter_reset_keeps_query',new URL(page.url()).searchParams.get('q')==='pilsner');
  await page.getByPlaceholder('Поиск по каталогу').fill('Viking Caramel 250');await page.waitForURL(/q=Viking/);await page.waitForLoadState('networkidle');
  check('specific_malt_ranks_first',(await page.locator('tbody tr').first().innerText()).includes('Caramel 250'));
  await page.screenshot({path:root+'/screenshots/specific-malt-search.png'});
  await page.getByRole('button',{name:'Все производители…',exact:true}).click();await page.getByLabel('Поиск в списке').fill('zz-no-such-brand');
  check('manufacturer_empty_search',(await page.getByRole('dialog').innerText()).includes('Ничего не найдено'));
  await page.getByLabel('Поиск в списке').fill('swaen');await page.getByRole('button',{name:'The Swaen',exact:true}).click();
  await page.waitForURL(/manufacturer=The/);check('manufacturer_full_list_select',new URL(page.url()).searchParams.get('manufacturer')==='The Swaen');
  await go('/catalog/hops?q=Citra');
  const links=await page.locator('main').last().locator('a[href]').evaluateAll(es=>es.map(e=>e.getAttribute('href')));
  check('hop_supplier_ids_remain_selectable',links.some(x=>x.includes('/us-citra-standard'))&&links.some(x=>x.includes('/us-citra-beervingem-standard'))&&links.some(x=>x.includes('cryo')));
  await page.screenshot({path:root+'/screenshots/hop-suppliers.png'});
  await mobile.close();
 }
 if(stage==='stock'){
  await go('/app/ingredients');
  await page.getByRole('button',{name:'Редактировать',exact:true}).first().click();
  let d=page.getByRole('dialog');await d.getByLabel(/Ед\. изм\./).selectOption('pack');
  check('stock_edit_unit_preserves_1000_pieces',(await d.getByLabel('Количество *',{exact:true}).inputValue())==='1');
  await d.getByText('Дополнительно',{exact:true}).click();
  await d.getByLabel('Заметки',{exact:true}).fill('Проверка сохранения фасовки и стоимости');
  await d.getByRole('button',{name:'Сохранить',exact:true}).click();await d.waitFor({state:'hidden'});
  await go('/app/ingredients');let text=await page.locator('main').last().innerText();
  check('stock_edit_keeps_piece_cost',text.includes('1000 шт.')&&text.includes('0,10'));
  await page.screenshot({path:root+'/screenshots/stock-package-saved.png'});
  await go('/app/ingredients?addSource=catalog&addId=calcium-chloride-dihydrate');d=page.getByRole('dialog');await d.waitFor();
  await d.locator('select').last().selectOption('mg');await d.getByLabel('Количество *',{exact:true}).fill('40');
  await d.locator('select').last().selectOption('kg');check('stock_40mg_to_kg_exact',(await d.getByLabel('Количество *',{exact:true}).inputValue())==='0.00004');
  await d.locator('select').last().selectOption('mg');check('stock_kg_back_to_40mg',(await d.getByLabel('Количество *',{exact:true}).inputValue())==='40');
  await d.getByRole('button',{name:'Добавить в запасы',exact:true}).click();await d.waitFor({state:'hidden'});
  await go('/app/ingredients');text=await page.locator('main').last().innerText();check('stock_40mg_after_save',text.includes('40 мг'));
  await page.screenshot({path:root+'/screenshots/stock-milligrams.png'});
  await go('/app/ingredients?addSource=catalog&addId=fermentis-la-01');d=page.getByRole('dialog');await d.waitFor();
  check('la01_no_11g_guess',!(await d.innerText()).includes('1 уп. = 11'));
  await d.locator('select').first().selectOption({label:'500 г'});await d.getByLabel('Количество упаковок *',{exact:true}).fill('1');
  check('la01_500g_stock_preview',(await d.innerText()).includes('На склад добавится: 500 г'));
  await page.screenshot({path:root+'/screenshots/la01-package-choice.png'});
  await go('/app/ingredients?addSource=catalog&addId=aeration-dechlorination');check('method_direct_stock_link_blocked',await page.getByRole('dialog').count()===0);
 }
 if(stage==='recipe'){
  await go('/app/recipes/'+auth.recipeId+'/edit');const text=await page.locator('main').last().innerText();
  check('recipe_saved_packet_alpha',text.includes('Альфа 4.5%')&&text.includes('1.059 SG')&&text.includes('1.050 SG'));
  await page.screenshot({path:root+'/screenshots/recipe-after-packet-alpha.png'});
 }
 await context.close();
 }finally{await browser.close()}
})().catch(error=>{report.errors.push({stage,error:String(error)});fs.writeFileSync(resultPath,JSON.stringify(report,null,2));console.error(error);process.exitCode=1});
