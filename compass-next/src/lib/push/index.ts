// Push-notification dispatch.
//
// Drivers:
//   - "expo"    — Expo's push API. Default. Batches up to 100/req.
//   - "webpush" — W3C Web Push (VAPID-signed). One request per device.
//   - "console" — log-only, for dev. Default when EXPO_ACCESS_TOKEN
//                 isn't set.
//
// Direct APNs / FCM are out of scope until we ship a non-Expo binary;
// the data model carries a `provider` column so future drivers slot
// in without a migration.

import webpush from "web-push";
import { logger } from "@/lib/log";

const log = logger.child("push");

const EXPO_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;

function defaultDriver(): string {
  return (
    (process.env.PUSH_DRIVER || "").toLowerCase() ||
    (process.env.EXPO_ACCESS_TOKEN ? "expo" : "console")
  );
}

let vapidConfigured = false;
function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY || "";
  const priv = process.env.VAPID_PRIVATE_KEY || "";
  const contact = process.env.VAPID_CONTACT || "mailto:ops@compass.app";
  if (!pub || !priv) return false;
  try {
    webpush.setVapidDetails(contact, pub, priv);
    vapidConfigured = true;
    return true;
  } catch (err) {
    log.warn("invalid VAPID keys", { err: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export type PushMessage = {
  token: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  provider?: "expo" | "webpush" | "console";
};

export type PushResult = {
  sent: number;
  retiredTokens: string[];
  errors: Array<{ token: string; error: string }>;
};

export type PushOpts = {
  fetchImpl?: typeof fetch;
  accessToken?: string;
  driver?: string;
  webpushImpl?: (subscription: unknown, payload: string) => Promise<unknown>;
};

export async function sendPushBatch(
  messages: PushMessage[],
  opts: PushOpts = {},
): Promise<PushResult> {
  if (!messages.length) return { sent: 0, retiredTokens: [], errors: [] };
  const driver = opts.driver || defaultDriver();

  const webpushMessages = messages.filter((m) => m.provider === "webpush");
  const otherMessages = messages.filter((m) => m.provider !== "webpush");

  let combined: PushResult = { sent: 0, retiredTokens: [], errors: [] };
  if (otherMessages.length) {
    const r =
      driver === "expo"
        ? await expoSend(otherMessages, opts)
        : driver === "webpush"
        ? await webpushSend(otherMessages, opts)
        : consoleSend(otherMessages);
    combined = mergeResults(combined, r);
  }
  if (webpushMessages.length) {
    const r = await webpushSend(webpushMessages, opts);
    combined = mergeResults(combined, r);
  }
  return combined;
}

function mergeResults(a: PushResult, b: PushResult): PushResult {
  return {
    sent: a.sent + b.sent,
    retiredTokens: [...a.retiredTokens, ...b.retiredTokens],
    errors: [...a.errors, ...b.errors],
  };
}

function consoleSend(messages: PushMessage[]): PushResult {
  for (const m of messages) {
    log.info("push (console driver)", {
      to: maskToken(m.token),
      title: m.title,
      body: m.body.slice(0, 80),
      dataKeys: m.data ? Object.keys(m.data) : [],
    });
  }
  return { sent: messages.length, retiredTokens: [], errors: [] };
}

async function expoSend(messages: PushMessage[], opts: PushOpts): Promise<PushResult> {
  const fetchImpl = opts.fetchImpl || fetch;
  const accessToken = opts.accessToken || process.env.EXPO_ACCESS_TOKEN || "";
  let sent = 0;
  const retiredTokens: string[] = [];
  const errors: Array<{ token: string; error: string }> = [];

  for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
    const slice = messages.slice(i, i + EXPO_BATCH_SIZE);
    const payload = slice.map((m) => ({
      to: m.token,
      title: m.title,
      body: m.body,
      data: m.data || {},
      sound: "default",
    }));
    let body: { data?: Array<{ status?: string; details?: { error?: string }; message?: string }> } | undefined;
    try {
      const res = await fetchImpl(EXPO_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: accessToken ? `Bearer ${accessToken}` : "",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        log.warn("Expo push HTTP error", { status: res.status });
        for (const m of slice) errors.push({ token: m.token, error: `http_${res.status}` });
        continue;
      }
      body = (await res.json()) as typeof body;
    } catch (err) {
      log.warn("Expo push fetch failed", { err: err instanceof Error ? err.message : String(err) });
      for (const m of slice) errors.push({ token: m.token, error: "network" });
      continue;
    }
    const tickets = Array.isArray(body?.data) ? body!.data : [];
    tickets.forEach((t, idx) => {
      const token = slice[idx]?.token;
      if (t?.status === "ok") {
        sent++;
        return;
      }
      const code = t?.details?.error || t?.message || "error";
      if (code === "DeviceNotRegistered" || code === "InvalidCredentials") {
        retiredTokens.push(token);
      }
      errors.push({ token, error: code });
    });
  }
  return { sent, retiredTokens, errors };
}

async function webpushSend(messages: PushMessage[], opts: PushOpts): Promise<PushResult> {
  if (!ensureVapid()) {
    log.warn("VAPID keys not configured; skipping webpush", { count: messages.length });
    return {
      sent: 0,
      retiredTokens: [],
      errors: messages.map((m) => ({ token: m.token, error: "vapid_unconfigured" })),
    };
  }

  const sender =
    opts.webpushImpl ||
    ((sub: unknown, payload: string) =>
      // web-push types are loose; cast through unknown.
      webpush.sendNotification(sub as never, payload));

  let sent = 0;
  const retiredTokens: string[] = [];
  const errors: Array<{ token: string; error: string }> = [];

  for (const m of messages) {
    let subscription: unknown;
    try {
      subscription = JSON.parse(m.token);
    } catch {
      errors.push({ token: m.token, error: "bad_subscription" });
      retiredTokens.push(m.token);
      continue;
    }
    const payload = JSON.stringify({
      title: m.title,
      body: m.body,
      data: m.data || {},
    });
    try {
      await sender(subscription, payload);
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        retiredTokens.push(m.token);
        errors.push({ token: m.token, error: `gone_${status}` });
      } else if (status === 401 || status === 403) {
        log.warn("webpush auth error — check VAPID keys", { status });
        errors.push({ token: m.token, error: `auth_${status}` });
      } else {
        errors.push({ token: m.token, error: status ? `http_${status}` : "network" });
      }
    }
  }
  return { sent, retiredTokens, errors };
}

function maskToken(t: string): string {
  if (!t) return "";
  if (t.length <= 12) return `${t.slice(0, 3)}…`;
  return `${t.slice(0, 8)}…${t.slice(-4)}`;
}

export const pushDriver = defaultDriver;
