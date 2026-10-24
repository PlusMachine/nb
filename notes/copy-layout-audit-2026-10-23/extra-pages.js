await captureState(pages.user,'inventory_price_dates');
await pages.user.keyboard.press('Escape');
const routes=[
 ['guest','/labels'],['guest','/articles'],['guest','/login'],['guest','/offline'],
 ['guest','/catalog/system/iodophor-sanitizer'],['guest','/catalog/consumables'],['guest','/catalog/water'],
 ['guest','/beer/pilsner-urquell'],['guest','/beer/sample-american-stout'],['guest','/beer/bell-s-two-hearted-ale'],
 ['admin','/admin/ingredients/apricot-frukty-ovoschi'],['admin','/admin/ingredients/de-amarillo-standard'],
 ['user','/app/devices/722d0409-72d1-4dee-8da3-bb7f3795d369'],
 ['user','/app/devices/722d0409-72d1-4dee-8da3-bb7f3795d369/settings']
];
for(const [role,route] of routes){const p=pages[role];try{const response=await p.goto(base+route,{waitUntil:'domcontentloaded',timeout:90000});await p.locator('h1').first().waitFor({timeout:15000});await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(300);if(response.status()!==200)throw Error('HTTP '+response.status());await captureState(p,role+route);stateChecks.push({key:route,pass:true});}catch(e){stateChecks.push({key:route,error:e.message});console.log('EXTRA_ERROR',route,e.message.slice(0,150));}await fs.writeFile(out+'/checks.json',JSON.stringify(stateChecks,null,2));}
console.log('EXTRA_PAGES_DONE');
