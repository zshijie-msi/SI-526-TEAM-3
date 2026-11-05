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
    <aside className="speech-coach-dock" aria-label="Optional speech pace coach"
      onClick={(event) => event.stopPropagation()}>
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

export function CoachReport({
  metrics, transcript, outline = "",
}: {
  metrics: SpeechMetrics;
  transcript: string;
  outline?: string;
}) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState("");
  const [remoteReview, setRemoteReview] = useState<{ summary: string; nextSteps: string[] } | null>(null);
  // Disabled in every deployment unless the owner explicitly enables the client flag.
  // The server independently requires a second enable flag, a key and access code.
  const remoteVisible = import.meta.env.VITE_AI_PAID_REVIEW_ENABLED === "true";

  const requestRemoteReview = async () => {
    if (remoteLoading || !accessCode || transcript.length < 20 || transcript.length > 8000) return;
    setRemoteLoading(true);
    setRemoteError("");
    try {
      const response = await fetch("/api/ai-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-AI-Demo-Code": accessCode },
        body: JSON.stringify({
          transcript,
          outline: outline.slice(0, 3000),
          wordsPerMinute: metrics.wpm,
          sections: metrics.sections,
        }),
      });
      const result = await response.json() as {
        summary?: string; nextSteps?: string[]; error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Feedback request failed.");
      if (!result.summary) throw new Error("No usable feedback was returned.");
      setRemoteReview({ summary: result.summary, nextSteps: result.nextSteps || [] });
    } catch (cause) {
      setRemoteError(cause instanceof Error ? cause.message : "Feedback is unavailable.");
    } finally {
      setRemoteLoading(false);
    }
  };

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
      {outline.trim() && (
        <p className="speech-coach-footnote">
          An optional outline is available, but this free report does not judge content coverage.
        </p>
      )}
      {remoteVisible && (
        <div className="speech-coach-remote">
          <h3>Optional remote AI review</h3>
          <p>
            Only if you request it: sends transcript, optional outline, and timing
            metrics to a paid text model. Provider charges may apply. No raw audio is sent.
          </p>
          <label htmlFor="coach-demo-code">Private pilot access code</label>
          <input id="coach-demo-code" type="password" value={accessCode}
            autoComplete="off" onChange={(event) => setAccessCode(event.target.value)}
            placeholder="Provided by project owner" />
          <button type="button" onClick={() => { void requestRemoteReview(); }}
            disabled={remoteLoading || accessCode.length < 24 || transcript.length < 20 || transcript.length > 8000}>
            {remoteLoading ? "Generating..." : "Generate AI feedback (may incur charges)"}
          </button>
          {remoteError && <p role="alert">{remoteError}</p>}
          {remoteReview && (
            <div className="speech-coach-remote-results">
              <strong>Model feedback · Review before trusting</strong>
              <p>{remoteReview.summary}</p>
              <ul>{remoteReview.nextSteps.map((item, i) => <li key={i}>{item}</li>)}</ul>
            </div>
          )}
        </div>
      )}
      <p className="speech-coach-footnote">
        Estimates only; automatic transcription may contain errors.
        The free report is local timing analysis, not an AI model evaluation or a saved recording.
      </p>
    </section>
  );
}
