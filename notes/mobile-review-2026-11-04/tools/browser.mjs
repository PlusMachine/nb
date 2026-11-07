import { chromium, webkit } from 'playwright';
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

export const root = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
export const base = 'http://127.0.0.1:3104';
export const browser = await chromium.launch({ headless: true });
export const contexts = {};
export const pages = {};
export const progress = { results: [], current: null, done: false };
const sessions=JSON.parse(await readFile('/tmp/nb-mobile-review-sessions.json','utf8'));
export async function surface(role = 'user') {
  if (!contexts[role]) {
    contexts[role] = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light' });
    const cookies = [{name:'nb_cookie_consent',value:'1:necessary',url:base},{name:'nb_age_ok',value:'1',url:base},{name:'nb_theme',value:'light',url:base}];
    if (role !== 'guest') cookies.push(sessions.find(s=>s.email===(role==='admin'?'qa.admin@localhost':'qa.mobile.20261021@localhost')).cookie);
    await contexts[role].addCookies(cookies);
    pages[role] = await contexts[role].newPage();
    pages[role].setDefaultTimeout(15000);
    pages[role].on('pageerror', e => progress.results.push({route:pages[role].url(),pageerror:e.message}));
  }
  return pages[role];
}
export async function open(route, role = 'user', width = 390, height = 844) {
  const page = await surface(role);
  await page.setViewportSize({ width, height });
  const response = await page.goto(base + route, {waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(() => !history.pushState.toString().includes('[native code]'), {}, {timeout:45000});
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({content:'nextjs-portal { display: none !important; }'});
  if(route.endsWith('/edit')&&route.includes('/app/recipes/')) {
    await page.getByTestId('recipe-toolbar').waitFor({timeout:45000});
    await page.waitForFunction(()=>document.querySelector('dl[aria-busy]')?.getAttribute('aria-busy')==='false',{}, {timeout:45000});
  }
  if(route==='/labels'||route.endsWith('/labels')) await page.getByRole('img',{name:/Предпросмотр этикетки/}).waitFor({timeout:30000});
  await page.waitForTimeout(500);
  return {page,status:response?.status()};
}
export async function metrics(page) {
  return page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1)}; };
    const visible = el => {const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
    const describe = el => ({tag:el.tagName,text:(el.getAttribute('aria-label')||el.textContent||el.getAttribute('placeholder')||'').trim().slice(0,100),...rect(el),classes:String(el.className).slice(0,170)});
    const controls = [...document.querySelectorAll('button,a,input,select,textarea,[role="tab"],[role="radio"]')].filter(visible);
    const outside = [...document.querySelectorAll('main *,[role="dialog"] *')].filter(visible).filter(el=>{const r=el.getBoundingClientRect();return (r.right>innerWidth+1||r.left< -1)&&r.width>2;}).slice(0,25).map(describe);
    const clippedText=[...document.querySelectorAll('h1,h2,h3,label,button,[role="tab"]')].filter(visible).filter(el=>el.scrollWidth>el.clientWidth+2&&getComputedStyle(el).overflowX!=='visible').map(describe);
    return {url:location.pathname+location.search,width:innerWidth,height:innerHeight,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,headings:[...document.querySelectorAll('h1,h2,h3')].filter(visible).map(el=>({text:el.textContent.trim(),...rect(el)})),outside,clippedText,smallControls:controls.filter(el=>{const r=el.getBoundingClientRect();return r.width<24||r.height<24;}).slice(0,30).map(describe),smallInputs:controls.filter(el=>['INPUT','SELECT','TEXTAREA'].includes(el.tagName)&&parseFloat(getComputedStyle(el).fontSize)<16).slice(0,15).map(el=>({...describe(el),font:getComputedStyle(el).fontSize})),fixed:[...document.querySelectorAll('body *')].filter(visible).filter(el=>['fixed','sticky'].includes(getComputedStyle(el).position)).slice(0,20).map(describe)};
  });
}
export async function shot(name,page,{fullPage=false}={}) {
  const file = `${root}/screenshots/${name}.png`;
  await page.screenshot({path:file,fullPage,scale:'css',animations:'disabled',timeout:30000});
  return file;
}
export async function scan(routes,{role='user',width=390,height=844,prefix='baseline'}={}) {
  progress.done=false;
  for (const route of routes) {
    progress.current=route;
    try {
      const {page,status}=await open(route,role,width,height);
      const name=`${prefix}-${role}-${route.replace(/[^a-zA-Z0-9]+/g,'_')||'home'}-${width}`;
      const result={route,role,status,server:'isolated-production-snapshot-18:13',...await metrics(page),screenshot:await shot(name,page),full:await shot(name+'-full',page,{fullPage:true})};
      progress.results.push(result);
    } catch(e) { progress.results.push({route,role,error:e.message}); }
    await writeFile(`${root}/scan.json`,JSON.stringify(progress.results,null,2)+'\n');
  }
  progress.done=true;progress.current=null;
  return {count:progress.results.length,errors:progress.results.filter(r=>r.error||r.pageerror),overflow:progress.results.filter(r=>r.scroll>r.width)};
}
export async function sheet(names,name='contact', {columns=4, width=300,height=650}={}) {
  const tiles=await Promise.all(names.map(async(file,i)=>({input:await sharp(file).resize(width,height,{fit:'contain',background:'#e8e8e8',position:'top'}).toBuffer(),left:(i%columns)*width,top:Math.floor(i/columns)*height})));
  const file=`${root}/screenshots/${name}.jpg`;
  await sharp({create:{width:columns*width,height:Math.ceil(tiles.length/columns)*height,channels:3,background:'#dedede'}}).composite(tiles).jpeg({quality:88}).toFile(file);
  return file;
}
