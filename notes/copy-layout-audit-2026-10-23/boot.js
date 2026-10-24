global.browser=await pw.chromium.launch({headless:true});
global.errors=[];
global.contexts={};global.pages={};
for(const [name,cookies] of Object.entries({guest:[{name:'nb_dev_guest',value:'1'}],user:[],admin:[{name:'nb_dev_account',value:'qa.admin@localhost'}],deep:[{name:'nb_dev_account',value:'qa.deep.main.20261020@localhost'}]})){
 const c=await browser.newContext({viewport:{width:390,height:844},locale:'ru-RU',timezoneId:'Europe/Moscow',isMobile:true,hasTouch:true,colorScheme:'light'});
 await c.addCookies([...cookies,{name:'nb_cookie_consent',value:encodeURIComponent('1:necessary')},{name:'nb_age_ok',value:'1'}].map(x=>({...x,url:base})));
 const p=await c.newPage();p.on('pageerror',e=>errors.push({account:name,url:p.url(),message:e.message}));contexts[name]=c;pages[name]=p;
}
global.page=pages.user;
let response=await page.goto(base+'/app',{waitUntil:'domcontentloaded',timeout:60000});
await page.locator('h1').first().waitFor({timeout:30000});
console.log(JSON.stringify({status:response.status(),url:page.url(),headings:await page.locator('h1,h2').allTextContents(),links:(await page.locator('a[href^="/app/recipes/"],a[href^="/app/brew-batches/"]').evaluateAll(es=>es.map(e=>e.getAttribute('href')))).slice(0,20)}));
