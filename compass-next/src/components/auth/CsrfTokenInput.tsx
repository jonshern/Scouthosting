import { readCsrfToken } from "@/lib/security/csrf";
import { honeypotField, honeypotTimingField, makeHoneypotStamp } from "@/lib/security/honeypot";

export async function CsrfTokenInput() {
  const token = (await readCsrfToken()) ?? "";
  return (
    <>
      <input type="hidden" name="_csrf" value={token} />
      <input
        type="text"
        name={honeypotField}
        defaultValue=""
        autoComplete="off"
        tabIndex={-1}
        aria-hidden
        className="hidden"
      />
      <input type="hidden" name={honeypotTimingField} value={makeHoneypotStamp()} />
    </>
  );
}
