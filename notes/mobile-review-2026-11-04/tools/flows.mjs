import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
export async function run(A) {
  const results=[];
  const test=async(name,fn)=>{try{results.push({name,ok:true,evidence:await fn()});}catch(e){results.push({name,ok:false,error:e.message});}};
  const {page}=await A.open('/recipes','guest');
  await test('Find a recipe by search and open its mobile detail',async()=>{
    await page.waitForFunction(()=>{
      const input=document.getElementById('recipes-search');
      return input&&Object.keys(input).some(key=>key.startsWith('__reactProps$')&&typeof input[key]?.onChange==='function');
    });
    await page.getByRole('searchbox',{name:'Поиск рецептов',exact:true}).fill('Pilsner Urquell');
    await page.waitForFunction(()=>new URL(location.href).searchParams.get('q')==='Pilsner Urquell',{}, {timeout:30000});
    await page.locator('a[href="/recipes/pilsner-urquell"]').first().click();
    await page.getByRole('heading',{name:'Pilsner Urquell',exact:true,level:1}).waitFor({timeout:30000});
    assert((await A.metrics(page)).scroll<=390);
    return {url:page.url()};
  });
  await A.open('/','guest',844,390);
  await test('Public menu fits a short landscape viewport and toggles theme',async()=>{
    await page.getByRole('button',{name:'Открыть меню',exact:true}).click();
    const menu=page.locator('header [class*="max-h-"]').last();
    const box=await menu.boundingBox();assert(box.y>=0&&box.y+box.height<=391);
    await page.getByRole('button',{name:'Тема оформления',exact:true}).last().click();
    await page.getByRole('radio',{name:'Тёмная тема',exact:true}).click();
    assert(await page.locator('html').evaluate(el=>el.classList.contains('dark')));
    await A.shot('verified-public-menu-landscape-dark',page);
    await page.keyboard.press('Escape');
    const openTheme=page.getByRole('button',{name:'Тема оформления',exact:true}).last();
    await openTheme.click();
    await page.getByRole('radio',{name:'Светлая тема',exact:true}).click();
    assert(!await page.locator('html').evaluate(el=>el.classList.contains('dark')));
    await page.keyboard.press('Escape');
    if(await page.getByRole('button',{name:'Закрыть меню',exact:true}).count()) await page.getByRole('button',{name:'Закрыть меню',exact:true}).click();
    return {width:844,height:390,menu:box,themeCycle:'light-dark-light'};
  });
  await A.open('/labels','guest',320,740);
  await test('Tall label preview leaves text fields clickable at 320px',async()=>{
    await page.getByRole('button',{name:'Крафт',exact:true}).click();
    await page.getByRole('button',{name:'75×120 мм',exact:true}).first().click();
    const preview=page.getByRole('img',{name:/Предпросмотр этикетки/});
    await preview.waitFor({timeout:30000});
    for(const field of ['Название','Стиль','Автор']) {
      const input=page.getByRole('textbox',{name:field,exact:true});
      await input.click();assert(await input.evaluate(el=>document.activeElement===el));
      assert(parseFloat(await input.evaluate(el=>getComputedStyle(el).fontSize))>=16);
    }
    await A.shot('verified-label-tall-input-320',page);
    return {documentWidth:(await A.metrics(page)).scroll,fields:['Название','Стиль','Автор']};
  });
  const user=await A.surface('user');
  await A.open('/app','user',844,390);
  await test('Account drawer opens and closes in landscape',async()=>{
    await user.getByRole('button',{name:'Открыть меню',exact:true}).click();
    await user.getByRole('dialog').waitFor();
    await user.getByRole('dialog').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)));
    const box=await user.getByRole('dialog').boundingBox();assert(box.x>=-1&&box.y>=0&&box.y+box.height<=391);
    await A.shot('verified-app-drawer-landscape',user);
    await user.getByRole('dialog').getByRole('button',{name:'Закрыть',exact:true}).click();
    assert.equal(await user.getByRole('dialog').count(),0);
    return box;
  });
  await test('First visit consent fits a narrow phone and persists',async()=>{
    const context=await A.browser.newContext({viewport:{width:320,height:568},isMobile:true,hasTouch:true,locale:'ru-RU'});
    try {
      const fresh=await context.newPage();await fresh.goto(A.base,{waitUntil:'domcontentloaded'});
      const necessary=fresh.getByRole('button',{name:'Только необходимые',exact:true});await necessary.waitFor({timeout:30000});
      const box=await necessary.boundingBox();assert(box.x>=0&&box.x+box.width<=321&&box.y>=0&&box.y+box.height<=569);
      await A.shot('verified-first-visit-320',fresh);
      await necessary.click();await necessary.waitFor({state:'hidden'});
      await fresh.reload({waitUntil:'domcontentloaded'});
      assert.equal(await necessary.count(),0);
      assert((await context.cookies()).some(c=>c.name==='nb_cookie_consent'));
      return {button:box,cookiePersisted:true};
    } finally {await context.close();}
  });
  await writeFile(`${A.root}/flows.json`,JSON.stringify(results,null,2)+'\n');return results;
}
