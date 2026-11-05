import { useState } from "react";
import { localSuggestions, type SpeechMetrics } from "./metrics";
import "./coach.css";

interface CoachDockProps {
  mode: "Rehearse" | "Present";
  available: boolean;
  enabled: boolean;
  listening: boolean;
  error: string;
  interim: string;
  transcript: string;
  words: number;
  wpm: number | null;
  cue: string | null;
  onToggle: (enabled: boolean) => void;
}

export function CoachDock({
  mode, available, enabled, listening, error, interim, transcript,
  words, wpm, cue, onToggle,
}: CoachDockProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <aside className="speech-coach-dock" aria-label="Optional speech pace coach">
      <button
        type="button"
        className="speech-coach-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span aria-hidden="true">🎙</span>
        <span>Speech Coach {enabled ? (listening ? "· Listening" : "· Paused") : "· Off"}</span>
        <span aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>

      {expanded && (
        <div className="speech-coach-panel">
          <h2>Practice pace</h2>
          <p className="speech-coach-explainer">
            Optional English speech transcription and estimated words per minute.
            Your {mode.toLowerCase()} timer works without this.
          </p>
          {!available ? (
            <p className="speech-coach-error" role="status">
              This browser does not offer speech recognition. Try a current Chrome or Edge browser.
            </p>
          ) : (
            <button
              type="button"
              className={"speech-coach-mic " + (enabled ? "speech-coach-mic--on" : "")}
              onClick={() => onToggle(!enabled)}
              aria-pressed={enabled}
            >
              {enabled ? "Turn microphone off" : "Enable microphone"}
            </button>
          )}
          <p className="speech-coach-privacy">
            You control when the mic is on. Some browsers send audio to their speech
            service for transcription. Tick-Tock does not store or upload the transcript.
          </p>
          {enabled && (
            <div className="speech-coach-stats">
              <div><strong>{wpm ?? "—"}</strong><span>Estimated WPM</span></div>
              <div><strong>{words}</strong><span>Words recognized</span></div>
            </div>
          )}
          {enabled && cue && <p className="speech-coach-cue" role="status">{cue}</p>}
          {error && <p className="speech-coach-error" role="alert">{error}</p>}
          {enabled && (
            <div className="speech-coach-transcript">
              <strong>Live transcript</strong>
              <p>{transcript || interim || "Speak to see the transcript here."}</p>
              {transcript && interim && <em> {interim}</em>}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

export function CoachReport({ metrics, transcript }: { metrics: SpeechMetrics; transcript: string }) {
  const [showTranscript, setShowTranscript] = useState(false);
  if (metrics.words === 0) return null;
  return (
    <section className="speech-coach-report" aria-label="Speech Coach review">
      <span className="speech-coach-kicker">Speech Coach · Local analysis</span>
      <h2>Speaking pace</h2>
      <p>
        {metrics.words} words recognized
        {metrics.wpm !== null ? " · " + metrics.wpm + " estimated words/min" : ""}
      </p>
      <div className="speech-coach-section-list">
        {metrics.sections.filter((section) => section.words > 0).map((section) => (
          <div key={section.id}>
            <strong>{section.name}{section.speaker ? " · " + section.speaker : ""}</strong>
            <span>{section.words} words{section.wpm !== null ? " · " + section.wpm + " WPM" : ""}</span>
          </div>
        ))}
      </div>
      <h3>Things to check next time</h3>
      <ul>{localSuggestions(metrics).map((tip) => <li key={tip}>{tip}</li>)}</ul>
      <button className="speech-coach-transcript-toggle" type="button"
        aria-expanded={showTranscript} onClick={() => setShowTranscript((value) => !value)}>
        {showTranscript ? "Hide" : "View"} transcript
      </button>
      {showTranscript && <p className="speech-coach-report-transcript">{transcript}</p>}
      <p className="speech-coach-footnote">
        Estimates only; automatic transcription may contain errors.
        This is local timing analysis, not an AI model evaluation or a saved recording.
      </p>
    </section>
  );
}
