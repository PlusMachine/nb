const readline=require('node:readline');
global.fs=require('node:fs/promises');
global.pw=require('playwright');
global.out='/home/dopefish/projects/nb/notes/copy-layout-audit-2026-10-23';
global.base='http://127.0.0.1:3010';
const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
let queue=Promise.resolve();
readline.createInterface({input:process.stdin}).on('line',line=>{
 queue=queue.then(async()=>{try{await new AsyncFunction(line)();console.log('COMMAND_DONE');}catch(e){console.error(e.stack);console.log('COMMAND_FAILED');}});
});
console.log('RUNNER_READY');
