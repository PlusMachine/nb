import { writeFile, mkdir } from 'node:fs/promises';

export const root = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
export const base = 'http://127.0.0.1:3018';

export function instrument() {
  window.__audit = { lcp: [], shifts: [], longtasks: [], events: [], errors: [] };
  const findHydratedMenu = () => {
    const button = document.querySelector('button[aria-label="Открыть меню"]');
    const key = button && Object.keys(button).find(key=>key.startsWith('__reactProps$'));
    if(key && typeof button[key]?.onClick === 'function') {window.__audit.menuInteractiveAt=performance.now();return;}
    if(performance.now()<30000) setTimeout(findHydratedMenu,25);
  };
  findHydratedMenu();
  const observe = (type, receive, extra = {}) => {
    try { new PerformanceObserver(list => list.getEntries().forEach(receive)).observe({type, buffered:true, ...extra}); } catch {}
  };
  observe('largest-contentful-paint', e => window.__audit.lcp.push({start:e.startTime, size:e.size, url:e.url, tag:e.element?.tagName, text:e.element?.textContent?.trim().slice(0,150)}));
  observe('layout-shift', e => window.__audit.shifts.push({start:e.startTime, value:e.value, recentInput:e.hadRecentInput, sources:e.sources?.map(s=>({tag:s.node?.tagName, text:s.node?.textContent?.trim().slice(0,80),previous:s.previousRect,current:s.currentRect}))}));
  observe('longtask', e => window.__audit.longtasks.push({start:e.startTime,duration:e.duration}));
  observe('event', e => window.__audit.events.push({name:e.name,start:e.startTime,duration:e.duration,processing:e.processingEnd-e.processingStart,delay:e.processingStart-e.startTime,interactionId:e.interactionId,tag:e.target?.tagName,text:e.target?.textContent?.trim().slice(0,70)}), {durationThreshold:16});
}

export async function collect(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource').map(e=>({name:new URL(e.name).pathname+new URL(e.name).search,type:e.initiatorType,start:e.startTime,duration:e.duration,transfer:e.transferSize,encoded:e.encodedBodySize,decoded:e.decodedBodySize}));
    const a = window.__audit || {lcp:[],shifts:[],longtasks:[],events:[]};
    let cls=0, score=0, first=0, last=0;
    for(const shift of a.shifts.filter(x=>!x.recentInput)) {
      if(shift.start-last>1000 || shift.start-first>5000) {score=shift.value;first=shift.start;} else score+=shift.value;
      last=shift.start;cls=Math.max(cls,score);
    }
    return {url:location.href,ttfbMs:nav?.responseStart,fcpMs:performance.getEntriesByName('first-contentful-paint')[0]?.startTime,lcpMs:a.lcp.at(-1)?.start,cls,domContentLoadedMs:nav?.domContentLoadedEventEnd,loadMs:nav?.loadEventEnd,htmlTransfer:nav?.transferSize,htmlDecoded:nav?.decodedBodySize,resourceTransfer:resources.reduce((n,r)=>n+r.transfer,0),resourceDecoded:resources.reduce((n,r)=>n+r.decoded,0),jsDecoded:resources.filter(x=>x.type==='script').reduce((n,r)=>n+r.decoded,0),domElements:document.querySelectorAll('*').length,incompleteImages:Array.from(document.images).filter(i=>!i.complete).map(i=>({src:i.currentSrc||i.src,top:i.getBoundingClientRect().top})),viewport:{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight},totalLongTaskBlockingMs:a.longtasks.reduce((n,e)=>n+Math.max(0,e.duration-50),0),...a,resources};
  });
}

export async function newSurface(browser, {mobile=false,slow=false,cookies=[],freshConsent=false}={}) {
  const context = await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,locale:'ru-RU',timezoneId:'Europe/Moscow',colorScheme:'light'});
  if(!freshConsent) await context.addCookies([{name:'nb_cookie_consent',value:'1:necessary',url:base},{name:'nb_age_ok',value:'1',url:base}]);
  if(cookies.length) await context.addCookies(cookies);
  await context.addInitScript(instrument);
  const page=await context.newPage();
  const cdp=await context.newCDPSession(page);
  if(slow) {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750});
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  }
  return {context,page,cdp};
}

export async function measure(browser,{name,path='/',mobile=false,slow=false,cookies=[],warm=false,shot=false,freshConsent=false}={}) {
  const {context,page}=await newSurface(browser,{mobile,slow,cookies,freshConsent});
  const errors=[];
  page.on('pageerror',e=>errors.push({type:'pageerror',message:e.message}));
  page.on('response',r=>{if(r.status()>=400) errors.push({type:'http',status:r.status(),url:r.url()});});
  let response, failure;
  try {
    response=await page.goto(base+path,{waitUntil:'load',timeout:90000});
    await page.waitForTimeout(2500);
    if(warm) {response=await page.reload({waitUntil:'load',timeout:90000});await page.waitForTimeout(2500);}
    await page.waitForFunction(()=>Array.from(document.images).filter(i=>{const r=i.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0;}).every(i=>i.complete),{},{timeout:45000}).catch(()=>{});
  } catch(e) {failure=e.message;}
  const result={name,path,mobile,slow,warm,freshConsent,status:response?.status(),cacheControl:response?.headers()['cache-control'],failure,...await collect(page),errors};
  await writeFile(`${root}/${name}.json`,JSON.stringify(result,null,2)+'\n');
  if(shot) await page.screenshot({path:`${root}/screenshots/${name}.png`,scale:'css',timeout:20000});
  await context.close();
  return {name,status:result.status,ttfb:Math.round(result.ttfbMs||0),fcp:Math.round(result.fcpMs||0),lcp:Math.round(result.lcpMs||0),menuInteractiveAt:Math.round(result.menuInteractiveAt||0),cls:Number(result.cls.toFixed(4)),longBlocking:Math.round(result.totalLongTaskBlockingMs),transferKB:Math.round((result.resourceTransfer+result.htmlTransfer)/1024),jsKB:Math.round(result.jsDecoded/1024),errors:errors.length,failure};
}
