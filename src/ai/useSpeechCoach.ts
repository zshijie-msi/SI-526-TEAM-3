import { useEffect, useRef, useState } from "react";
import type { SpeechSegment } from "./metrics";

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
  const [segments, setSegments] = useState<SpeechSegment[]>([]);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const latest = useRef({ sectionId, totalElapsed });
  latest.current = { sectionId, totalElapsed };

  const available = Boolean(recognitionConstructor());
  const reset = () => {
    setEnabled(false);
    setSegments([]);
    setInterim("");
    setError("");
    setListening(false);
  };

  useEffect(() => {
    if (!enabled || !active) {
      setListening(false);
      setInterim("");
      return;
    }
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      setError("Speech recognition is not supported in this browser. Try Chrome or Edge.");
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
        setError("Microphone or speech recognition access was denied. Check browser permissions.");
        setEnabled(false);
      } else {
        stopForError = true;
        setError("Speech recognition failed (" + event.error + "). You can keep using the timer.");
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
  }, [enabled, active, language]);

  return {
    available,
    enabled,
    setEnabled,
    language,
    setLanguage,
    listening,
    error,
    segments,
    interim,
    reset,
    transcript: segments.map((segment) => segment.text).join(" "),
  };
}
