# Tick-Tock — Presentation Rehearsal Timer

A small React + TypeScript web app for timed presentation practice. This version is based directly on the **Presentation Timer App** Figma Make source provided by the team.

## Run locally

**Requirements:** Node.js 22.12+ and internet access for the first installation.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`).

**Build for deployment later:**

```bash
npm run build
npm run preview
```

The production files will be in `dist/`. Vercel deployment is deliberately **not** part of this delivery.

> `index.html` loads TypeScript via Vite. Don't double-click it as a standalone file; run the Vite development server instead.

## How to use

1. Choose **Individual** or **Group**.
2. Give the presentation a name, add/edit/delete/reorder sections, and set section target times.
3. In Group Mode, add speaker names and assign a speaker to a section.
4. Review the setup and start rehearsal.
5. Use **Pause / Resume**, **Next section**, or **End rehearsal**.
6. View pacing results, then **Rehearse again** or **Adjust setup**.

## Source layout

```text
src/
  App.tsx                  UI and interaction logic
  index.css                Original Figma Make visual styling
  main.tsx                 React entry point
  assets/
    tick-tock-icon.png     Original logo icon
    tick-tock-wordmark.png Original logo wordmark
index.html
package.json
vite.config.ts
JIRA_PROGRESS.md          Detailed issue-by-issue audit (61 Jira work items)
JIRA_PROGRESS.json        Machine-readable copy
QA_RESULTS.json           Interaction test results
QA_REPORT.md              Testing and known limitations
```

## What changed from the supplied Figma Make project

- Preserved the source screens, CSS values, SVG icon markup, and image assets.
- Corrected elapsed time to use `performance.now()` rather than counting timer callbacks. This keeps timing accurate when a tab is inactive or the browser delays intervals.
- Made pause/resume, section changes, and early ending use the same clock source.
- Added an **Incomplete rehearsal** label when the user ends early.
- Removed Figma Make-only build plugins and an unused Tailwind dependency. Retained the necessary browser reset styles.
- Fixed the section timeline's invalid `li` nesting without changing its appearance.

## Important limits

- **Create room** / **Copy invite** is a UI demonstration inherited from Figma Make. There is **no multi-device connection, shared server, or real-time synchronization**. Do not advertise it as working collaboration.
- The uploaded Figma Make source does not support renaming/removing speakers, completely unassigned group sections, separate total-time input, optional untargeted sections, biggest-overrun callout, Wake Lock, or AI feedback. These remain unfinished Jira requirements.
- Nothing has been deployed to Vercel and no Jira issue statuses have been changed by this code delivery.

See `JIRA_PROGRESS.md` for the exact Jira gaps before marking work Done.
