// Resend webhook signature verification + event normalization.
//
// Resend uses Svix-style signing: the request carries three headers,
//   svix-id          (uuid)
//   svix-timestamp   (unix seconds)
//   svix-signature   (one or more "v1,<base64-sig>" tokens; comma-
//                     separated when the secret is being rotated)
// and the signed payload is `${id}.${timestamp}.${body}`. Signature
// is HMAC-SHA256 with a `whsec_<base64>` secret.

import crypto from "node:crypto";

const TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export function verifyResendSignature(
  headers: Record<string, string | undefined>,
  rawBody: string | Buffer,
  secret: string | undefined,
  opts: { now?: Date } = {},
): VerifyResult {
  const id = headers["svix-id"] || headers["Svix-Id"];
  const ts = headers["svix-timestamp"] || headers["Svix-Timestamp"];
  const sigHeader = headers["svix-signature"] || headers["Svix-Signature"];
  if (!id || !ts || !sigHeader) return { ok: false, reason: "missing_headers" };
  if (!secret) return { ok: false, reason: "missing_secret" };

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: "bad_timestamp" };
  const now = opts.now ? opts.now.getTime() : Date.now();
  if (Math.abs(now - tsNum * 1000) > TOLERANCE_MS) {
    return { ok: false, reason: "timestamp_skew" };
  }

  const keyBytes = parseSecret(secret);
  if (!keyBytes) return { ok: false, reason: "bad_secret" };

  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const signedContent = `${id}.${ts}.${body}`;
  const expected = crypto.createHmac("sha256", keyBytes).update(signedContent).digest("base64");

  const tokens = sigHeader.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    const [scheme, b64] = tok.split(",", 2);
    if (scheme !== "v1") continue;
    if (timingSafeEqualBase64(b64, expected)) return { ok: true };
  }
  return { ok: false, reason: "no_match" };
}

function parseSecret(secret: string): Buffer | null {
  const raw = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  try {
    return Buffer.from(raw, "base64");
  } catch {
    return null;
  }
}

function timingSafeEqualBase64(a: string | undefined, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return crypto.timingSafeEqual(ab, bb);
}

export type ResendEvent = {
  type?: string;
  data?: {
    to?: string | string[];
    bounce?: { bounceType?: string };
  };
};

export type NormalizedEvent = {
  kind: "bounced" | "complained" | null;
  email?: string;
  reason?: string;
};

export function normalizeResendEvent(event: ResendEvent | null | undefined): NormalizedEvent {
  if (!event || typeof event !== "object") return { kind: null };
  const type = String(event.type || "");
  const data = event.data || {};
  const email = pickEmail(data);
  if (type === "email.bounced") {
    const cls = data.bounce?.bounceType
      ? `bounced:${String(data.bounce.bounceType).toLowerCase()}`
      : "bounced";
    return { kind: "bounced", email, reason: cls };
  }
  if (type === "email.complained") {
    return { kind: "complained", email, reason: "complained" };
  }
  return { kind: null, email };
}

function pickEmail(data: { to?: string | string[] }): string {
  if (Array.isArray(data.to) && data.to.length) return String(data.to[0] || "").toLowerCase();
  if (typeof data.to === "string") return data.to.toLowerCase();
  return "";
}

export const _internal = { TOLERANCE_MS, parseSecret };
