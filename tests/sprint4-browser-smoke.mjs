import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

const origin="http://127.0.0.1:5173";
// Start Vite directly instead of spawning npm (which would leave a child
// process with open inherited pipes and hang the CI browser test indefinitely).
const server=spawn(process.execPath,["node_modules/vite/bin/vite.js","--host","127.0.0.1","--port","5173"],{
  stdio:"ignore",env:{...process.env,PORT:"5173",VITE_AI_PAID_REVIEW_ENABLED:"true"},
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
  page.setDefaultTimeout(8000);
  console.log("E2E: Vite ready, Chromium launched");
  const previewCode = "test-private-preview-access-code";
  const errors=[];
  const modelCalls=[];
  page.on("pageerror",err=>errors.push(err.message));
  page.on("request",req=>{if(req.url().includes("/api/"))modelCalls.push(req.url())});
  await page.route("**/api/section-plan", async (route) => {
    assert.equal(route.request().headers()["x-ai-demo-code"], previewCode);
    assert.equal(route.request().postDataJSON().targetSeconds, 180);
    await route.fulfill({ json: {
      sections: [
        { name: "Intro", seconds: 60, purpose: "", existingIndex: 0 },
        { name: "Main idea", seconds: 120, purpose: "Explain the main idea.", existingIndex: null },
      ],
      replacesExisting: false,
    } });
  });
  await page.route("**/api/ai-feedback", async (route) => {
    assert.equal(route.request().headers()["x-ai-demo-code"], previewCode);
    await route.fulfill({ json: { summary: "Intro ran short.", nextSteps: ["Add one example."] } });
  });
  await page.goto(origin);
  console.log("E2E: home loaded");
  await page.getByRole("button",{name:/Individual/i}).first().click();
  console.log("E2E: individual library");
  await page.getByRole("button",{name:/Start new presentation/i}).click();
  await page.getByRole("textbox", { name: "Presentation title" }).fill("Sprint 4 AI Smoke Test");
  await page.getByLabel(/overall.*minutes/i).fill("3");
  await page.getByText("Suggest sections with AI", { exact: true }).click();
  const access = page.getByLabel("Private preview access code", { exact: true });
  const generate = page.getByRole("button", { name: "Generate section plan" });
  assert.equal(await page.getByRole("link", { name: "Open Vercel settings" }).count(), 0);
  assert.equal(await access.getAttribute("placeholder"), null);
  await access.fill("AI_DEMO_ACCESS_CODE");
  assert.equal(await generate.isEnabled(), false);
  await page.getByText("Enter the code value.", { exact: true }).waitFor();
  await access.fill(previewCode);
  await generate.click();
  await page.getByRole("heading", { name: "Suggested plan · 3:00" }).waitFor();
  await page.getByRole("button", { name: "Apply section plan" }).click();
  await page.getByRole("button", { name: "Delete Main idea" }).click();
  await page.getByLabel(/overall.*minutes/i).fill("");
  await page.getByRole("button",{name:/Review presentation/i}).click();
  console.log("E2E: Ready loaded");
  assert.ok((await page.locator(".history-panel").innerText()).includes("No saved rehearsals"));

  await page.locator(".speech-coach-notes summary").click();
  await page.locator("#sprint4-ai-outline").fill("Intro: explain the main problem");
  const run=async(i)=>{
    console.log("E2E: rehearsal "+i+" starting");
    await page.getByRole("button",{name:/Rehearse/i}).first().click();
    await page.getByRole("button",{name:/Speech Coach/i}).first().click();
    await page.getByRole("button",{name:/Enable microphone/i}).click();
    await sleep(900);
    await page.getByRole("button",{name:"Finish",exact:true}).click();
    console.log("E2E: rehearsal "+i+" finished");
    const copy = await page.locator("body").innerText();
    assert.doesNotMatch(copy, /Sends section timing|This is a local-only record|Your saved runs are used|Save setup only stores|Save setup keeps/);
    assert.ok((await page.locator("body").innerText()).includes("Speaking pace"),"Missing speech coach report in rehearsal "+i);
    if (i === 1) {
      await page.getByRole("button", { name: "Generate AI feedback" }).click();
      await page.getByText("Add one example.", { exact: true }).waitFor();
    }
    await page.getByRole("button",{name:/Save rehearsal to history/i}).click();
    const records=await page.evaluate(()=>JSON.parse(localStorage.getItem("tick-tock-ai-rehearsal-history-v1")||"[]"));
    assert.equal(records.length,i,"Wrong saved rehearsal count");
    assert.ok(records.every(r=>!r.transcriptSaved),"Transcript must be opt-in");
    if (i === 1) {
      assert.equal(records[0].feedback.nextSteps[0], "Add one example.");
      await page.getByRole("button", { name: "View history" }).click();
      const savedSession = page.locator(".history-runs > details > summary").first();
      await savedSession.click();
      await page.locator(".history-saved-feedback").getByText("Add one example.").waitFor();
    } else {
      assert.equal(records[0].feedback, undefined, "A new run must not inherit the previous feedback");
    }
    await page.getByRole("button",{name:/Adjust setup/i}).click();
    await page.getByRole("button",{name:/Review presentation/i}).click();
  };
  await run(1);await run(2);
  console.log("E2E: two history saves completed");
  assert.ok((await page.locator(".history-panel").innerText()).includes("2 saved runs"));
  await page.getByRole("button",{name:/^Present/i}).first().click();
  console.log("E2E: presentation setup opened");
  await page.getByRole("button",{name:"Start",exact:true}).click();
  await page.locator(".present-history-hint").waitFor({timeout:2000});
  assert.match(await page.locator(".present-history-hint").innerText(),/Rehearsal reminder/);
  const extra=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert.ok(extra<=1,"Horizontal overflow: "+extra);
  assert.deepEqual(errors,[],"React/browser page errors");
  assert.deepEqual(modelCalls.map(url => new URL(url).pathname), ["/api/section-plan", "/api/ai-feedback"]);
  console.log("SPRINT4 BROWSER SMOKE PASSED: section plan, saved AI feedback, Present history hint and 390px layout");
}catch(err){
  console.error("E2E FAILURE:",err);
  throw err;
}finally{
  await browser?.close();
  server.kill("SIGTERM");
}
