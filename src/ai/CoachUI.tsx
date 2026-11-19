import { useEffect, useRef, useState } from "react";
import { PreviewAccessField } from "./PreviewAccessField";
import type { ContentFeedback, RehearsalFeedback } from "./history";
import { LiveAnalysisControls, type LiveAnalysisUIProps } from "./LiveUI";
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
  unitLabel: string;
  rateLabel: string;
  language: string;
  languageLocked: boolean;
  onLanguageChange: (language: string) => void;
  provider: "browser" | "qwen";
  onProviderChange: (provider: "browser" | "qwen") => void;
  relayConfigured: boolean;
  relayIsMock: boolean;
  relayCode: string;
  onRelayCodeChange: (code: string) => void;
  onToggle: (enabled: boolean) => void;
  live: LiveAnalysisUIProps;
}

export function CoachDock({
  mode, available, enabled, listening, error, interim, transcript,
  words, wpm, cue, unitLabel, rateLabel, language, languageLocked,
  onLanguageChange, onToggle, provider, onProviderChange,
  relayConfigured, relayIsMock, relayCode, onRelayCodeChange, live,
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
          <label className="speech-coach-language">
            <span>Speech language</span>
            <select value={language} disabled={enabled || languageLocked}
              onChange={(event) => onLanguageChange(event.target.value)}>
              {provider === "qwen" && <option value="auto">Auto-detect</option>}
              <option value="en-US">English</option>
              <option value="zh-CN">中文（普通话，简体）</option>
              <option value="zh-TW">中文（繁體）</option>
              <option value="es-ES">Español</option>
              <option value="fr-FR">Français</option>
            </select>
          </label>
          {relayConfigured && (
            <div className="speech-coach-source">
              <label htmlFor="speech-engine">Speech recognition</label>
              <select id="speech-engine" value={provider} disabled={enabled || languageLocked}
                onChange={(event) => {
                  const next = event.target.value as "browser" | "qwen";
                  if (next === "browser" && language === "auto") onLanguageChange("en-US");
                  onProviderChange(next);
                }}>
                <option value="browser">Browser transcription</option>
                <option value="qwen">{relayIsMock ? "Simulated transcription" : "Qwen audio streaming"}</option>
              </select>
              {provider === "qwen" && (
                <>
                  <label htmlFor="speech-relay-code">Private pilot access code</label>
                  <input id="speech-relay-code" autoComplete="off" type="password"
                    value={relayCode} onChange={(e) => onRelayCodeChange(e.target.value)}
                    disabled={enabled} />
                </>
              )}
            </div>
          )}
          {!available ? (
            <p className="speech-coach-error" role="status">
              For transcription, use Chrome or Edge.
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
          {enabled && (
            <div className="speech-coach-stats">
              <div><strong>{wpm ?? "—"}</strong><span>{rateLabel}</span></div>
              <div><strong>{words}</strong><span>{unitLabel} recognized</span></div>
            </div>
          )}
          {enabled && cue && <p className="speech-coach-cue" role="status">{cue}</p>}
          {error && <p className="speech-coach-error" role="alert">{error}</p>}
          {mode === "Present" && <LiveAnalysisControls {...live} />}
          {enabled && (
            <div className="speech-coach-transcript">
              <strong>Live transcript</strong>
              <p>{transcript || interim || "Waiting for speech…"}</p>
              {transcript && interim && <em> {interim}</em>}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

export function FeedbackResults({ feedback }: { feedback: RehearsalFeedback }) {
  if ("suggestions" in feedback) {
    return (
      <ul className="content-feedback">
        {feedback.suggestions.map(({ sectionName, quote, suggestion }, index) => (
          <li key={index}>
            <strong>{sectionName}</strong>
            {quote && <q>{quote}</q>}
            <p>{suggestion}</p>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <>
      <p>{feedback.summary.split(/\bnextSteps\s*:/i, 1)[0].trim()}</p>
      <ul>{feedback.nextSteps.map((item, index) => <li key={index}>{item}</li>)}</ul>
    </>
  );
}

export function CoachReport({
  metrics, transcript, outline = "", accessCode, onAccessCodeChange, feedback, onFeedback, rehearsal,
}: {
  metrics: SpeechMetrics;
  transcript: string;
  outline?: string;
  accessCode: string;
  onAccessCodeChange(code: string): void;
  feedback: RehearsalFeedback | undefined;
  onFeedback(feedback: RehearsalFeedback | undefined): void;
  rehearsal?: {
    sections: Array<{ id: number; name: string; transcript: string }>;
    transcriptPending: boolean;
    onTranscriptChange(id: number, transcript: string): void;
  };
}) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const remoteVisible = import.meta.env.VITE_AI_PAID_REVIEW_ENABLED === "true";
  const hasTranscript = rehearsal?.sections.some(({ transcript }) => /[\p{L}\p{N}]{2}/u.test(transcript));
  const hasReviewInput = rehearsal
    ? hasTranscript && !rehearsal.transcriptPending
    : metrics.sections.some((section) => section.actual > 0);
  const canRequestReview = hasReviewInput && accessCode.trim().length >= 24 && !remoteLoading;

  const requestRemoteReview = async () => {
    if (!canRequestReview || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setRemoteLoading(true);
    setRemoteError("");
    try {
      const response = await fetch("/api/ai-feedback", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-AI-Demo-Code": accessCode.trim() },
        body: JSON.stringify(rehearsal ? {
          mode: "content",
          outline: outline.slice(0, 3000),
          sections: rehearsal.sections.filter(({ transcript }) => transcript.trim()).slice(0, 50)
            .map(({ id, name, transcript }) => ({ id, name, transcript: transcript.slice(0, 3000) })),
        } : {
          transcript: transcript.slice(0, 8000),
          outline: outline.slice(0, 3000),
          wordsPerMinute: metrics.wpm,
          sections: metrics.sections,
        }),
      });
      const result = await response.json() as Partial<ContentFeedback> & {
        summary?: string; nextSteps?: string[]; error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Feedback request failed.");
      if (controller.signal.aborted) return;
      if (rehearsal && result.suggestions?.length) {
        onFeedback({ suggestions: result.suggestions });
      } else if (!rehearsal && result.summary) {
        onFeedback({ summary: result.summary, nextSteps: result.nextSteps || [] });
      } else {
        throw new Error("No usable feedback was returned.");
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setRemoteError(cause instanceof Error ? cause.message : "Feedback is unavailable.");
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (!controller.signal.aborted) setRemoteLoading(false);
      }
    }
  };

  if (metrics.words === 0 && !remoteVisible) return null;
  return (
    <section className="speech-coach-report" aria-label="Speech Coach review">
      {metrics.words > 0 && <>
      <h2>Speaking pace</h2>
      <p>
        {metrics.words} {metrics.unitLabel.toLowerCase()} recognized
        {metrics.wpm !== null ? " · " + metrics.wpm + " " + metrics.rateLabel : ""}
      </p>
      <div className="speech-coach-section-list">
        {metrics.sections.filter((section) => section.words > 0).map((section) => (
          <div key={section.id}>
            <strong>{section.name}{section.speaker ? " · " + section.speaker : ""}</strong>
            <span>{section.words} {metrics.unitLabel.toLowerCase()}
              {section.wpm !== null ? " · " + section.wpm + " " + metrics.rateLabel : ""}
            </span>
          </div>
        ))}
      </div>
      {!rehearsal && <>
        <h3>Pacing tips</h3>
        <ul>{localSuggestions(metrics).map((tip) => <li key={tip}>{tip}</li>)}</ul>
      </>}
      {!rehearsal && <button className="speech-coach-transcript-toggle" type="button"
        aria-expanded={showTranscript} onClick={() => setShowTranscript((value) => !value)}>
        {showTranscript ? "Hide" : "View"} transcript
      </button>}
      {!rehearsal && showTranscript && <p className="speech-coach-report-transcript">{transcript}</p>}
      </>}
      {remoteVisible && (
        <div className="speech-coach-remote">
          <h2>AI rehearsal feedback</h2>
          {rehearsal && (
            <>
              <details className="rehearsal-transcript">
                <summary>{hasTranscript ? "Review transcript" : "Add transcript"}</summary>
                {rehearsal.sections.map(({ id, name, transcript }) => (
                  <label key={id}>
                    {name}
                    <textarea rows={3} maxLength={3000} value={transcript} disabled={rehearsal.transcriptPending}
                      onChange={(event) => {
                        request.current?.abort();
                        request.current = null;
                        setRemoteLoading(false);
                        setRemoteError("");
                        onFeedback(undefined);
                        rehearsal.onTranscriptChange(id, event.target.value);
                      }} />
                  </label>
                ))}
              </details>
              {rehearsal.transcriptPending
                ? <p role="status">Finishing transcript…</p>
                : !hasTranscript && <p>No speech captured. Add what you said.</p>}
            </>
          )}
          <PreviewAccessField id="coach-demo-code" code={accessCode} onChange={onAccessCodeChange} />
          <button type="button" onClick={() => { void requestRemoteReview(); }}
            disabled={!canRequestReview}>
            {remoteLoading ? "Generating..." : "Generate AI feedback"}
          </button>
          {remoteError && <p role="alert">{remoteError}</p>}
          {feedback && (
            <div className="speech-coach-remote-results">
              <FeedbackResults feedback={feedback} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
