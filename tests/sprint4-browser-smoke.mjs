import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

const origin="http://127.0.0.1:5173";
const server=spawn("npm",["run","dev","--","--host","127.0.0.1"],{
  stdio:"pipe",env:{...process.env,PORT:"5173"},
});
let browser;
try{
  let ready=false;
  for(let i=0;i<45;i++){
    try {const r=await fetch(origin);if(r.ok){ready=true;break}}catch{}
    await sleep(500);
  }
  assert.ok(ready,"Vite development server did not start");
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  const context=await browser.newContext({viewport:{width:390,height:844},permissions:["microphone"]});
  await context.addInitScript(()=>{
    class MockSpeechRecognition {
      constructor(){this.lang="en-US";this.onresult=null;this.onend=null;this.onerror=null;this.timer=null;}
      start(){this.timer=setTimeout(()=>this.onresult?.({
        resultIndex:0,results:[{isFinal:true,0:{transcript:"Hello everyone this is a short presentation about our school project."}}],
      }),350)}
      stop(){clearTimeout(this.timer);this.onend?.();}
    }
    window.SpeechRecognition=MockSpeechRecognition;
    window.webkitSpeechRecognition=MockSpeechRecognition;
  });
  const page=await context.newPage();
  const errors=[];
  const modelCalls=[];
  page.on("pageerror",err=>errors.push(err.message));
  page.on("request",req=>{if(req.url().includes("/api/"))modelCalls.push(req.url())});
  await page.goto(origin);
  await page.getByRole("button",{name:/Individual/i}).first().click();
  await page.getByRole("button",{name:/Start new presentation/i}).click();
  await page.getByPlaceholder("e.g. Final pitch").fill("Sprint 4 AI Smoke Test");
  await page.getByRole("button",{name:/Review presentation/i}).click();
  assert.ok((await page.locator(".history-panel").innerText()).includes("No rehearsal history saved"));

  await page.locator(".speech-coach-notes summary").click();
  await page.locator("#sprint4-ai-outline").fill("Intro: explain the main problem");
  const run=async(i)=>{
    await page.getByRole("button",{name:/Rehearse/i}).first().click();
    await page.getByRole("button",{name:/Speech Coach/i}).first().click();
    await page.getByRole("button",{name:/Enable microphone/i}).click();
    await sleep(900);
    await page.getByRole("button",{name:"Finish",exact:true}).click();
    assert.ok((await page.locator("body").innerText()).includes("Speaking pace"),"Missing speech coach report in rehearsal "+i);
    await page.getByRole("button",{name:/Save rehearsal to history/i}).click();
    const records=await page.evaluate(()=>JSON.parse(localStorage.getItem("tick-tock-ai-rehearsal-history-v1")||"[]"));
    assert.equal(records.length,i,"Wrong saved rehearsal count");
    assert.ok(records.every(r=>!r.transcriptSaved),"Transcript must be opt-in");
    await page.getByRole("button",{name:/Adjust setup/i}).click();
    await page.getByRole("button",{name:/Review presentation/i}).click();
  };
  await run(1);await run(2);
  assert.ok((await page.locator(".history-panel").innerText()).includes("2 saved runs"));
  await page.getByRole("button",{name:/^Present/i}).first().click();
  await page.getByRole("button",{name:"Start",exact:true}).click();
  await page.locator(".present-history-hint").waitFor({timeout:2000});
  assert.match(await page.locator(".present-history-hint").innerText(),/rehearsals/i);
  const extra=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert.ok(extra<=1,"Horizontal overflow: "+extra);
  assert.deepEqual(errors,[],"React/browser page errors");
  assert.deepEqual(modelCalls,[],"Unexpected paid API request");
  console.log("SPRINT4 BROWSER SMOKE PASSED: 2 real flow saves, Present history hint, 390px layout, zero API requests");
}finally{
  await browser?.close();
  server.kill("SIGTERM");
}
