// Persistent Playwright console fallback when the app's js_repl cannot resolve a WSL cwd.
// Input: one JSON object per line, {"code":"..."}. Bind shared handles on globalThis.
import { createRequire } from "node:module";
const { chromium, expect: baseExpect } = createRequire(new URL("../../../apps/web/package.json",import.meta.url))("@playwright/test");
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { createInterface } from "node:readline";
globalThis.expect = baseExpect.configure({ timeout: 15000 });
globalThis.fixture = JSON.parse(await readFile("/tmp/nb-qa-persistence-20261103.json","utf8"));
globalThis.browser = await chromium.launch({headless:true});
globalThis.context = await browser.newContext({viewport:{width:1280,height:900},locale:"ru-RU",timezoneId:"Europe/Moscow"});
await context.addCookies([{name:"nb_session",value:fixture.tokens[0],url:"http://127.0.0.1:3000"},{name:"nb_cookie_consent",value:"1:necessary",url:"http://127.0.0.1:3000"}]);
globalThis.page = await context.newPage();
globalThis.base = "http://127.0.0.1:3000";
globalThis.artifactDir = new URL("../",import.meta.url).pathname;
globalThis.events = [];
globalThis.snap = async (name,p=page) => {
  await p.screenshot({path:artifactDir+"screenshots/"+name+".png",scale:"css"});
  await writeFile(artifactDir+name+".txt",await p.locator("body").innerText());
  console.log("SCREENSHOT",name);
};
context.on("page",p=>{p.setDefaultTimeout(20000);p.on("pageerror",e=>events.push({type:"pageerror",url:p.url(),message:e.message}));});
page.setDefaultTimeout(20000);
page.on("pageerror",e=>events.push({type:"pageerror",url:page.url(),message:e.message}));
console.log("READY");
for await (const line of createInterface({input:process.stdin,crlfDelay:Infinity})) {
  try {
    const input=JSON.parse(line);
    if(input.close){await writeFile(artifactDir+"browser-events.json",JSON.stringify(events,null,2));await browser.close();console.log("CLOSED");break;}
    await appendFile(artifactDir+"browser-actions.jsonl",line+"\n");
    const value=await eval(`(async()=>{${input.code}\n})()`);
    if(value!==undefined)console.log(JSON.stringify(value));
    console.log("DONE");
  } catch(error){console.log("ERROR",error.stack);}
}
