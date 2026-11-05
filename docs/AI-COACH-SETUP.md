# Tick-Tock Speech Coach — pilot integration

## What is ready without paying for an API

The pilot is based on \`feature/zihe-usability-welcome\`, not the old \`main\`.

1. Rehearse and Present both have an **optional, collapsed Speech Coach**.
2. The user opens it and explicitly clicks **Enable microphone**.
3. Browser SpeechRecognition offers a **manual language selector**: English, Simplified/Traditional Chinese, Spanish and French. Browser recognition quality and language availability vary. On some browsers this happens through a browser-vendor online speech service (not local/offline).
4. A deterministic pacing engine estimates words per minute for English and approximate character/word units per minute for Chinese, shows brief cues,
   and summarizes recognized speech by active section. It uses the timer's
   measured active duration. No generative model is involved.
5. Rehearse and Present result screens show a section-level pace report
   **only if speech was actually captured**.
6. No raw audio is recorded by Tick-Tock and no transcript is saved to
   localStorage or sent to our own server in this pilot.
7. Turning off the mic or pausing stops speech recognition. Timer controls
   continue working with the microphone off.
8. \`npm run typecheck\`, \`npm run build\`, and the test file in
   \`tests/metrics.test.mjs\` are checked in GitHub Actions.

## Limitations / avoid false claims

- SpeechRecognition is not available across all browsers; Chrome/Edge are best
  for initial desktop tests. It can use an external recognition service.
- Browser speech results may be late, incomplete or duplicated after restarts.
  The English WPM and Chinese character/word units per minute are rough estimates, not graded speech quality.
- Per-speaker grouping follows the manually selected presentation **section**,
  not voice identification; overlapping speakers are not separated.
- The transcript is not recorded audio and cannot verify pronunciation,
  confidence, emotion, filler-word frequencies or pauses reliably.
- No comparison with historical rehearsal recordings, AI transcript scoring,
  user identity verification, or true live semantic understanding yet.
- Without an outline, the pilot can give timing and WPM only. Never claim
  content coverage when no script/outline was supplied.

## Recommended production architecture (after approval)

Browser mic (user consent) → secure server-side WebSocket relay →
Alibaba Cloud Model Studio \`qwen3-asr-flash-realtime\` →
time-stamped transcript + Tick-Tock section timer →
low-noise local live cues; after a rehearsal, optional
\`deepseek-flash\` text feedback through a server-side HTTPS function.

- **No API key in Vite \`VITE_*\` variables**: Vite exposes them to clients.
- Provider keys must live only in Vercel server-side environment variables.
- For Qwen real-time WebSocket, use a **persistent relay** or a provider-
  sanctioned short-lived token; do not connect directly with a long-lived
  provider key in the browser. Ordinary Vercel request/response functions
  are not a reliable long-lived WebSocket relay.
- Add server authentication, quotas/rate limiting, budget alerts, and
  minimum retention/privacy disclosures before public paid deployment.
- Require an explicit user action before remote AI analysis, and show that
  transcript text will leave the browser.
- Do not enable any provider billing or auto-call from this branch.

## Cost notes — verify provider dashboard before buying

As of November 2026, Alibaba's international realtime ASR list price is
about **US$0.00009 per audio second** (about **$0.0054/min**), with a
region- and eligibility-dependent trial quota. Check the region and
free-quota expiry before use; do not assume the account has free credit.

Official docs:
- https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- https://www.alibabacloud.com/help/en/model-studio/qwen3-asr-flash-realtime
- https://www.alibabacloud.com/help/en/model-studio/qwen-asr-realtime-interaction-process
- https://api-docs.deepseek.com/quick/_start/pricing/
- https://vercel.com/docs/environment-variables

## Team test instructions

1. Open the branch preview with a supported desktop browser over HTTPS.
2. Create a short 2-section Individual or Group presentation.
3. Start Rehearse, open Speech Coach, and select Enable microphone.
4. Speak naturally for 20–30 seconds; move to the next section.
5. Pause and resume. Confirm the mic stops on pause and timing does not reset.
6. Finish and inspect the transcript, WPM and section-level summary.
7. Repeat for Present. Confirm the coach stays collapsed until opened.
8. Deny mic permission and try an unsupported browser. The timer must keep working.
9. Refresh or start a new run. Previously captured speech must not reappear.
10. Ask PM/UX for a real usability test before deciding if live cues help.

## Before activating a paid API

Explicitly ask the project owner for:
- permission for usage charges and a hard budget/cap;
- chosen provider, billing region, data-processing policy, language coverage;
- secure API-key setup in server-side Vercel Environment Variables;
- public beta access control and rate limits.

Never paste API keys into GitHub, chats, browser code or Vite env variables.


## Optional outline and gated DeepSeek review (prepared, not activated)

- The **Ready** screen includes a collapsed optional outline/script field.
  An outline is saved with the presentation only when the user clicks Save.
  The free report explicitly does not claim semantic coverage analysis.
- \`api/ai-feedback.ts\` provides a server-only, text-based review adapter for
  \`deepseek-flash\` over the official chat completions endpoint.
- **By default it returns HTTP 503 without calling any provider.**
- The client review form is hidden unless \`VITE_AI_PAID_REVIEW_ENABLED=true\`.
- Even then, the server requires ALL of:
  \`AI_FEEDBACK_ENABLED=true\`, \`DEEPSEEK_API_KEY\` (server-only), and
  \`AI_DEMO_ACCESS_CODE\` (a private, long 24+ character code).
- The user must enter the access code and explicitly click a button labeled
  **Generate AI feedback (may incur charges)** to send the transcript, outline,
  and timing metrics; **raw audio is never sent to DeepSeek**.
- \`.env.example\` documents the flags; \`.gitignore\` excludes local secrets.
- These gates are a **private pilot**, not production-grade authorization.
  Do not turn on the paid endpoint on a public site without persistent
  rate limits, spend caps, usage visibility, consent and a retention policy.


## 2026-11-05 — Multilingual free-mode update & next realtime stage

The no-cost browser prototype can select English (\`en-US\`), Mandarin simplified
(\`zh-CN\`), Mandarin traditional (\`zh-TW\`), Spanish (\`es-ES\`) or French
(\`fr-FR\`) **before** enabling the microphone. The language is locked once
speech has been captured in a run to avoid mixing incompatible rate scales.
Browser Web Speech API availability and language accuracy are not guaranteed.
This **does not auto-detect** a speaker switching languages.

For Chinese, whitespace-based English WPM is invalid. The prototype uses
Han character counts plus any Latin-language words and labels the combined rate
**approximate units/min**; English uses estimated WPM. Only English-specific
high/low WPM suggestions apply to \`en-US\`. Chapter deadline cues work in all
languages; Chinese section cues are shown in Chinese.

### Future true realtime multilingual analysis (requires provider approval)

Audio in consented browser session → streaming ASR with partial transcript
deltas → (A) instant deterministic timing and non-blocking pace cues,
(B) an async low-latency language-model evaluator triggered every few
seconds or by completed section. The evaluator should never hold up the
live timer or force the user to wait in the interface. Suppress duplicate,
low-confidence, overly frequent, or late cues.

OpenAI API supports \`gpt-live-transcribe\` realtime transcript deltas and
\`languages: ["en", "zh-cn"]\` context for expected languages, but this
is a separate paid API service, **not the current ChatGPT conversation**.
An OpenAI language model may analyze the incremental text/outline alongside
live timing in a second async path. Testing must include English, Mandarin,
mixed-language speech, accents, background noise, interruptions, and latency.

No OpenAI API keys or billing have been configured. Server-side protected
keys, explicit mic consent and processing disclosures, spend caps, and
rate limits are required before actual API calls.

Docs: https://developers.openai.com/api/docs/guides/realtime-transcription
