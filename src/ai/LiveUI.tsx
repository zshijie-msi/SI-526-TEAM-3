import { PreviewAccessField } from "./PreviewAccessField";
import type { LiveCue } from "./useLiveFeedback";
import "./live.css";

export interface LiveAnalysisUIProps {
  configured: boolean;
  mockMode: boolean;
  enabled: boolean;
  setEnabled(value: boolean): void;
  accessCode: string;
  setAccessCode(value: string): void;
  busy: boolean;
  error: string;
}

export function LiveAnalysisControls(props: LiveAnalysisUIProps) {
  if (!props.configured) return null;
  return (
    <details className="live-ai-controls">
      <summary>{props.mockMode ? "Simulated feedback" : "Live AI feedback"}</summary>
      <PreviewAccessField id="live-ai-code" code={props.accessCode}
        onChange={props.setAccessCode} disabled={props.enabled} />
      <button type="button" disabled={!props.enabled && props.accessCode.trim().length < 24}
        onClick={()=>props.setEnabled(!props.enabled)} className="live-ai-activate">
        {props.enabled ? "Stop feedback" :
          props.mockMode ? "Enable simulated feedback" : "Enable live AI feedback"}
      </button>
      {props.busy && <p role="status">Analyzing…</p>}
      {props.error && <p className="live-ai-error" role="alert">{props.error}</p>}
    </details>
  );
}

export function LiveCueOverlay({cue,onDismiss}:{
  cue:LiveCue | null;
  onDismiss():void;
}) {
  if (!cue)return null;
  return (
    <aside className="live-ai-overlay" role="status" aria-label="Live presentation coach">
      <div>
        <strong>{cue.source === "mock" ? "Simulated feedback" : "AI coach"}</strong>
        <p>{cue.text}</p>
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss AI hint">×</button>
    </aside>
  );
}
