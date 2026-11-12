import { createHash, timingSafeEqual } from "node:crypto";

export type CoachRequest = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};

export type CoachResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): CoachResponse;
  json(value: unknown): void;
};

export function checkPilot(req: CoachRequest, res: CoachResponse, enabled: boolean): boolean {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "POST only." });
    return false;
  }

  const expected = process.env.AI_DEMO_ACCESS_CODE ?? "";
  if (!enabled || expected.length < 24) {
    res.status(503).json({ error: "Remote AI is unavailable in this deployment." });
    return false;
  }

  const actual = req.headers?.["x-ai-demo-code"];
  const hash = (value: string) => createHash("sha256").update(value).digest();
  if (typeof actual !== "string" || actual.length > 256 || !timingSafeEqual(hash(actual), hash(expected))) {
    res.status(403).json({ error: "Check the private preview access code." });
    return false;
  }
  return true;
}

export function readBody(body: unknown): Record<string, unknown> | null {
  try {
    const value = typeof body === "string" ? JSON.parse(body) : body;
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function gatewayToken() {
  return process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
}

export function coachModelReady() {
  return Boolean(process.env.DASHSCOPE_API_KEY || process.env.DEEPSEEK_API_KEY || gatewayToken());
}

export class CoachModelError extends Error {
  readonly providerStatus: number;

  constructor(providerStatus: number) {
    super("AI provider unavailable.");
    this.providerStatus = providerStatus;
  }
}

export async function coachJson({
  system, input, schema, maxTokens, timeout = 12_000,
}: {
  system: string;
  input: unknown;
  schema: Record<string, unknown>;
  maxTokens: number;
  timeout?: number;
}): Promise<Record<string, unknown>> {
  const dashscope = process.env.DASHSCOPE_API_KEY;
  const deepseek = process.env.DEEPSEEK_API_KEY;
  const token = dashscope || deepseek || gatewayToken();
  if (!token) throw new CoachModelError(503);

  const endpoint = dashscope
    ? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions"
    : deepseek ? "https://api.deepseek.com/chat/completions" : "https://ai-gateway.vercel.sh/v1/chat/completions";
  const modelOptions = dashscope ? { model: "qwen3.7-flash", enable_thinking: false }
    : deepseek ? { model: "deepseek-flash", thinking: { type: "disabled" } }
    : { model: process.env.AI_GATEWAY_MODEL || "alibaba/qwen3.7-flash", reasoning: { effort: "none" } };

  const response = await fetch(
    endpoint,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(timeout),
      body: JSON.stringify({
        ...modelOptions,
        max_tokens: maxTokens,
        temperature: 0.2,
        response_format: dashscope || deepseek
          ? { type: "json_object" }
          : { type: "json_schema", json_schema: { name: "coach_response", schema } },
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(input) },
        ],
      }),
    },
  );

  if (!response.ok) {
    // Retain only non-sensitive diagnostic metadata in the platform logs.
    let code: unknown;
    try {
      const failure = await response.json() as { error?: { code?: unknown; type?: unknown } };
      code = failure.error?.code ?? failure.error?.type;
    } catch {
      // Some upstream failures have no JSON body.
    }
    console.warn("Coach model request failed", response.status,
      typeof code === "string" && /^[a-z0-9_-]{1,64}$/i.test(code) ? code : "");
    throw new CoachModelError(response.status);
  }
  const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = readBody(result.choices?.[0]?.message?.content);
  if (!content) throw new CoachModelError(502);
  return content;
}

export function coachError(res: CoachResponse, error: unknown) {
  const providerStatus = error instanceof CoachModelError ? error.providerStatus : 502;
  if (providerStatus === 401 || providerStatus === 402 || providerStatus === 403) {
    return res.status(503).json({ error: "The model account needs activation or credits. The timer still works." });
  }
  if (providerStatus === 429) {
    return res.status(429).json({ error: "The model is busy. Try again in a moment." });
  }
  return res.status(502).json({ error: "AI feedback is temporarily unavailable. Try again." });
}
