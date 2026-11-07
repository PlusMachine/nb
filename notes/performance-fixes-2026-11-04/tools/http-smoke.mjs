import {readFile,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
const base='http://127.0.0.1:3018';
const sessions=JSON.parse(await readFile('/tmp/nb-perf-fixes-sessions-20261104.json','utf8'));
const routes=[['/',false],['/catalog',false],['/catalog/hops',false],['/recipes',false],['/bjcp',false],['/bjcp/bjcp-21a-american-ipa',false],['/calculators',false],['/calculators/abv-attenuation',false],['/articles',false],['/brewforge',false],['/market',false],['/app',true],['/app/recipes',true],['/app/ingredients',true],['/app/recipes/new',true],['/app/brew-batches',true],['/app/shopping',true],['/app/equipment',true],['/app/devices',true]];
const records=[];
for(const [path,authenticated] of routes) {
 const samples=[];
 for(let n=0;n<5;n++) {
  const started=performance.now();
  const response=await fetch(base+path,{headers:{Accept:'text/html',...(authenticated?{Cookie:'nb_session='+sessions[0].cookie.value}:{})},signal:AbortSignal.timeout(15000)});
  const ttfb=performance.now()-started;
  const body=await response.arrayBuffer();
  samples.push({status:response.status,ttfbMs:ttfb,totalMs:performance.now()-started,decodedBytes:body.byteLength});
 }
 const sorted=samples.map(s=>s.totalMs).sort((a,b)=>a-b);
 records.push({path,authenticated,p50Ms:sorted[2],maxMs:sorted[4],samples});
 console.log({path,p50Ms:Math.round(sorted[2]),maxMs:Math.round(sorted[4]),statuses:samples.map(s=>s.status)});
}
await writeFile(new URL('../http-smoke.json',import.meta.url),JSON.stringify({concurrency:1,scope:'HTML only; no browser resources; warmed local process',records},null,2)+'\n');
