# Tick-Tock — Combined Sprint 3 project

React + TypeScript + Vite presentation timer. This merges the teammate's Sprint 3 branch with the countdown, separate presentation total, speaker rename, remaining-time autofill, and exit-confirmation work from the other branch.

## Run

Node.js 22.12+ recommended.

```bash
npm install
npm run dev
npm run build
```

## Storage and privacy

Accounts are **local demo profiles**, not authenticated accounts. No passwords, secure identity verification, cloud sync, or cross-device storage. Presentations and autosaved drafts are stored in browser localStorage. Timing results are not stored as saved presentations.

## Validation

A full production build and mobile-browser interaction test could not be completed in this environment because dependency installation timed out. Please run `npm install && npm run build` and use `SPRINT3_QA_CHECKLIST.md` before release. Review especially guest/profile draft recovery, countdown vs quiet mode, speaker rename/delete, browser Back during Present, and independent total targets.
