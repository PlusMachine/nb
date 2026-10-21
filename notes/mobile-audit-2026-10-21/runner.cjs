process.on('unhandledRejection', e=>console.error('UNHANDLED',e.message));
const readline = require('node:readline');
global.fs = require('node:fs/promises');
global.pw = require('playwright');
global.out = '/home/dopefish/projects/nb/notes/mobile-audit-2026-10-21';
global.base = 'http://127.0.0.1:3000';
const rl = readline.createInterface({input:process.stdin});
rl.on('line', async line => {try {await fs.appendFile(out+'/commands.log',line+'\n');await (new (Object.getPrototypeOf(async()=>{}).constructor)(line))(); console.log('DONE');} catch(e) {console.error(e.stack);console.log('FAILED');}});
console.log('READY');
