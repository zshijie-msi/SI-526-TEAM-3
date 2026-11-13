# Sprint 4 AI Coach

## Preview

- In Setup, enter an overall time and open **Suggest sections with AI**. Set a target such as 3:00 or 5:00, then use the actual preview access code. Review the section purposes and durations before applying the plan.
- After Rehearse, select **Generate AI feedback**. Timing alone is sufficient. If you used the optional microphone or entered an outline, requesting feedback sends the resulting text with the timing.
- Use **Save rehearsal to history** to keep timing, estimated speaking pace, and generated feedback in this browser. Transcript storage is opt-in. In **Rehearsal history**, open a saved session to see those details.
- In Present, enable the microphone and **Optional live AI feedback** to request short cues. The preview limits requests per run. Quiet view pauses remote checks.
- In Vercel Environment Variables, reveal and copy the **Value** of `AI_DEMO_ACCESS_CODE`. The code stays in memory until the page is reloaded. Browser transcription and local rehearsal history do not depend on the text model. Browser transcription may use the browser vendor's service.

## Vercel configuration

Set these variables for the `feature/sprint-4` Preview branch.

| Variable | Preview value |
| --- | --- |
| `AI_FEEDBACK_ENABLED` | `true` |
| `VITE_AI_PAID_REVIEW_ENABLED` | `true` |
| `AI_LIVE_FEEDBACK_ENABLED` | `true` |
| `VITE_AI_LIVE_FEEDBACK_ENABLED` | `true` |
| `AI_LIVE_MAX_CALLS_PER_INSTANCE` | `24` |
| `AI_DEMO_ACCESS_CODE` | A private, randomly generated access code of at least 24 characters |

Redeploy the preview after changing these settings. Vercel's OIDC token authenticates the server to AI Gateway. The default model is `alibaba/qwen3.7-flash`. If using a direct provider, configure a server-only `DASHSCOPE_API_KEY` for Alibaba Model Studio (Singapore) or `DEEPSEEK_API_KEY` for DeepSeek. Direct provider configuration takes precedence. Never use a `VITE_` variable for a credential.

The optional Qwen real-time transcription relay is separate from the text integration. Its configuration is in [the relay environment example](../services/qwen-asr-relay/.env.example).

## Checks

Run `npm run build` and `node --experimental-strip-types --test tests/*.test.mjs`. The tests stub model calls. Use a short synthetic presentation to check the live preview after activation.
