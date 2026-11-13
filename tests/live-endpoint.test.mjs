import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/live-coach.ts";
const code="test-private-live-access-code-over-24-characters";
function response(){
  let statusCode=200,body;
  const res={
    setHeader(){},
    status(code){statusCode=code;return res;},
    json(value){body=value;},
  };
  return {res,get(){return {statusCode,body}}};
}
function request(accessCode=code){
  return {
    method:"POST",
    headers:{"x-ai-demo-code":accessCode},
    body:{
      transcript:"Our pitch introduces the problem and the proposed solution clearly to the audience.",
      section:"Intro",sectionElapsed:47,target:60,
      language:"en-US",outline:"",
      historyHints:["2 of 3 rehearsals over target"],
    },
  };
}
test("live model endpoint cannot bill by default",async()=>{
  delete process.env.AI_LIVE_MOCK;delete process.env.AI_LIVE_FEEDBACK_ENABLED;
  const r=response();await handler(request(),r.res);
  assert.equal(r.get().statusCode,503);
});
test("fake model can exercise the request schema without a provider key",async()=>{
  process.env.AI_LIVE_MOCK="true";
  process.env.AI_DEMO_ACCESS_CODE=code;
  delete process.env.DEEPSEEK_API_KEY;
  const invalid=response();await handler(request("wrong"),invalid.res);
  assert.equal(invalid.get().statusCode,403);
  const valid=response();await handler(request(),valid.res);
  assert.equal(valid.get().statusCode,200);
  assert.equal(valid.get().body.source,"mock");
  assert.match(valid.get().body.evidence,/Simulated/);
  delete process.env.AI_LIVE_MOCK;
});
