const probes=[];
for(const profile of ['Desktop Safari','iPhone 13']){
 const c=await browser.newContext({...pw.devices[profile],acceptDownloads:true});
 await c.route('**/__download-probe/**',async route=>{const u=route.request().url();if(u.endsWith('/page'))await route.fulfill({contentType:'text/html',body:'<a href="/\x5f\x5fdownload-probe/file">Attachment</a><a download="test.png" href="/\x5f\x5fdownload-probe/file">Download attribute</a>'});else await route.fulfill({status:200,headers:{'Content-Type':'image/png','Content-Disposition':'attachment; filename="test.png"'},body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrZkAAAAASUVORK5CYII=','base64')});});
 for(const name of ['Attachment','Download attribute']){
  const p=await c.newPage();await p.goto(base+'/__download-probe/page');let d=null;p.on('download',event=>d=event);await p.getByRole('link',{name,exact:true}).click();await p.waitForTimeout(1500);const row={profile,name,download:!!d,url:p.url(),contentType:await p.evaluate(()=>document.contentType).catch(()=>null)};probes.push(row);console.log('PROBE',row);await p.close();
 }
 await c.close();
}
await fs.writeFile(out+'/download-probe.json',JSON.stringify(probes,null,2));
