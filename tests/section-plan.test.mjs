import test from "node:test";
import assert from "node:assert/strict";
import sectionPlan from "../api/section-plan.ts";
import rehearsalFeedback from "../api/ai-feedback.ts";

const accessCode = "test-code-for-privately-testing-coaching";
function response() {
  const result = {};
  const res = {
    setHeader() {},
    status(status) { result.status = status; return res; },
    json(body) { result.body = body; },
  };
  return { res, result };
}

async function post(handler, body, code = accessCode) {
  const { res, result } = response();
  await handler({ method: "POST", headers: { "x-ai-demo-code": code }, body }, res);
  return result;
}

test("the five-minute flow validates the time budget and never calls a model without preview access", async (t) => {
  process.env.AI_FEEDBACK_ENABLED = "true";
  process.env.AI_DEMO_ACCESS_CODE = accessCode;
  process.env.AI_GATEWAY_API_KEY = "test-key";
  t.after(() => {
    delete process.env.AI_FEEDBACK_ENABLED;
    delete process.env.AI_DEMO_ACCESS_CODE;
    delete process.env.AI_GATEWAY_API_KEY;
  });

  const providerRequests = [];
  let plan = [
    { name: "Main point", purpose: "Explain your main point.", seconds: 180 },
    { name: "Close", purpose: "Summarize your takeaway.", seconds: 60 },
  ];
  t.mock.method(globalThis, "fetch", async (url, request) => {
    assert.equal(url, "https://ai-gateway.vercel.sh/v1/chat/completions");
    const body = JSON.parse(request.body);
    assert.equal(body.model, "alibaba/qwen3.7-flash");
    assert.equal(body.reasoning.effort, "none");
    assert.equal(body.response_format.type, "json_schema");
    const input = JSON.parse(body.messages[1].content);
    providerRequests.push(input);
    const content = input.sections?.[0]?.actualSeconds
      ? { summary: "Intro ran 15 seconds long.", nextSteps: ["Cut one detail from Intro."] }
      : { sections: plan };
    return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
  });

  const input = { targetSeconds: 300, title: "", sections: [{ name: "Intro", seconds: 60 }] };
  assert.equal((await post(sectionPlan, input, "wrong")).status, 403);
  assert.equal(providerRequests.length, 0);

  const result = await post(sectionPlan, input);
  assert.equal(result.status, 200);
  assert.equal(result.body.sections[0].existingIndex, 0);
  assert.equal(providerRequests[0].secondsToAllocate, 240);
  assert.equal(result.body.sections.reduce((sum, item) => sum + item.seconds, 0), 300);

  plan = [{ name: "Main point", purpose: "Explain the idea.", seconds: 299 }];
  assert.equal((await post(sectionPlan, { ...input, sections: [] })).status, 502);
  assert.equal(providerRequests[1].secondsToAllocate, 300);

  const timingOnly = await post(rehearsalFeedback, {
    transcript: "", outline: "", sections: [{ name: "Intro", actual: 75, target: 60 }],
  });
  assert.equal(timingOnly.status, 200);
  assert.equal(providerRequests[2].transcript, null);
  assert.deepEqual(timingOnly.body.nextSteps, ["Cut one detail from Intro."]);
});
