import { useEffect, useRef, useState } from "react";
import { PreviewAccessField } from "./PreviewAccessField";
import type { RehearsalFeedback } from "./history";
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
          <h2>Practice pace</h2>
          <p className="speech-coach-explainer">
            Optional live transcription and approximate speaking-rate feedback.
            The {mode.toLowerCase()} timer works without a microphone.
          </p>
          <label className="speech-coach-language">
            <span>Speech language</span>
            <select value={language} disabled={enabled || languageLocked}
              onChange={(event) => onLanguageChange(event.target.value)}>
              {provider === "qwen" && <option value="auto">Auto-detect (Qwen relay)</option>}
              <option value="en-US">English</option>
              <option value="zh-CN">中文（普通话，简体）</option>
              <option value="zh-TW">中文（繁體）</option>
              <option value="es-ES">Español</option>
              <option value="fr-FR">Français</option>
            </select>
          </label>
          {languageLocked && <p className="speech-coach-privacy">
            Language is locked after speech is captured. Start a new run to change it.
          </p>}
          {relayConfigured && (
            <div className="speech-coach-source">
              <label htmlFor="speech-engine">Speech recognition</label>
              <select id="speech-engine" value={provider} disabled={enabled || languageLocked}
                onChange={(event) => {
                  const next = event.target.value as "browser" | "qwen";
                  if (next === "browser" && language === "auto") onLanguageChange("en-US");
                  onProviderChange(next);
                }}>
                <option value="browser">Browser recognition (free fallback)</option>
                <option value="qwen">{relayIsMock ? "Qwen relay simulation (no charge)" :
                  "Qwen real-time ASR (requires approved billing)"}</option>
              </select>
              {provider === "qwen" && (
                <>
                  <label htmlFor="speech-relay-code">Private pilot access code</label>
                  <input id="speech-relay-code" autoComplete="off" type="password"
                    value={relayCode} onChange={(e) => onRelayCodeChange(e.target.value)}
                    disabled={enabled} placeholder="24+ characters, provided by project owner" />
                  <p className="speech-coach-privacy">
                    {relayIsMock ? "Simulation only: this mode does not send audio to any model." :
                    "This sends microphone audio to the configured Qwen relay. Provider fees may apply. Only use with project approval."}
                  </p>
                </>
              )}
            </div>
          )}
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
            You control when the microphone is on. {provider === "browser" ?
              "Your browser may use a vendor speech service for transcription." :
              relayIsMock ? "This local mock relay does not call a speech model." :
              "Your audio is streamed through the private relay to Qwen."}
            {" "}Tick-Tock does not save raw audio or transcripts automatically.
          </p>
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
  metrics, transcript, outline = "", accessCode, onAccessCodeChange, feedback, onFeedback,
}: {
  metrics: SpeechMetrics;
  transcript: string;
  outline?: string;
  accessCode: string;
  onAccessCodeChange(code: string): void;
  feedback: RehearsalFeedback | undefined;
  onFeedback(feedback: RehearsalFeedback): void;
}) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const remoteVisible = import.meta.env.VITE_AI_PAID_REVIEW_ENABLED === "true";
  const timedSections = metrics.sections.filter((section) => section.actual > 0);
  const mostOver = timedSections.reduce<SpeechMetrics["sections"][number] | undefined>((worst, section) => {
    const over = section.actual - section.target;
    if (section.target <= 0 || over <= 0) return worst;
    return !worst || over > worst.actual - worst.target ? section : worst;
  }, undefined);
  const hasTiming = timedSections.length > 0;
  const canRequestReview = hasTiming && accessCode.trim().length >= 24 && !remoteLoading;

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
        body: JSON.stringify({
          transcript: transcript.slice(0, 8000),
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
      if (controller.signal.aborted) return;
      onFeedback({ summary: result.summary, nextSteps: result.nextSteps || [] });
    } catch (cause) {
      if (!controller.signal.aborted) {
        setRemoteError(cause instanceof Error ? cause.message : "Feedback is unavailable.");
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setRemoteLoading(false);
    }
  };

  if (metrics.words === 0 && !remoteVisible) return null;
  return (
    <section className="speech-coach-report" aria-label="Speech Coach review">
      {metrics.words > 0 && <>
      <span className="speech-coach-kicker">Speech Coach · Local analysis</span>
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
      </>}
      {remoteVisible && (
        <div className="speech-coach-remote">
          <h3>AI rehearsal feedback</h3>
          <p>
            Sends section timing and any available transcript or outline to the AI model only when you request feedback.
          </p>
          <PreviewAccessField id="coach-demo-code" code={accessCode} onChange={onAccessCodeChange} />
          <button type="button" onClick={() => { void requestRemoteReview(); }}
            disabled={!canRequestReview}>
            {remoteLoading ? "Generating..." : "Generate AI feedback"}
          </button>
          {remoteError && (
            <div role="alert">
              <p>{remoteError}</p>
              <p>{mostOver
                ? `Timing suggestion: Try cutting one detail from ${mostOver.name}.`
                : "Timing suggestion: Rehearse the transition into your next section."}</p>
            </div>
          )}
          {feedback && (
            <div className="speech-coach-remote-results">
              <strong>Feedback and next steps</strong>
              <p>{feedback.summary}</p>
              <ul>{feedback.nextSteps.map((item, i) => <li key={i}>{item}</li>)}</ul>
            </div>
          )}
        </div>
      )}
      {metrics.words > 0 && <p className="speech-coach-footnote">
        Estimates only; automatic transcription may contain errors.
        Chinese metrics approximate characters plus Latin words; other languages use approximate word counts.
        Local speaking pace uses estimated transcription counts.
      </p>}
    </section>
  );
}
