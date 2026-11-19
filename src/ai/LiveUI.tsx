import { useState } from "react";
import { PreviewAccessField } from "./PreviewAccessField";
import "./live.css";

export function LiveCueToggle({
  enabled, needsCode, accessCode, onAccessCodeChange, onToggle,
}: {
  enabled: boolean;
  needsCode: boolean;
  accessCode: string;
  onAccessCodeChange(code: string): void;
  onToggle(enabled: boolean): void;
}) {
  const [enteringCode, setEnteringCode] = useState(false);

  return (
    <div className="present-ai">
      <button type="button" className="present-ai-toggle" aria-pressed={enabled}
        aria-controls={enteringCode ? "present-ai-access" : undefined}
        onClick={() => {
          if (enteringCode || (!enabled && needsCode)) {
            setEnteringCode(!enteringCode);
          } else {
            onToggle(!enabled);
          }
        }}>
        AI Sync Cues
      </button>
      {enteringCode && (
        <form id="present-ai-access" className="present-ai-access" onSubmit={(event) => {
          event.preventDefault();
          if (needsCode) return;
          setEnteringCode(false);
          onToggle(true);
        }}>
          <PreviewAccessField id="live-ai-code" code={accessCode} onChange={onAccessCodeChange} />
          <button type="submit" className="present-ai-toggle" disabled={needsCode}>Enable</button>
        </form>
      )}
    </div>
  );
}
