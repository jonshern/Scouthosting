/**
 * Bot trap: a hidden form field bots fill in but humans never see.
 * The form posts back a server-generated minimum dwell-time stamp; if the
 * form is submitted faster than humanly possible, treat as bot.
 */

const FIELD = "_hp_address";
const TIMING_FIELD = "_hp_at";
const MIN_DWELL_MS = 1500;

export const honeypotField = FIELD;
export const honeypotTimingField = TIMING_FIELD;

export function makeHoneypotStamp(now = Date.now()): string {
  return String(now);
}

export type HoneypotResult = { ok: true } | { ok: false; reason: "filled" | "too-fast" | "missing" };

export function checkHoneypot(form: { [k: string]: string | null | undefined }, now = Date.now()): HoneypotResult {
  const filled = form[FIELD];
  if (filled && filled.length > 0) return { ok: false, reason: "filled" };
  const stamp = form[TIMING_FIELD];
  if (!stamp) return { ok: false, reason: "missing" };
  const at = Number(stamp);
  if (!Number.isFinite(at)) return { ok: false, reason: "missing" };
  if (now - at < MIN_DWELL_MS) return { ok: false, reason: "too-fast" };
  return { ok: true };
}
