import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

export const results=[];
async function closeIngredient(page) {
  if(!await page.getByRole('dialog').count()) return;
  const discard=page.getByRole('dialog',{name:'Закрыть без сохранения?',exact:true});
  if(await discard.count()) {
    await discard.getByRole('button',{name:'Закрыть',exact:true}).last().click();
    return;
  }
  await page.getByRole('dialog').getByRole('button',{name:'Закрыть',exact:true}).click();
  await page.waitForTimeout(150);
  if(await discard.count()) await discard.getByRole('button',{name:'Закрыть',exact:true}).last().click();
}
async function check(name,fn) {
  const started=Date.now();
  try { const evidence=await fn(); results.push({name,ok:true,ms:Date.now()-started,evidence}); }
  catch(error) { results.push({name,ok:false,ms:Date.now()-started,error:error.message}); }
}
export async function editor(A,page) {
  for(const width of [320,360,390,768]) {
    await check(`Ingredient categories: full labels and selection at ${width}px`,async()=>{
      await page.setViewportSize({width,height:width===768?1024:800});
      await closeIngredient(page);
      for(const label of ['Солод и другое сырьё','Хмель','Дрожжи','Водоподготовка','Специи и добавки']) {
        await page.getByRole('button',{name:'Добавить хмель',exact:true}).click();
        const grid=page.getByTestId('recipe-ingredient-category-grid');
        await grid.waitFor();
        const button=grid.getByRole('button',{name:label,exact:true});
        const bounds=await button.evaluate(el=>{
          const text=el.querySelector('span > span');const r=text.getBoundingClientRect(),b=el.getBoundingClientRect();
          return {text:text.textContent,scroll:el.scrollWidth,width:el.clientWidth,left:r.left,right:r.right,buttonLeft:b.left,buttonRight:b.right};
        });
        assert(bounds.scroll<=bounds.width+1,JSON.stringify(bounds));
        assert(bounds.left>=bounds.buttonLeft-1&&bounds.right<=bounds.buttonRight+1,JSON.stringify(bounds));
        await button.click();
        assert(await page.getByRole('dialog').getByRole('button',{name:'Закрыть',exact:true}).isVisible());
        if(label==='Водоподготовка') await page.getByRole('heading',{name:'Добавить соль в воду',exact:true}).waitFor();
        if(label==='Специи и добавки') await A.shot(`verified-category-${width}`,page);
        await closeIngredient(page);
      }
      const m=await A.metrics(page);assert(m.scroll<=width+1);
      assert.equal(await page.getByRole('dialog').count(),0);
      return {width,documentWidth:m.scroll};
    });
  }
  await check('Recipe section headings remain readable at 320px',async()=>{
    await page.setViewportSize({width:320,height:740});
    const headings=page.getByRole('heading');
    const data=[];
    for(const title of ['Сравнение со стилем','Солод и другое сырьё','Водоподготовка','Специи и добавки']) {
      const h=headings.filter({hasText:title}).first();await h.scrollIntoViewIfNeeded();
      const d=await h.evaluate(el=>({text:el.textContent,client:el.clientWidth,scroll:el.scrollWidth,height:el.clientHeight}));
      assert(d.scroll<=d.client+1,JSON.stringify(d));data.push(d);
    }
    await A.shot('verified-editor-sections-320',page);
    return data;
  });
  await check('Recipe actions: two import dialog cycles then brew dialog',async()=>{
    for(let i=0;i<2;i++) {
      await page.getByTestId('recipe-toolbar').getByRole('button',{name:'Действия с рецептом',exact:true}).click();
      await page.getByRole('menuitem',{name:'Импорт / экспорт',exact:true}).click();
      await page.getByRole('dialog').waitFor();
      await page.getByRole('dialog').getByRole('button',{name:'Закрыть',exact:true}).click();
      assert.equal(await page.getByRole('dialog').count(),0);
    }
    await page.getByRole('button',{name:'Сварить',exact:true}).click();
    await page.getByRole('dialog',{name:'Сварить по рецепту',exact:true}).waitFor({timeout:45000});
    await A.shot('verified-brew-dialog-320',page);
    await page.getByRole('dialog').getByRole('button',{name:'Закрыть',exact:true}).click();
    return {cycles:2,brewDialog:true};
  });
  await writeFile(`${A.root}/interactions.json`,JSON.stringify(results,null,2)+'\n');
  return results;
}
