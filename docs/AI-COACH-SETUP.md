# Tick-Tock Speech Coach — pilot integration

## What is ready without paying for an API

The pilot is based on \`feature/zihe-usability-welcome\`, not the old \`main\`.

1. Rehearse and Present both have an **optional, collapsed Speech Coach**.
2. The user opens it and explicitly clicks **Enable microphone**.
3. Browser SpeechRecognition transcribes English speech. On some browsers this
   happens through a browser-vendor online speech service (not local/offline).
4. A deterministic pacing engine estimates words per minute, shows brief cues,
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
  The English word count and WPM are rough estimates, not graded speech quality.
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
