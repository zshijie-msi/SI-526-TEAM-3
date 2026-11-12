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

## Combined team build (November 2026)

This version integrates the Sprint 3 team branch with the additional timer, total-target, section editor, speaker rename/remove, remaining-time autofill, and exit-confirmation changes. The Home screen has a **Sign in** action for local demo profiles. Guests can also **Save setup** and reopen saved setups from Individual or Group; guest and profile libraries are separate. Sign-in is local demonstration only (no passwords, server or sync). Autosaved drafts and explicitly saved setups are different records.

**Verification:** TypeScript/JSX syntax was checked by transpilation. A full `npm run build` and interactive browser QA could not be performed in the packaging environment because npm registry access was unavailable. Run `npm install && npm run build`, then work through `SPRINT3_QA_CHECKLIST.md` before merging into `main`.
