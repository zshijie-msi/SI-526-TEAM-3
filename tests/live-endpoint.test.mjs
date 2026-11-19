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
      language:"en-US",
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

test("live model can draw a short cue from script and saved rehearsal before speech", async (t) => {
  process.env.AI_LIVE_FEEDBACK_ENABLED = "true";
  process.env.AI_LIVE_MAX_CALLS_PER_INSTANCE = "12";
  process.env.AI_GATEWAY_API_KEY = "test-key";
  t.after(() => {
    delete process.env.AI_LIVE_FEEDBACK_ENABLED;
    delete process.env.AI_LIVE_MAX_CALLS_PER_INSTANCE;
    delete process.env.AI_GATEWAY_API_KEY;
  });

  const script = "The control group received no reminder.";
  const req = request();
  req.body = {
    transcript: "", script, language: "en-US", section: "Study design", sectionElapsed: 1, target: 45,
    rehearsal: {
      attempts: [{ actualSeconds: 53, targetSeconds: 45, speechRate: 135, language: "en-US",
        transcript: "We ran the survey at noon." }],
      suggestions: ["Explain the control group."],
    },
  };
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const { messages } = JSON.parse(init.body);
    const input = JSON.parse(messages[1].content);
    assert.equal(input.script, script);
    assert.equal(input.transcript, "");
    assert.equal(input.rehearsal.attempts[0].transcriptExcerpt, "We ran the survey at noon.");
    assert.deepEqual(input.rehearsal.suggestions, ["Explain the control group."]);
    const cue = input.section === "Study design" ? "Mention the control group"
      : "Try to mention the control group before you move onto the next section";
    return Response.json({ choices: [{ message: { content: JSON.stringify({
      cue, confidence: "high", evidence: "Study design in script",
    }) } }] });
  });
  const valid = response();
  await handler(req, valid.res);
  assert.equal(valid.get().statusCode, 200);
  assert.equal(valid.get().body.cue, "Mention the control group");

  const verbose = response();
  await handler({ ...req, body: { ...req.body, section: "Data collection" } }, verbose.res);
  assert.equal(verbose.get().statusCode, 200);
  assert.equal(verbose.get().body.cue, "");
});
