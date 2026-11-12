# Sprint 3 manual test checklist

Base: `feature/sprint-2` (formerly `feature/present-mode-figma-make`) + Sprint 3 changes + the Sign-In & Save Figma Make updates.
Covers SCRUM-149, 125, 126, 152, 134, 153, 156, 160, the Quiet Present view task, User Story 11 (SCRUM-132) and User Story 12 (SCRUM-133, autosave).
Run on a phone-width browser window. Record pass/fail and quotes for each participant.

## Story 12 — autosave (guest and signed in)

- [ ] As a guest, Home → Individual → **Start new presentation**. Type a title and add a section. The setup shows "Draft autosaved on this device".
- [ ] Press Home. The Individual card shows **Draft: <title>**.
- [ ] Refresh the page. Individual → **Continue where you left off** shows the draft; Continue restores the title, sections, and any half-typed section in the editor.
- [ ] Do the same in Group. Individual and Group each keep **their own** draft.
- [ ] With a draft, press **Start new presentation**: a dialog asks before replacing it. "Keep my draft" keeps it; "Start new" replaces it.
- [ ] **Discard draft** asks first, then clears only that mode's draft.
- [ ] Sign in while a guest draft is open: you return to setup and the draft now belongs to that profile.
- [ ] Signed in: open a saved presentation, change something, leave. The library shows **Unsaved changes** and the saved copy is unchanged until you press Save.

## SCRUM-134 — time units, display options, required fields (AC4)

Run once in **Individual** and once in **Group**. Do not explain the time fields or display options first.

- [ ] Ask: "Add a 1-minute section called Demo." Did they enter it as 1 minute (not 1 second) without help?
- [ ] Ask: "Before you start presenting, make the timer show less on screen." Did they find **Customize presentation display** on the Present screen without help?
- [ ] Ask: "What do you think Simple / Section time / Everything will change?" Note whether the preview and description matched their expectation.
- [ ] Could they tell which fields are required (`*`) and which text is a placeholder vs. a saved value?
- [ ] Could they tell **Add a section** (dashed, "New section") from **Edit section** (solid, "Editing", opens under the card)?

## SCRUM-153 — complete vs incomplete rehearsal

Test in Individual and Group, with a 3-section and a 1-section presentation.

- [ ] Press **Next section** through to **Finish** on the last section → results say **Complete rehearsal**.
- [ ] On the last section, **End rehearsal** is gone; **Finish** is the only way out.
- [ ] Press **End rehearsal** on an earlier section → **Incomplete rehearsal · ended during section X of Y**. Finished sections keep their times, the current one says **Ended here**, later ones say **Not reached**.
- [ ] Skip a section by pressing Next right away → that row says **Skipped**; reaching the end is still Complete.
- [ ] Group, ended early: Speaking time compares only sections that were finished.

## SCRUM-156 — clearer timer settings + real preview

Ready → Present → **Customize presentation display**.

- [ ] Options read **Simple / Section time / Everything** and **Light screen / Dark screen**, each with a short description.
- [ ] The preview uses your first section's real name, speaker (Group), target time and next section.
- [ ] Switching any option updates the preview right away; the caption explains what the preview shows.
- [ ] Ask: "Which option would you pick to see only a progress bar?" Did they predict correctly without help?

## Quiet Present view

Ready → Present.

- [ ] **Quiet view** is a switch on the Present screen, visible without opening other settings.
- [ ] With Quiet view on, presenting shows the section, speaker (Group), what's next and **Next section**, but no times, totals, Over target or pace status, and no red/near-target colors.
- [ ] Tapping the screen briefly shows the time (optional peek).
- [ ] **Show timing** at the top turns Quiet view off during the presentation; **Quiet view** turns it back on.
- [ ] The summary afterwards still shows the real times (recording is unchanged).
- [ ] Pacing cues still work only if turned on.
- [ ] Ask: "Make the screen less stressful before you start." Did they find Quiet view without help?

## SCRUM-160 — what Save stores

- [ ] The button says **Save setup** everywhere (Setup, Ready, Present screen, results).
- [ ] After saving, the message says exactly what was stored (title, sections, speakers, display settings) and that timing results are not saved.
- [ ] Rehearsal results and the Present summary say the times show only on that screen; there is no "Log this run" button.
- [ ] Ask: "Will your timing results be there next time?" Did they answer correctly?

## SCRUM-149 / 125 / 126 / 152 — Group speakers

- [ ] New Group setup starts with **no** speakers.
- [ ] **Add speaker** opens a focused name field; Enter saves, Esc/Cancel closes.
- [ ] Removing a speaker makes their sections **Unassigned**; after save or autosave + refresh, the speaker does not come back.
- [ ] A section can be left Unassigned on purpose; it shows "Unassigned" in Setup, Ready, Rehearse, Present and results (never blank).
- [ ] Each speaker's total target time shows in Setup and in **Time per speaker** on Ready and the Present screen, and updates after editing/reassigning a section.
- [ ] In Group Rehearse and Present, the current speaker is clearly bigger than Up next from ~1 m away.

## User Story 11 — save, reopen, manage (AC7)

Use a local demo profile. Repeat for a multi-section **Individual** presentation and a multi-speaker **Group** presentation.

- [ ] Guest can rehearse and present without signing in.
- [ ] Press **Save** with a section still open in the editor — that section is kept (Sprint 2 "Hi there" bug).
- [ ] First save shows **Setup saved: …**; editing then saving shows **Setup changes saved: …**; the list has one item, not a duplicate.
- [ ] Save from Setup, Ready, the Present screen, after Rehearse results, and after the Present summary — all save the same setup.
- [ ] Each mode's **My presentations** lists saved items with title, mode, sections/total and **Updated …**; Open, Rehearse and Present each work.
- [ ] Change a saved section, save, **refresh**, sign in with the same profile, reopen: title, section order, times, speakers/assignments and display settings all match.
- [ ] Delete asks for confirmation and removes only that item.
- [ ] A different demo profile on the same browser sees a separate list and separate drafts.
- [ ] On another device/browser the list is empty (expected: local only, not secure, not synced).
