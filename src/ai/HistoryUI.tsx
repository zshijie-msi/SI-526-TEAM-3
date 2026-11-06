import { useState } from "react";
import type { RehearsalRun } from "./history";
import { historyStats, type SectionHint } from "./historyInsights";
import "./history.css";

function time(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
function date(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function SaveRehearsalPanel({
  saved, savingError, saveTranscript, setSaveTranscript, onSave,
}: {
  saved: boolean;
  savingError: string;
  saveTranscript: boolean;
  setSaveTranscript: (value: boolean) => void;
  onSave: () => void;
}) {
  return (
    <section className="history-save" aria-label="Save rehearsal history">
      <h2>Remember this rehearsal</h2>
      <p>Save section times and speaking pace on this device. Future Present reminders can use repeated patterns from saved runs.</p>
      <label className="history-checkbox">
        <input type="checkbox" checked={saveTranscript} onChange={(e) => setSaveTranscript(e.target.checked)} />
        <span>Also save my transcript for optional outline checks (local only)</span>
      </label>
      <button type="button" onClick={onSave} className="history-primary">{saved ? "Update saved rehearsal" : "Save rehearsal to history"}</button>
      {saved && <p role="status" className="history-good">Saved on this browser. You can delete it in the history list.</p>}
      {savingError && <p role="alert" className="history-warning">{savingError}</p>}
      <small>This is a local-only record, not a secure cloud account. No audio is stored. Clearing browser storage deletes these records.</small>
    </section>
  );
}

export function HistoryPanel({
  runs, hints, onDelete, onClear, compact = false,
}: {
  runs: RehearsalRun[];
  hints: SectionHint[];
  onDelete: (id: string) => void;
  onClear: () => void;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(!compact);
  const stats = historyStats(runs);
  return (
    <section className="history-panel" aria-label="Past rehearsal history">
      <div className="history-heading">
        <div><span className="history-eyebrow">PERSONALIZED PRACTICE</span><h2>Rehearsal history</h2></div>
        {compact && <button type="button" onClick={() => setExpanded((s) => !s)} aria-expanded={expanded}>
          {expanded ? "Hide" : "View"} history
        </button>}
      </div>
      <p className="history-description">
        {runs.length > 0 && <strong>{runs.length} saved runs · </strong>}
        {runs.length ? "Your saved runs are used to find repeated timing issues before Present Mode." :
          "No rehearsal history saved yet. Save at least two rehearsals to see reliable patterns."}
      </p>
      {expanded && <>
        {runs.length > 0 && (
          <div className="history-stat-line">
            <strong>{stats.count}</strong> saved runs
            <span>Typical duration: {stats.medianDuration === null ? "—" : time(stats.medianDuration)}</span>
          </div>
        )}
        {hints.length > 0 ? (
          <div className="history-hints">
            <h3>What to watch next time</h3>
            {hints.slice(0, 5).map((hint) => (
              <article key={hint.sectionId + hint.kind}>
                <strong>{hint.sectionName}</strong>
                <p>{hint.text}</p>
                <small>{hint.evidence}</small>
              </article>
            ))}
          </div>
        ) : runs.length > 0 ? (
          <p className="history-empty">No consistent issue found yet. Two or more runs of the same section are needed.</p>
        ) : null}
        {runs.length > 0 && (
          <>
            <h3>Saved sessions</h3>
            <div className="history-runs">
              {runs.slice(0, 10).map((run) => (
                <details key={run.id}>
                  <summary><span>{date(run.recordedAt)} · {time(run.duration)}</span>
                    <small>{run.language}{run.transcriptSaved ? " · transcript saved" : " · timing only"}</small>
                  </summary>
                  <div className="history-run-body">
                    {run.sections.map((section) => (
                      <div key={section.id} className="history-section-row">
                        <span>{section.name}{section.speaker ? " · " + section.speaker : ""}</span>
                        <span>{time(section.actual)} / {time(section.target)}</span>
                      </div>
                    ))}
                    <button type="button" className="history-delete" onClick={() => {
                      if (window.confirm("Delete this rehearsal from this device?")) onDelete(run.id);
                    }}>Delete this rehearsal</button>
                  </div>
                </details>
              ))}
            </div>
            <button type="button" className="history-clear" onClick={() => {
              if (window.confirm("Delete all saved rehearsals for this presentation on this device?")) onClear();
            }}>Clear this presentation's history</button>
          </>
        )}
      </>}
    </section>
  );
}

export function PresentHistoryHint({
  hint, onDismiss,
}: {
  hint: SectionHint | null;
  onDismiss: () => void;
}) {
  if (!hint) return null;
  return (
    <aside className="present-history-hint" role="status" aria-label="Reminder from prior rehearsals">
      <div>
        <strong>From your rehearsals</strong>
        <p>{hint.text}</p>
        <small>{hint.sampleSize} saved rehearsals · {hint.kind === "outline" ? "exact text check" : "timing pattern"}</small>
      </div>
      <button type="button" aria-label="Dismiss reminder" onClick={onDismiss}>×</button>
    </aside>
  );
}
