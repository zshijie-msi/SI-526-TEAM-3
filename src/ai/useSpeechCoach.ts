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
  sectionId,
  totalElapsed,
}: {
  active: boolean;
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
  const latest = useRef({ sectionId, totalElapsed });
  latest.current = { sectionId, totalElapsed };

  const available = provider === "browser"
    ? Boolean(recognitionConstructor()) : relayConfigured;
  const reset = () => {
    setEnabled(false);
    setSegments([]);
    setInterim("");
    setError("");
    setListening(false);
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
    const recognition = new Constructor();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      if (disposed) return;
      const finalParts: SpeechSegment[] = [];
      let interimPart = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const words = result[0]?.transcript?.trim() ?? "";
        if (!words) continue;
        if (result.isFinal) {
          finalParts.push({
            text: words,
            sectionId: latest.current.sectionId,
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
      if (disposed) return;
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
      if (disposed || stopForError) return;
      try {
        recognition.start();
        setListening(true);
        setError("");
      } catch {
        setListening(false);
      }
    };

    recognition.onend = () => {
      setListening(false);
      setInterim("");
      if (!disposed && !stopForError) restartTimer = window.setTimeout(start, 700);
    };

    start();
    return () => {
      disposed = true;
      if (restartTimer !== null) window.clearTimeout(restartTimer);
      recognition.onend = null;
      recognition.onresult = null;
      recognition.onerror = null;
      try { recognition.stop(); } catch { /* Browser already stopped. */ }
    };
  }, [enabled, active, language, provider]);

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
    interim,
    reset,
    transcript: segments.map((segment) => segment.text).join(" "),
  };
}
