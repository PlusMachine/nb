const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const sharp=require('sharp');
const records=JSON.parse(fs.readFileSync(path.join(__dirname,'proposals.json'),'utf8'));
const out=path.join(__dirname,'screens');fs.mkdirSync(out,{recursive:true});
const base='http://127.0.0.1:3107';
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1280,height:1100},locale:'ru-RU',colorScheme:'light'});
 await context.addCookies([{name:'nb_cookie_consent',value:'1:necessary',url:base},{name:'nb_dev_guest',value:'1',url:base}]);
 const page=await context.newPage();const output=process.env.CAPTURE_IDS ? JSON.parse(fs.readFileSync(path.join(__dirname,'captured.json'),'utf8')) : [];
 for(const item of records){
  if(process.env.CAPTURE_IDS&&!process.env.CAPTURE_IDS.split(',').includes(item.id))continue;
  await page.goto(base+'/calculators'+(item.slug==='index'?'':'/'+item.slug),{waitUntil:'networkidle',timeout:120000});
  await page.evaluate(()=>localStorage.clear());await page.reload({waitUntil:'networkidle'});
  const main=page.locator('main').last(); await main.locator('h1').waitFor();
  item.title=await main.locator('h1').innerText();
  if(item.patch==='abv-empty')await page.getByLabel('Начальная плотность (OG)',{exact:false}).fill('');
  if(item.patch==='abv-comma')await page.getByLabel('Начальная плотность (OG)',{exact:false}).fill('13,0');
  if(item.patch==='yeast-zero'){
   await main.getByText('Дополнительно',{exact:true}).click();
   await main.getByLabel('Жизнеспособность',{exact:false}).fill('0');
  }
  if(item.patch==='bottling-label')await main.getByLabel('Основная бутылка',{exact:false}).selectOption('0.33');
  if(item.patch==='color-zero')await main.getByLabel('Объём партии',{exact:false}).fill('0');
  await page.evaluate(()=>window.scrollTo(0,0));
  const beforeText=await main.innerText();
  fs.writeFileSync(path.join(out,item.id+'-before.txt'),beforeText);
  fs.writeFileSync(path.join(out,item.id+'-dom.html'),await main.innerHTML());
  const fieldsBefore=await main.locator('input,select').evaluateAll(es=>es.map(e=>({label:e.closest('label')?.innerText,value:e.value,rect:{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width}})));
  let result=main.locator('#calculator-result');
  if(item.patch==='keg-label'){
   result=main.getByText('давление',{exact:true}).locator('..');
  }
  const mainBox=await main.boundingBox();
  // Overview preserves the actual desktop layout. Long pages retain their full height.
  const fullBox={x:mainBox.x,y:mainBox.y,width:mainBox.width,height:mainBox.height};
  let focusBox=fullBox;
  if(item.patch){
   const rb=await result.boundingBox();if(!rb)throw Error('Missing result '+item.id);
   focusBox={x:Math.max(mainBox.x,rb.x-5),y:Math.max(mainBox.y,rb.y-5),width:Math.min(rb.width+10,1280-rb.x+5),height:Math.min(rb.height+10,600)};
   if(item.patch==='water-label'){
    const acid=await result.getByText('Кислота',{exact:true}).boundingBox();
    focusBox.y=Math.max(rb.y,acid.y-120);focusBox.height=330;
   }
   if(item.patch==='keg-label'){focusBox={x:rb.x+rb.width-300,y:rb.y-16,width:308,height:rb.height+32};}
  }
  const save=async(suffix,clip,quality)=>{
   const file=path.join(out,item.id+'-'+suffix+'.webp');
   await sharp(await page.screenshot({clip,animations:'disabled'})).webp({quality}).toFile(file);return file;
  };
  item.fullBefore=await save('before-full',fullBox,48);
  item.before= item.patch ? await save('before-focus',focusBox,86):item.fullBefore;
  if(item.patch==='abv-comma'){
   await page.getByLabel('Начальная плотность (OG)',{exact:false}).fill('13.0');
   await page.getByLabel('Начальная плотность (OG)',{exact:false}).evaluate(e=>{e.value='13,0';});
  } else if(item.patch){
   await main.evaluate((main,patch)=>{
    const find=(root,text)=>[...root.querySelectorAll('*')].find(e=>e.children.length===0&&e.textContent.trim()===text);
    const result=main.querySelector('#calculator-result');
    const replace=(root,oldText,newText)=>{const e=find(root,oldText);if(!e)throw Error('Missing text '+oldText);e.textContent=newText;e.dataset.proposedChange='true';return e;};
    if(patch==='abv-empty'){
     const primary=result.querySelector('.text-4xl');primary.style.minWidth=primary.getBoundingClientRect().width+'px';primary.textContent='—';
     for(const e of result.querySelectorAll('span')){
      if(e.textContent.startsWith('ABW ')||e.textContent.startsWith('OG '))e.style.minWidth=e.getBoundingClientRect().width+'px';
      if(e.textContent.startsWith('ABW '))e.textContent='ABW —';
      if(e.textContent.startsWith('OG '))e.textContent='OG —';
     }
     result.querySelectorAll('dd').forEach(e=>{if(e.querySelector('span'))e.firstChild.nodeValue='— ';else e.textContent='—';});
     const note=[...result.querySelectorAll('p')].find(e=>e.textContent.includes('Видимая степень сбраживания:'));
     note.style.minHeight=note.getBoundingClientRect().height+'px';note.textContent='Укажите начальную плотность (OG).';
    }
    if(patch==='water-label')replace(result,'Кислота','Кислота в затор · 15 л');
    if(patch==='yeast-zero')replace(result,'Стартер не нужен по расчёту','Нет жизнеспособных клеток — нужны свежие дрожжи');
    if(patch==='keg-label')replace(main,'давление','избыточное давление');
    if(patch==='bottling-label')replace(result,'Бутылок нужно','Полных бутылок');
    if(patch==='hop-helper')replace(result,'Потеряно ~0% горечи','Дата упаковки не указана — расчёт как для свежего хмеля');
    if(patch==='color-zero'){
     const value=[...result.querySelectorAll('*')].find(e=>e.children.length===0&&e.textContent.includes('SRM /'));
     if(!value)throw Error('Missing color');value.textContent='—';
     const helper=[...result.querySelectorAll('*')].find(e=>e.children.length===0&&e.textContent.includes('MCU '));
     helper.textContent='Укажите объём партии больше 0 л';
     for(const e of result.querySelectorAll('*'))if(e.children.length===0&&e.textContent.trim().startsWith('MCU '))e.textContent='MCU —';
     const swatch=result.querySelector('[style*="background-color"]');if(swatch)swatch.style.backgroundColor='transparent';
    }
   },item.patch);
  }
  const fieldsAfter=await main.locator('input,select').evaluateAll(es=>es.map(e=>({label:e.closest('label')?.innerText,value:e.value,rect:{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width}})));
  if(JSON.stringify(fieldsBefore)!==JSON.stringify(fieldsAfter))throw Error('Fields or layout changed '+item.id);
  if(item.patch){
   item.fullAfter=await save('after-full',fullBox,48);
   item.after=await save('after-focus',focusBox,86);
  } else {item.fullAfter=item.fullBefore;item.after=item.before;}
  item.focus={width:focusBox.width,height:focusBox.height};
  item.beforeText=beforeText;item.afterText=await main.innerText();
  const oldIndex=output.findIndex(x=>x.id===item.id);if(oldIndex>=0)output[oldIndex]=item;else output.push(item);fs.writeFileSync(path.join(__dirname,'captured.json'),JSON.stringify(output,null,2));
  console.log('Captured',item.id,item.patch||'unchanged');
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
