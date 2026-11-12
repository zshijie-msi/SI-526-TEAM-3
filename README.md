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
