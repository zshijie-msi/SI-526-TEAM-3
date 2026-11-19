import { useEffect, useRef, useState } from "react";
import type { SpeechSegment } from "./metrics";
import type { liveRehearsalContext } from "./historyInsights";

export function useLiveFeedback({
  running, screen, segments, interim, language, sectionId, sectionName,
  sectionElapsed, target, script, rehearsalContext, accessCode, onAccessDenied,
}: {
  running: boolean;
  screen: string;
  segments: SpeechSegment[];
  interim: string;
  language: string;
  sectionId: number;
  sectionName: string;
  sectionElapsed: number;
  target: number;
  script: string;
  rehearsalContext?: ReturnType<typeof liveRehearsalContext>;
  accessCode: string;
  onAccessDenied(): void;
}) {
  const configured = import.meta.env.VITE_AI_LIVE_FEEDBACK_ENABLED === "true" ||
    import.meta.env.VITE_AI_LIVE_MOCK === "true";
  const [enabled, setEnabled] = useState(false);
  const [cue, setCue] = useState<{ text: string; sectionId: number } | null>(null);
  const [error, setError] = useState("");
  const [rejectedCode, setRejectedCode] = useState("");
  const [revision, setRevision] = useState(0);
  const latest = useRef({ segments, interim, language, sectionName, sectionElapsed, target, script, rehearsalContext, onAccessDenied });
  latest.current = { segments, interim, language, sectionName, sectionElapsed, target, script, rehearsalContext, onAccessDenied };

  const lastChecks = useRef(new Map<number, { text: string | null; at: number; lastCue: string }>());
  const runRequests = useRef(0);
  const code = accessCode.trim();
  const needsCode = code.length < 24 || code === rejectedCode;

  const restartSection = () => {
    setCue(null);
    setError("");
    const last = lastChecks.current.get(sectionId);
    if (last) lastChecks.current.set(sectionId, { text: null, at: last.at, lastCue: "" });
    setRevision((current) => current + 1);
  };

  const reset = () => {
    setEnabled(false);
    setCue(null);
    setError("");
    lastChecks.current.clear();
    runRequests.current = 0;
  };

  useEffect(() => {
    if (!configured || !enabled || !running || screen !== "present" || needsCode) return;
    const controller = new AbortController();
    let pending = false;
    let stopChecks = false;

    const tick = async () => {
      if (pending || stopChecks || controller.signal.aborted || runRequests.current >= 8) return;
      const input = latest.current;
      const speech = input.segments.filter((part) => part.sectionId === sectionId).map((part) => part.text);
      const transcript = [...speech, input.interim].join(" ").trim().slice(-4000);
      const script = input.script.trim().slice(0, 12_000);
      const hasContext = Boolean(script || input.rehearsalContext?.suggestions.length ||
        input.rehearsalContext?.attempts.some((attempt) => attempt.transcript));
      const last = lastChecks.current.get(sectionId);
      const now = Date.now();
      if (last && now - last.at < 16_000) return;
      if (last?.text != null && (transcript === last.text || transcript.length < 30)) return;
      if (transcript.length < 30 && !hasContext) return;

      lastChecks.current.set(sectionId, { text: transcript, at: now, lastCue: last?.lastCue ?? "" });
      pending = true;
      runRequests.current++;
      try {
        const response = await fetch("/api/live-coach", {
          method: "POST", signal: controller.signal,
          headers: { "Content-Type": "application/json", "X-AI-Demo-Code": code },
          body: JSON.stringify({
            transcript, language: input.language, script,
            section: input.sectionName.slice(0, 100),
            sectionElapsed: input.sectionElapsed,
            target: input.target,
            rehearsal: input.rehearsalContext,
          }),
        });
        if (controller.signal.aborted) return;
        if (response.status === 403) {
          setRejectedCode(code);
          setEnabled(false);
          setError("Check the access code");
          latest.current.onAccessDenied();
          return;
        }
        if (response.status === 429) {
          lastChecks.current.set(sectionId, { text: null, at: now, lastCue: last?.lastCue ?? "" });
          return;
        }
        if (!response.ok) {
          setError("AI cues unavailable");
          stopChecks = response.status === 503;
          return;
        }
        const body = await response.json() as { cue?: string; confidence?: string };
        if (controller.signal.aborted) return;
        const text = typeof body.cue === "string" ? body.cue.trim() : "";
        if (text && text.length <= 58 && body.confidence !== "low" && text !== last?.lastCue) {
          lastChecks.current.set(sectionId, { text: transcript, at: now, lastCue: text });
          setCue({ sectionId, text });
        }
        setError("");
      } catch {
        if (!controller.signal.aborted) setError("AI cues unavailable");
      } finally {
        pending = false;
      }
    };

    const timer = window.setInterval(() => { void tick(); }, 1000);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [configured, enabled, running, screen, sectionId, revision, code, needsCode]);

  useEffect(() => {
    if (!cue) return;
    const timeout = window.setTimeout(() => setCue(null), 7000);
    return () => window.clearTimeout(timeout);
  }, [cue]);

  return {
    configured, enabled, needsCode, error, reset, restartSection,
    setEnabled: (next: boolean) => {
      setEnabled(next);
      setError("");
      if (!next) setCue(null);
    },
    cue: enabled && running && cue?.sectionId === sectionId ? cue.text : null,
  };
}
