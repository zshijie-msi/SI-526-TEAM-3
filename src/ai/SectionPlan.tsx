import { useEffect, useRef, useState } from "react";

type ExistingSection = { name: string; target: number };
export type PlannedSection = { name: string; purpose: string; seconds: number; existingIndex: number | null };
type Preview = { sections: PlannedSection[]; replacesExisting: boolean };

export function SectionPlan({
  target, title, sections, code, onCodeChange, onApply, formatTime,
}: {
  target: number;
  title: string;
  sections: ExistingSection[];
  code: string;
  onCodeChange(code: string): void;
  onApply(sections: PlannedSection[]): void;
  formatTime(seconds: number): string;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const [error, setError] = useState("");

  useEffect(() => () => pending.current?.abort(), []);

  const generate = async () => {
    if (pending.current || code.trim().length < 24) return;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setPreview(null);
    setError("");
    try {
      const response = await fetch("/api/section-plan", {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-AI-Demo-Code": code.trim() },
        body: JSON.stringify({
          targetSeconds: target, title: title.trim().slice(0, 160),
          sections: sections.map(({ name, target }) => ({ name: name.slice(0, 100), seconds: target })),
        }),
      });
      const result = await response.json() as Preview & { error?: string };
      if (!response.ok) throw new Error(result.error || "Couldn't generate a plan.");
      if (!Array.isArray(result.sections) ||
          result.sections.reduce((sum, section) => sum + section.seconds, 0) !== target) {
        throw new Error("The suggested times did not add up. Try again.");
      }
      if (!controller.signal.aborted) setPreview(result);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Couldn't generate a plan.");
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  return (
    <details className="speech-coach-remote" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Suggest sections with AI</summary>
      <p>Uses the total time and any existing section names. A title is optional.</p>
      <label htmlFor="plan-ai-code">Private preview access code</label>
      <input id="plan-ai-code" type="password" autoComplete="off" value={code}
        onChange={(event) => onCodeChange(event.target.value)} />
      <button type="button" onClick={() => { void generate(); }} disabled={loading || code.trim().length < 24}>
        {loading ? "Generating…" : "Generate section plan"}
      </button>
      {error && <p role="alert">{error}</p>}
      {preview && (
        <div className="speech-coach-remote-results" aria-label="AI section plan">
          <h3>Suggested plan · {formatTime(target)}</h3>
          {preview.replacesExisting && <p>Your current sections exceed the target. Applying this plan replaces them.</p>}
          <ol>
            {preview.sections.map((section, index) => (
              <li key={index}>
                <strong>{section.name} · {formatTime(section.seconds)}</strong>
                {section.purpose ? <p>{section.purpose}</p> : <p>Keep existing section</p>}
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => { onApply(preview.sections); setPreview(null); setOpen(false); }}>
            Apply section plan
          </button>
          <button type="button" onClick={() => setPreview(null)}>Dismiss</button>
        </div>
      )}
    </details>
  );
}
