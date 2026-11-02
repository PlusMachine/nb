const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const assert=require('assert/strict');
// Coverage: each decision and reversal, per-proposal comments, navigation, persisted
// browser reload, full report and copying, notes without a proposal, unsafe text,
// long state budget, narrow views, and the unchanged side-by-side comparison.
(async()=>{
 const b=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
 const ctx=await b.newContext({viewport:{width:1080,height:1250},permissions:['clipboard-read','clipboard-write']});const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:8774/preview.html');const f=p.frameLocator('iframe');await f.locator('#precise-picker').waitFor();
 const choose=async slug=>f.locator('#precise-picker').selectOption(slug);
 const button=status=>f.locator('[data-decision="'+status+'"]');
 assert.match(await f.locator('#precise-review-count').innerText(),/0 из 8/);
 await button('accepted').click();assert.equal(await button('accepted').getAttribute('aria-pressed'),'true');
 await f.locator('#precise-comment').fill('Берём. Подсказку оставить рядом с результатом.');
 await f.locator('#precise-next').click();assert.equal(await f.locator('#precise-proposal-code').innerText(),'П02');assert.equal(await f.locator('#precise-comment').inputValue(),'');
 await button('rejected').click();await f.locator('#precise-comment').fill('Эту правку пока не делать.');
 await choose('water-ph');await button('revise').click();await f.locator('#precise-comment').fill('Написать «Кислота в затор», объём вынести в подсказку.');
 await choose('abv-attenuation');assert.equal(await button('accepted').getAttribute('aria-pressed'),'true');assert.match(await f.locator('#precise-comment').inputValue(),/Берём/);
 await button('rejected').click();await f.locator('#precise-decision-clear').click();assert.equal(await f.locator('#precise-decision-status').innerText(),'Без решения');assert.match(await f.locator('#precise-comment').inputValue(),/Берём/);await button('accepted').click();
 await choose('refractometer-correction');assert.equal(await f.locator('#precise-decision-actions').isVisible(),false);
 const unusual='<b>Не менять НП и КП</b> & сохранить термин';await f.locator('#precise-comment').fill(unusual);
 await f.locator('#precise-summary-toggle').click();assert.match(await f.locator('#precise-summary-counts').innerText(),/Принято: 1 · Отклонено: 1 · На доработку: 1 · Без решения: 5/);
 const report=await f.locator('#precise-report').inputValue();assert.match(report,/П01/);assert.match(report,/П02/);assert.match(report,/Кислота в затор/);assert.ok(report.includes(unusual));assert.match(report,/Пункты без решения не согласованы/);
 assert.equal(await f.locator('#precise-summary-list b').count(),0);
 await f.locator('#precise-copy-report').click();const copyStatus=await f.locator('#precise-copy-status').innerText();assert.match(copyStatus,/Скопировано|Нажмите Ctrl\+C/);
 if(copyStatus.startsWith('Скопировано'))assert.equal(await p.evaluate(()=>navigator.clipboard.readText()),report);
 await f.locator('[data-review-open="water-ph"]').click();assert.equal(await button('revise').getAttribute('aria-pressed'),'true');assert.match(await f.locator('#precise-comment').inputValue(),/подсказку/);
 await f.locator('#precise-save-status').filter({hasText:'Сохранено'}).waitFor();
 await p.reload();await f.locator('#precise-picker').waitFor();assert.equal(await f.locator('#precise-picker').inputValue(),'water-ph');assert.equal(await button('revise').getAttribute('aria-pressed'),'true');assert.match(await f.locator('#precise-comment').inputValue(),/подсказку/);assert.match(await f.locator('#precise-review-count').innerText(),/3 из 8/);
 await choose('abv-attenuation');assert.match(await f.locator('#precise-comment').inputValue(),/Берём/);
 const before=await f.locator('#precise-before').boundingBox(),after=await f.locator('#precise-after').boundingBox();assert.ok(after.x>before.x);assert.ok(Math.abs(after.y-before.y)<1);
 await p.screenshot({path:path.join(__dirname,'decisions-desktop.png'),fullPage:true});
 await f.locator('#precise-summary-toggle').click();await p.screenshot({path:path.join(__dirname,'decisions-summary.png'),fullPage:true});
 for(const width of [390,320]){
  await p.setViewportSize({width,height:1000});
  let w=await f.locator('#nb-precise-review').evaluate(e=>({w:e.clientWidth,s:e.scrollWidth}));assert.ok(w.s<=w.w+1,'Summary overflow');
  await f.locator('#precise-summary-toggle').click();w=await f.locator('#nb-precise-review').evaluate(e=>({w:e.clientWidth,s:e.scrollWidth}));assert.ok(w.s<=w.w+1,'Review overflow');
  if(width===320)await p.screenshot({path:path.join(__dirname,'decisions-mobile.png'),fullPage:true});
  await f.locator('#precise-summary-toggle').click();
 }
 const data=require('./proposals.json');const decisions=Object.fromEntries(data.map(c=>[c.id,{status:c.patch?'accepted':'pending',comment:'漢'.repeat(c.patch?300:150)}]));
 const bytes=Buffer.byteLength(JSON.stringify({modelContent:{reviewVersion:3,calculator:'abv-attenuation',proposal:'abv-empty',decisions},privateContent:null}));assert.ok(bytes<16384,'State too large: '+bytes);
 assert.equal(errors.length,0,errors.join(';'));
 fs.writeFileSync(path.join(__dirname,'decisions-verification.json'),JSON.stringify({checks:['three decisions and clear','separate comments across navigation','notes without a proposal','report includes pending decisions and exact comments','copy or selected-text fallback','browser reload restores all decisions','comparison remains aligned','desktop and 320/390 layouts','comments render as plain text'],clipboard:copyStatus,maxSnapshotBytes:bytes,pageErrors:errors},null,2));
 console.log('PASS: decisions, comments, persistence after reload, report, clipboard, narrow views; max state '+bytes+' bytes');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1)});
