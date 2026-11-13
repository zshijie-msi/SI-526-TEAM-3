import { useState } from "react";
import type { RehearsalRun } from "./history";
import { isChineseLanguage } from "./metrics";
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
  saved, savingError, saveTranscript, setSaveTranscript, hasUnsavedFeedback, onSave,
}: {
  saved: boolean;
  savingError: string;
  saveTranscript: boolean;
  setSaveTranscript: (value: boolean) => void;
  hasUnsavedFeedback: boolean;
  onSave: () => void;
}) {
  return (
    <section className="history-save" aria-label="Save rehearsal history">
      <h2>Save rehearsal</h2>
      <label className="history-checkbox">
        <input type="checkbox" checked={saveTranscript} onChange={(e) => setSaveTranscript(e.target.checked)} />
        <span>Include transcript</span>
      </label>
      <button type="button" onClick={onSave} className="history-primary">{saved ? "Update saved rehearsal" : "Save rehearsal to history"}</button>
      {saved && <p role="status" className="history-good">{hasUnsavedFeedback ? "New feedback available" : "Saved on this device"}</p>}
      {savingError && <p role="alert" className="history-warning">{savingError}</p>}
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
        <h2>Rehearsal history</h2>
        {compact && runs.length > 0 && <button type="button" onClick={() => setExpanded((s) => !s)} aria-expanded={expanded}>
          {expanded ? "Hide" : "View"} history
        </button>}
      </div>
      <p className="history-description">
        {runs.length === 0 ? "No saved rehearsals" : `${runs.length} saved ${runs.length === 1 ? "run" : "runs"}`}
      </p>
      {expanded && <>
        {runs.length > 0 && (
          <div className="history-stat-line">
            <span>Typical duration · {stats.medianDuration === null ? "—" : time(stats.medianDuration)}</span>
          </div>
        )}
        {hints.length > 0 && (
          <div className="history-hints">
            <h3>Rehearsal patterns</h3>
            {hints.slice(0, 5).map((hint) => (
              <article key={hint.sectionId + hint.kind}>
                <strong>{hint.sectionName} · {hint.evidence}</strong>
                <p>{hint.text}</p>
              </article>
            ))}
          </div>
        )}
        {runs.length > 0 && (
          <>
            <h3>Saved sessions</h3>
            <div className="history-runs">
              {runs.slice(0, 10).map((run) => (
                <details key={run.id}>
                  <summary>{date(run.recordedAt)} · {time(run.duration)}</summary>
                  <div className="history-run-body">
                    {run.sections.map((section) => (
                      <div key={section.id}>
                        <div className="history-section-row">
                          <span>{section.name}{section.speaker ? " · " + section.speaker : ""}</span>
                          <span>{time(section.actual)} / {time(section.target)}</span>
                        </div>
                        {section.rate != null && (
                          <small>{section.rate} {isChineseLanguage(run.language) ? "units/min" : "words/min"} (estimated)</small>
                        )}
                        {run.transcriptSaved && section.transcript && (
                          <details>
                            <summary>Transcript</summary>
                            <p className="history-record-text">{section.transcript}</p>
                          </details>
                        )}
                      </div>
                    ))}
                    {run.feedback?.summary && (
                      <div className="history-saved-feedback">
                        <h4>AI rehearsal feedback</h4>
                        <p className="history-record-text">{run.feedback.summary}</p>
                        {Array.isArray(run.feedback.nextSteps) && (
                          <ul>{run.feedback.nextSteps.map((step, index) => <li key={index}>{step}</li>)}</ul>
                        )}
                      </div>
                    )}
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
        <strong>Rehearsal reminder</strong>
        <p>{hint.text}</p>
      </div>
      <button type="button" aria-label="Dismiss reminder" onClick={onDismiss}>×</button>
    </aside>
  );
}
