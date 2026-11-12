import { useEffect, useRef, useState } from "react";
import type { SpeechSegment } from "./metrics";
import type { SectionHint } from "./historyInsights";

export interface LiveCue {
  text: string;
  evidence: string;
  source: "mock" | "deepseek";
}

export function useLiveFeedback({
  running, screen, segments, interim, language, sectionName,
  sectionElapsed, target, outline, historyHints,
}: {
  running: boolean;
  screen: string;
  segments: SpeechSegment[];
  interim: string;
  language: string;
  sectionName: string;
  sectionElapsed: number;
  target: number;
  outline: string;
  historyHints: SectionHint[];
}) {
  const configured = import.meta.env.VITE_AI_LIVE_FEEDBACK_ENABLED === "true" ||
    import.meta.env.VITE_AI_LIVE_MOCK === "true";
  const mockMode = import.meta.env.VITE_AI_LIVE_MOCK === "true";
  const [enabled, setEnabled] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [cue, setCue] = useState<LiveCue | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const latest = useRef({
    running, screen, segments, interim, language, sectionName,
    sectionElapsed, target, outline, historyHints, accessCode,
  });
  latest.current = {
    running, screen, segments, interim, language, sectionName,
    sectionElapsed, target, outline, historyHints, accessCode,
  };
  const lastText = useRef("");
  const lastRequestAt = useRef(0);
  const pending = useRef(false);

  const reset = () => {
    setCue(null);
    setError("");
    lastText.current = "";
    lastRequestAt.current = 0;
  };

  useEffect(() => {
    if (!configured || !enabled || !running || (screen !== "rehearse" && screen !== "present")) {
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    const tick = async () => {
      const input = latest.current;
      if (pending.current || !input.running || input.accessCode.length < 24) return;
      const text = (input.segments.map(x=>x.text).join(" ") + " " + input.interim).trim();
      if (text.length < 30 || text === lastText.current) return;
      if (Date.now() - lastRequestAt.current < 16_000) return;
      lastRequestAt.current = Date.now();
      lastText.current = text;
      pending.current = true;
      setBusy(true);
      try {
        const response = await fetch("/api/live-coach", {
          method: "POST", signal: controller.signal,
          headers: { "Content-Type":"application/json", "X-AI-Demo-Code":input.accessCode },
          body: JSON.stringify({
            transcript:text.slice(-4000), language:input.language,
            outline:input.outline.slice(0,2000),
            section:input.sectionName, sectionElapsed:input.sectionElapsed,
            target:input.target,
            historyHints:input.historyHints.slice(0,4).map(h=>h.evidence),
          }),
        });
        const body = await response.json() as {
          cue?: string; confidence?: string; evidence?: string;
          source?: string; error?: string;
        };
        if (!response.ok) throw Error(body.error || "Live analysis unavailable");
        // Discard feedback produced for a chapter that has already ended.
        // A late response must never interrupt a different speaker in Present.
        if (controller.signal.aborted || latest.current.sectionName !== input.sectionName ||
            latest.current.screen !== input.screen || !latest.current.running) return;
        if (body.cue?.trim() && body.confidence !== "low") {
          const next:LiveCue = {
            text:body.cue.slice(0,110),
            evidence:(body.evidence ?? "").slice(0,160),
            source:body.source === "deepseek" ? "deepseek" : "mock",
          };
          setCue(next);
        }
        setError("");
      } catch (error) {
        if (!controller.signal.aborted) setError(
          error instanceof Error ? error.message : "Live analysis unavailable",
        );
      } finally {
        pending.current=false;
        setBusy(false);
      }
    };
    const timer=window.setInterval(()=>{void tick();},2500);
    return ()=>{window.clearInterval(timer);controller.abort();};
  },[configured,enabled,running,screen]);

  useEffect(() => {
    if (!cue) return;
    const t=window.setTimeout(()=>setCue(null),7500);
    return ()=>window.clearTimeout(t);
  },[cue]);

  return {
    configured,mockMode,enabled,setEnabled,accessCode,setAccessCode,
    cue,error,busy,reset,dismiss: () => setCue(null),
  };
}
