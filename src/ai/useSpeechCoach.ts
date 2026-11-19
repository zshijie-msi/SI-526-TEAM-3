import { useEffect, useRef, useState } from "react";
import type { SpeechSegment } from "./metrics";
import { startRelayRecognition } from "./qwenClient";

interface SpeechAlternative { transcript: string }
interface SpeechResult { isFinal: boolean; 0: SpeechAlternative }
interface SpeechEvent {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
}
interface SpeechErrorEvent { error: string }
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  onaudiostart: (() => void) | null;
  onaudioend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

function recognitionConstructor(): (new () => Recognition) | undefined {
  if (typeof window === "undefined") return undefined;
  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

export function useSpeechCoach({
  active,
  rehearsing,
  sectionId,
  totalElapsed,
}: {
  active: boolean;
  rehearsing: boolean;
  sectionId: number;
  totalElapsed: number;
}) {
  const [enabled, setEnabled] = useState(false);
  const [language, setLanguage] = useState("en-US");
  const [provider, setProvider] = useState<"browser" | "qwen">("browser");
  const [relayCode, setRelayCode] = useState("");
  const relayUrl = import.meta.env.VITE_ASR_RELAY_URL ?? "";
  const relayConfigured = Boolean(relayUrl && import.meta.env.VITE_ASR_RELAY_ENABLED === "true");
  const relayIsMock = import.meta.env.VITE_ASR_RELAY_MODE === "mock";
  const [segments, setSegments] = useState<SpeechSegment[]>([]);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [transcriptPending, setTranscriptPending] = useState(false);
  const [captureSecondsBySection, setCaptureSecondsBySection] = useState<Record<number, number>>({});
  const [restartRevision, setRestartRevision] = useState(0);
  const captureRevision = useRef(0);
  const runRevision = useRef(0);
  const draining = useRef<Promise<void> | null>(null);
  const latest = useRef({ sectionId, totalElapsed });
  latest.current = { sectionId, totalElapsed };
  const rehearsalSection = rehearsing ? sectionId : null;

  const available = provider === "browser"
    ? Boolean(recognitionConstructor()) : relayConfigured;
  const reset = () => {
    runRevision.current++;
    setEnabled(false);
    setSegments([]);
    setInterim("");
    setError("");
    setListening(false);
    setTranscriptPending(false);
    setCaptureSecondsBySection({});
  };
  const restartSection = () => {
    captureRevision.current++;
    setRestartRevision(captureRevision.current);
    setSegments((current) => current.filter((segment) => segment.sectionId !== sectionId));
    setCaptureSecondsBySection((current) => ({ ...current, [sectionId]: 0 }));
    setInterim("");
  };

  useEffect(() => {
    if (!enabled || !active || provider !== "browser") {
      setListening(false);
      setInterim("");
      return;
    }
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      setError("For transcription, use Chrome or Edge.");
      setEnabled(false);
      return;
    }

    let disposed = false;
    let restartTimer: number | null = null;
    let stopForError = false;
    let started = false;
    let finishCapture: (() => void) | undefined;
    const captureRun = runRevision.current;
    const sameRun = () => captureRun === runRevision.current;
    const recognition = new Constructor();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;
    let audioStartedAt: number | null = null;
    const endAudioCapture = () => {
      if (audioStartedAt === null || rehearsalSection === null) return;
      const seconds = (performance.now() - audioStartedAt) / 1000;
      audioStartedAt = null;
      if (sameRun() && captureRevision.current === restartRevision) {
        setCaptureSecondsBySection((current) => ({
          ...current, [rehearsalSection]: (current[rehearsalSection] ?? 0) + seconds,
        }));
      }
    };
    if (rehearsalSection !== null) {
      recognition.onaudiostart = () => {
        if (!disposed && !finishCapture && audioStartedAt === null) audioStartedAt = performance.now();
      };
      recognition.onaudioend = endAudioCapture;
    }

    recognition.onresult = (event) => {
      if (disposed || !sameRun() || (rehearsalSection !== null && captureRevision.current !== restartRevision)) return;
      const finalParts: SpeechSegment[] = [];
      let interimPart = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const words = result[0]?.transcript?.trim() ?? "";
        if (!words) continue;
        if (result.isFinal) {
          finalParts.push({
            text: words,
            sectionId: rehearsalSection ?? latest.current.sectionId,
            atSecond: latest.current.totalElapsed,
            language,
          });
        } else {
          interimPart = words;
        }
      }
      if (finalParts.length > 0) setSegments((current) => [...current, ...finalParts]);
      setInterim(interimPart);
    };

    recognition.onerror = (event) => {
      if (disposed || finishCapture || !sameRun()) return;
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        stopForError = true;
        setError("Allow microphone access in your browser.");
        setEnabled(false);
      } else {
        stopForError = true;
        setError("Transcription stopped. Try again.");
        setEnabled(false);
      }
    };

    const start = () => {
      if (disposed || stopForError || !sameRun()) return;
      try {
        recognition.start();
        started = true;
        setListening(true);
        setError("");
      } catch {
        setListening(false);
      }
    };

    recognition.onend = () => {
      endAudioCapture();
      started = false;
      if (finishCapture) {
        finishCapture();
        return;
      }
      setListening(false);
      setInterim("");
      if (!disposed && !stopForError) restartTimer = window.setTimeout(start, 700);
    };

    if (rehearsalSection !== null && draining.current) {
      void draining.current.then(start);
    } else {
      start();
    }
    const detach = () => {
      disposed = true;
      recognition.onend = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onaudiostart = null;
      recognition.onaudioend = null;
    };
    return () => {
      endAudioCapture();
      if (restartTimer !== null) window.clearTimeout(restartTimer);
      if (rehearsalSection === null || !started) {
        detach();
        if (started) {
          try { recognition.stop(); } catch { /* Browser already stopped. */ }
        }
        return;
      }

      // Await the final result for this section before opening another recognizer.
      // The timer stays responsive even if the browser never reports an end event.
      if (sameRun()) {
        setTranscriptPending(true);
        setListening(false);
        setInterim("");
      }
      let resolveDrain: () => void = () => {};
      draining.current = new Promise<void>((resolve) => { resolveDrain = resolve; });
      const timeout = window.setTimeout(() => finishCapture?.(), 1500);
      finishCapture = () => {
        window.clearTimeout(timeout);
        detach();
        draining.current = null;
        if (sameRun()) setTranscriptPending(false);
        resolveDrain();
      };
      try { recognition.stop(); } catch { finishCapture(); }
    };
  }, [enabled, active, language, provider, rehearsalSection, restartRevision]);

  useEffect(() => {
    if (!enabled || !active || provider !== "qwen") return;
    if (!relayConfigured || relayCode.length < 24) {
      setError("The private relay URL and access code are required.");
      setEnabled(false);
      return;
    }
    setError("");
    const stop = startRelayRecognition({
      url: relayUrl,
      accessCode: relayCode,
      language,
      onReady: () => { setListening(true); setError(""); },
      onFinal: (text, locale) => {
        setSegments((current) => [...current, {
          text, sectionId: latest.current.sectionId,
          atSecond: latest.current.totalElapsed, language: locale,
        }]);
      },
      onPartial: setInterim,
      onError: (message) => {
        setError(message);
        setListening(false);
        setEnabled(false);
      },
    });
    return () => {
      stop();
      setListening(false);
      setInterim("");
    };
  }, [enabled, active, provider, language, relayCode, relayUrl, relayConfigured]);

  return {
    available,
    enabled,
    setEnabled,
    language,
    setLanguage,
    provider,
    setProvider,
    relayCode,
    setRelayCode,
    relayConfigured,
    relayIsMock,
    listening,
    error,
    segments,
    transcriptPending,
    captureSecondsBySection,
    restartSection,
    interim,
    reset,
    transcript: segments.map((segment) => segment.text).join(" "),
  };
}
