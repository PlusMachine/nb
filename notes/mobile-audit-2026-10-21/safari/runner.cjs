const readline=require('node:readline');global.fs=require('node:fs/promises');global.pw=require('playwright');global.base='http://127.0.0.1:3100';global.out='/home/dopefish/projects/nb/notes/mobile-audit-2026-10-21/safari';
process.on('unhandledRejection',e=>console.error('UNHANDLED',e.stack));
readline.createInterface({input:process.stdin}).on('line',async line=>{try{await fs.appendFile(out+'/commands.log',line+'\n');await(new(Object.getPrototypeOf(async()=>{}).constructor)(line))();console.log('DONE');}catch(e){console.error(e.stack);console.log('FAILED');}});console.log('READY');
