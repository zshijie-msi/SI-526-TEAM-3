# Tick-Tock — Zihe Usability Test version (with Welcome page)

This React 19 / TypeScript / Vite branch integrates Zihe’s latest **Presentation Timer App Sign-In (Copy)** Figma Make source.

## Run locally

Use Node.js 22.12+:

```bash
npm install
npm run dev
```

Build: `npm run build`.

## Included

- **Welcome page** with Tick-Tock branding and “Practice your pace.”, displayed on application load.
- Individual / Group presentation setup, Rehearse and Present modes.
- Dedicated Timer Settings screen; focused/balanced/full display, muted/bright colors and optional pacing cues.
- Rehearsal result review and presentation summary.
- Local demonstration sign-in and locally saved presentations.
- Monotonic elapsed-time clock (`performance.now()`) for both modes: stable when browser tabs are throttled; accurate pause/resume, section switching and restart.

## Limitations

- The sign-in is **only a local prototype**, not true authentication. Data is saved in the current browser's `localStorage`.
- No microphone analysis, real-time AI feedback, multi-device rooms or cross-device sync yet.
- Device vibration depends on browser support.

The previous `main` branch and the earlier Present Mode test branch are unaffected.
