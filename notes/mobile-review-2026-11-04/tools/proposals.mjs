import sharp from 'sharp';
import {writeFile} from 'node:fs/promises';

export async function comparison(root,id,title) {
  const current=await sharp(`${root}/screenshots/proposal-${id}-current-390.png`).toBuffer();
  const proposed=await sharp(`${root}/screenshots/proposal-${id}-proposed-390.png`).toBuffer();
  const header=Buffer.from(`<svg width="804" height="54"><rect width="804" height="54" fill="#f1f2f4"/><g font-family="DejaVu Sans,sans-serif" font-size="17" font-weight="600" fill="#222"><text x="16" y="34">Сейчас</text><text x="426" y="34">Предлагаю</text></g></svg>`);
  const file=`${root}/screenshots/proposal-${id}-comparison.png`;
  await sharp({create:{width:804,height:898,channels:3,background:'#f1f2f4'}}).composite([{input:header,left:0,top:0},{input:current,left:0,top:54},{input:proposed,left:414,top:54}]).png().toFile(file);
  return file;
}

export async function recipe(A,page) {
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>scrollTo(0,0));
  await A.shot('proposal-1-current-390',page);
  const offsets=await page.evaluate(()=>{
    const firstIngredient=[...document.querySelectorAll('h2')].find(h=>h.textContent==='Солод и другое сырьё');
    const before=firstIngredient.getBoundingClientRect().top+scrollY;
    document.querySelector('details:has(dl[aria-busy])').open=false;
    const heading=[...document.querySelectorAll('h2')].find(h=>h.textContent==='Сравнение со стилем');
    const section=heading.closest('section');
    const details=document.createElement('details');
    details.id='review-style-details';
    details.style.cssText='border:1px solid hsl(var(--border));border-radius:12px;background:hsl(var(--card));overflow:hidden';
    const summary=document.createElement('summary');
    summary.style.cssText='cursor:pointer;padding:13px 16px;font-size:14px;font-weight:600;color:hsl(var(--foreground))';
    summary.textContent='Сравнение со стилем';
    section.before(details);details.append(summary,section);
    return {before,after:firstIngredient.getBoundingClientRect().top+scrollY};
  });
  await A.shot('proposal-1-proposed-390',page);
  const details=page.locator('#review-style-details');
  await details.locator('summary').click();
  if(!await details.getAttribute('open').then(x=>x!==null)) throw new Error('Proposal details did not open');
  await details.locator('summary').click();
  await page.evaluate(()=>scrollTo(0,0));
  await writeFile(`${A.root}/proposal-1.json`,JSON.stringify({status:'preview-only',description:'Collapse detailed mobile recipe metrics and BJCP comparison by default; preserve access through disclosures',offsets,detailsToggleVerified:true},null,2)+'\n');
  return {offsets,file:await comparison(A.root,1)};
}

export async function recipes(A,page) {
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>scrollTo(0,0));
  await A.shot('proposal-2-current-390',page);
  const offsets=await page.evaluate(()=>{
    const filter=document.querySelector('button[aria-label="Открыть фильтры"]');
    const sort=document.querySelector('select[aria-label="Сортировка"]');
    const search=document.querySelector('#recipes-search');
    const grid=sort.parentElement;
    const emptyFilterRow=filter.parentElement;
    const before=document.querySelector('main').scrollHeight;
    grid.style.cssText='display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center';
    search.parentElement.style.gridColumn='1 / -1';
    sort.style.cssText='min-width:0;width:100%;height:44px';
    filter.append(document.createTextNode('Фильтры'));
    grid.append(filter);
    emptyFilterRow.style.display='none';
    return {before,after:document.querySelector('main').scrollHeight};
  });
  await A.shot('proposal-2-proposed-390',page);
  await page.getByRole('button',{name:'Открыть фильтры',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').getByRole('button',{name:'Закрыть',exact:true}).click();
  await writeFile(`${A.root}/proposal-2.json`,JSON.stringify({status:'preview-only',description:'Put mobile sorting and a labelled Filters button in one row; keep full-width search',offsets,filterOpenCloseVerified:true},null,2)+'\n');
  return {offsets,file:await comparison(A.root,2)};
}

export async function slices(root,file,name,{height=844,width=300,columns=3,max=12}={}) {
  const m=await sharp(file).metadata();
  const count=Math.min(max,Math.ceil(m.height/height));
  const tiles=[];
  for(let i=0;i<count;i++) {
    const h=Math.min(height,m.height-i*height);
    const input=await sharp(file).extract({left:0,top:i*height,width:m.width,height:h}).resize({width}).extend({bottom:Math.round(height*width/m.width)-Math.round(h*width/m.width),background:'#ddd'}).toBuffer();
    tiles.push({input,left:(i%columns)*width,top:Math.floor(i/columns)*Math.round(height*width/m.width)});
  }
  const output=`${root}/screenshots/review-${name}.jpg`;
  await sharp({create:{width:columns*width,height:Math.ceil(count/columns)*Math.round(height*width/m.width),channels:3,background:'#ddd'}}).composite(tiles).jpeg({quality:88}).toFile(output);
  return output;
}
