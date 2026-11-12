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
        spellCheck={false} aria-describedby={id + "-help"} aria-invalid={nameWasPasted}
        placeholder="Paste the access code from Vercel"
        onChange={(event) => onChange(event.target.value)} />
      <p id={id + "-help"}>
        {nameWasPasted
          ? "You pasted the variable name. In Vercel, reveal and copy its Value, then paste it here."
          : "In Vercel Environment Variables, reveal and copy the Value of AI_DEMO_ACCESS_CODE."}
        {" "}
        <a href="https://vercel.com/zshijie-9188s-projects/si-526-team-3/settings/environment-variables"
          target="_blank" rel="noopener noreferrer">Open Vercel settings</a>
      </p>
    </>
  );
}
