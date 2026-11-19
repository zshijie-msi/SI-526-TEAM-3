export function PreviewAccessField({
  id, code, onChange, disabled = false,
}: {
  id: string;
  code: string;
  onChange(code: string): void;
  disabled?: boolean;
}) {
  const nameWasPasted = code.trim() === "AI_DEMO_ACCESS_CODE";
  return (
    <>
      <label htmlFor={id}>Private preview access code</label>
      <input id={id} type="password" autoComplete="off" value={code} disabled={disabled}
        spellCheck={false} aria-describedby={nameWasPasted ? id + "-error" : undefined}
        aria-invalid={nameWasPasted}
        onChange={(event) => onChange(event.target.value)} />
      {nameWasPasted && <p id={id + "-error"} role="alert">Enter the code value.</p>}
    </>
  );
}
