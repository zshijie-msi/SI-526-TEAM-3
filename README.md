# Tick-Tock — Rehearse & Present

A React + TypeScript + Vite presentation timer, built using the team's latest **Presentation Timer App Sign-In** Figma Make source.

## Run locally

Requires Node.js 22.12+:

```bash
npm install
npm run dev
```

Build: `npm run build`.

## Features

- Individual and group presentation planning, section timing and speaker assignments.
- Choose **Rehearse** or **Present** from a shared setup flow.
- Rehearsal pacing results and live presentation summary with section times.
- Present display options, muted/bright colors, optional vibration cues, pause/resume and section restart.
- Demonstration sign-in and saved presentation configurations using browser localStorage.
- Accurate elapsed-time clock using performance.now() rather than interval tick counts.

## Limitations

- Sign-in is a **local demo only**; it is not secure authentication, and saved presentations are not synchronized between devices.
- No audio recording, speech recognition, AI feedback or live coaching is implemented yet.
- Vibration varies with browser and device support.
- This branch is based on the supplied Figma Make UI; it does not provide real-time multiplayer or a team-room backend.

## Implementation

Figma Make-only Vite plugins were removed to make the app standalone. The GitHub project's previous timestamp-based timer technique has been adapted for Rehearse and Present. Existing `main` is preserved for code review.

## Sprint 4 AI Coach (feature/sprint-4 only)

This branch adds an optional Speech Coach on top of the Sprint 3 UX. **All real paid model integrations are OFF**. The independent timer continues to work even if microphone transcription or a model is unavailable.

- Optional browser speech-to-text (English, Chinese, Spanish and French manually selected) with approximate local speaking-rate feedback.
- User-controlled save of rehearsal history, optional separate transcript storage, and short history-based reminders during Present.
- Private Qwen streaming ASR relay (Node WebSocket + PCM16 browser worklet), mock transport/tests, no real provider calls enabled.
- Optional asynchronous DeepSeek Flash short-tip adapter, disabled by default; only a simulated response is used in non-billing integration tests.
- History uses localStorage and a demo-profile label, not secure sign-in or cross-device backup. Do not enter private speech data.

See [Sprint 4 Chinese setup and billing guide](docs/SPRINT4-AI-INTEGRATION.md) before creating any external account or enabling paid flags. Preview: https://si-526-team-3-git-feature-sprint-4-zshijie-9188s-projects.vercel.app.

Checks: `npm install && npm run build`, `node --experimental-strip-types --test tests/*.test.mjs`, and `cd services/qwen-asr-relay && npm ci && npm test`. The GitHub Action also runs a 390px Chromium UI flow.

**Do not merge this branch into Sprint 3 or main until the team signs off.**
