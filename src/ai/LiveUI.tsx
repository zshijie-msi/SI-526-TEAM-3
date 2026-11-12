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
  cue: LiveCue | null;
}

export function LiveAnalysisControls(props: LiveAnalysisUIProps) {
  if (!props.configured) return null;
  return (
    <details className="live-ai-controls">
      <summary>{props.mockMode ? "Preview simulated AI feedback" : "Optional live AI feedback"}</summary>
      <p>
        {props.mockMode ?
          "This mode shows simulated feedback." :
          "With permission, recent transcript text, optional outline, and timing data are sent to the configured AI model."}
        {" "}The timer never waits for the response.
      </p>
      <label htmlFor="live-ai-code">Private pilot access code</label>
      <input id="live-ai-code" type="password" autoComplete="off"
        placeholder="24+ characters supplied by project owner"
        value={props.accessCode} disabled={props.enabled}
        onChange={(event)=>props.setAccessCode(event.target.value)} />
      <button type="button" disabled={!props.enabled && props.accessCode.length < 24}
        onClick={()=>props.setEnabled(!props.enabled)} className="live-ai-activate">
        {props.enabled ? "Stop live model feedback" :
          props.mockMode ? "Enable simulated feedback" : "Enable live AI feedback"}
      </button>
      {props.busy && <small>Checking the latest transcript without stopping the timer…</small>}
      {props.error && <p className="live-ai-error" role="alert">{props.error}</p>}
      {props.cue && <p className="live-ai-last" role="status">
        <strong>{props.cue.source==="mock"?"Simulation":"AI insight"}:</strong> {props.cue.text}
      </p>}
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
        <small>{cue.source==="mock"?"SIMULATED FEEDBACK — NOT AI":"LIVE AI COACH"}</small>
        <p>{cue.text}</p>
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss AI hint">×</button>
    </aside>
  );
}
