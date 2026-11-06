# Tick-Tock AI Coach — Pre-billing integration guide
November 5, 2026 · Branch: feature/ai-coach-history-realtime-integration

## Built and tested without paid providers

- Browser English/Chinese/Spanish/French speech recognition is optional. Manual language selection is free, but recognition may use browser-vendor cloud services. Unsupported browsers retain the standard timer.
- English WPM and Chinese approximate characters/words per minute update while speaking; the timer itself is fully independent from recognition and model calls.
- Explicitly save each Rehearse result to local history. Saving a transcript is a separate opt-in checkbox. Raw audio is never stored.
- After at least two comparable rehearsal runs, detect recurring section over/under timing and high variation. Where a line in the optional outline is section-tagged ("Intro: explain our main question") and at least two transcripts were deliberately saved, flag only missing exact phrases, never claim that the speaker forgot the idea.
- At the beginning of Present sections, display one dismissible brief personal reminder grounded in saved rehearsal history. A checkbox turns reminders off.
- Qwen realtime ASR integration is present as browser PCM16 AudioWorklet plus private Node WebSocket relay. In free MOCK_ASR mode the relay sends a clearly fake transcript and never contacts Qwen. Mock transcripts cannot be saved into real rehearsal history.
- Optional DeepSeek live analysis endpoint is present in /api/live-coach.ts. The client requests feedback asynchronously at most about every 16 seconds; the timer is never blocked. A safe mock mode can be tested without tokens, and its UI clearly says "SIMULATED FEEDBACK — NOT AI."
- No production auto language switching, confident semantic omissions, real speaker diarization, acoustic pause/emotion detection, or cross-device rehearsal history have been validated. Do not claim these features work yet.

## Architecture

User opt-in microphone -> browser SpeechRecognition (free fallback) OR 16kHz PCM16 AudioWorklet -> private Node WS relay -> Qwen3-ASR-Flash-Realtime -> transcript event -> immediate local metrics + asynchronous DeepSeek-Flash semantic review -> short cue. Transcript and timing can be saved by the user; raw audio is never persisted.

Browser Qwen relay connection: /stream via WebSocket. Relay requires a separate long access code, a permitted Origin, max two sessions, session time limit and per-second audio bytes limit. It sends official session.update and input_audio_buffer.append events to Qwen. Provider key stays on the relay host. The websocket relay requires an always-on server with TLS, not ordinary short-lived Vercel request functions.

Text feedback POST: /api/live-coach. Model is deepseek-flash in non-thinking mode, with a short JSON cue and timeout. Disabled by default. It requires AI_LIVE_FEEDBACK_ENABLED=true, AI_SPEND_CAP_CONFIRMED=true, a server-side DEEPSEEK_API_KEY, private AI_DEMO_ACCESS_CODE, and a positive AI_LIVE_MAX_CALLS_PER_INSTANCE. In-process limiting is only a backup; it is NOT a distributed spending cap. Public deployment requires persistent per-account quotas and provider budget controls.

## Free local test (zero tokens)

Install app dependencies:
  npm install
  npm run typecheck
  npm run build
  node --experimental-strip-types --test tests/*.test.mjs

Install and test relay:
  cd services/qwen-asr-relay
  npm install
  npm test

Run relay (test access code is non-secret and must never be used in production):
  MOCK_ASR=true ASR_DEMO_ACCESS_CODE=a-private-test-code-with-more-than-24-characters ALLOWED_ORIGINS=http://127.0.0.1:5173 PORT=8789 node server.mjs

Create a local .env.local in app root, NEVER commit:
  VITE_ASR_RELAY_ENABLED=true
  VITE_ASR_RELAY_MODE=mock
  VITE_ASR_RELAY_URL=ws://127.0.0.1:8789/stream
  VITE_AI_LIVE_MOCK=true

Start Vite:
  npm run dev -- --host 127.0.0.1

For full UI testing, try Individual -> Ready -> Rehearse -> Speech Coach -> Qwen relay simulation -> enter test access code -> Enable microphone. The relay should show simulated text; this is not Qwen recognition. /api/live-coach is not automatically served by Vite, so browser integration tests intercept that request or use a Vercel dev runtime. The app functions without this server.

Use browser speech recognition to generate two actual timing-only rehearsal records, save both, then check Ready and Present history-based suggestions. Decline mic permission; the timer must continue to work.

## Configuration only AFTER approval to buy or use an API

Client Vite env vars (not secret):
  VITE_ASR_RELAY_ENABLED=true
  VITE_ASR_RELAY_URL=wss://YOUR-PRIVATE-RELAY/stream
  VITE_ASR_RELAY_MODE=live
  VITE_AI_LIVE_FEEDBACK_ENABLED=true

Relay server vars (private):
  MOCK_ASR=false
  ASR_ENABLED=true
  QWEN_API_KEY=from-provider-dashboard
  QWEN_WS_ENDPOINT=wss://ap-southeast-1.maas.qwencloudapi.com/api-ws/v1/realtime
  ASR_DEMO_ACCESS_CODE=random-long-code
  ALLOWED_ORIGINS=https://exact-approved-preview-domain
  MAX_ASR_CONNECTIONS=2
  MAX_ASR_MINUTES=10

Vercel server-only vars (private):
  AI_LIVE_FEEDBACK_ENABLED=true
  AI_SPEND_CAP_CONFIRMED=true
  DEEPSEEK_API_KEY=from-provider-dashboard
  AI_DEMO_ACCESS_CODE=random-long-code
  AI_LIVE_MAX_CALLS_PER_INSTANCE=small-positive-integer
  AI_LIVE_MOCK=false

No API key belongs in source, GitHub, chat, or any VITE_* variable. Ask the user BEFORE setting any billable variable, provisioning persistent WebSocket hosting, approving quota, or making a charged request.

## Security, consent, reliability

- Some browser speech recognition implementations already send voice to the browser vendor; the app discloses this. Qwen relay mode streams mic audio to the configured server/provider. Only a separate explicit action sends transcript and outline to DeepSeek.
- Current sign-in is a local demo name/email, NOT secure authentication. The History store is localStorage, NOT encrypted or cloud-synced. Users must not store sensitive speech, and must be able to delete history.
- The model must never assert memory loss, pronunciation quality, speaker identity, actual acoustic pauses, or complete topic coverage without suitable evidence. Exact phrase matching misses synonyms.
- A real public deployment needs authentication, TLS, persistent quotas, budget alerts, revocable credentials, rate limiting, data-processing review and retention policy. The demo access code is NOT sufficient.
- End-to-end tests required before paying: Mandarin, English, code switching, accents, noise, 20-minute talk, mobile/Safari, pause/resume and Group handoffs. Disable irrelevant / late cues.
- The team's current main branch is older. Keep this in a Draft PR, reconcile Sprint 3 teammate work, and obtain PM/UX/Dev review before merge.

Official provider documents:
https://docs.qwencloud.com/developer-guides/speech/asr-realtime
https://api-docs.deepseek.com/api/create-chat-completion/
https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
https://vercel.com/docs/environment-variables
