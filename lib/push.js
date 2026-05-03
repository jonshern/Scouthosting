// Push-notification dispatch.
//
// Driver shapes:
//   - "expo"  — Expo's push API (https://exp.host/--/api/v2/push/send).
//               One HTTP call, batched up to 100 notifications. Works
//               for both iOS + Android via Expo's app credentials.
//               Default driver — matches the mobile app's existing
//               Expo setup.
//   - "webpush" — W3C Web Push (browser notifications via service
//               worker). Subscription endpoint + VAPID-signed POST.
//               One HTTP call per recipient (no Expo-style batching).
//               PushDevice.token holds the JSON.stringified
//               subscription object.
//   - "console" — log-only, for dev. Default when EXPO_ACCESS_TOKEN
//               isn't set.
//
// Direct APNs / FCM are intentionally out of scope until we ship a
// non-Expo binary; the data model carries a `provider` column on
// PushDevice so future drivers slot in without migration.
//
// sendPushBatch dispatches each message to the right driver based on
// the per-message `provider` field (defaults to the env-default for
// backward compat). Web push and Expo both contribute to the same
// retiredTokens / errors output so callers can prune dead tokens
// uniformly.

import webpush from "web-push";
import { logger } from "./log.js";

const log = logger.child("push");

const DRIVER = (process.env.PUSH_DRIVER || "").toLowerCase()
  || (process.env.EXPO_ACCESS_TOKEN ? "expo" : "console");

const EXPO_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_CONTACT = process.env.VAPID_CONTACT || "mailto:ops@compass.app";

let vapidConfigured = false;
function ensureVapid() {
  if (vapidConfigured) return true;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false;
  try {
    webpush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC, VAPID_PRIVATE);
    vapidConfigured = true;
    return true;
  } catch (err) {
    log.warn("invalid VAPID keys", { err: err && err.message });
    return false;
  }
}

export function vapidPublicKey() {
  return VAPID_PUBLIC || null;
}

/**
 * @param {Array<{token: string, title: string, body: string, data?: any, provider?: string}>} messages
 * @param {{ fetchImpl?: typeof fetch, accessToken?: string, driver?: string }} [opts]
 * @returns {Promise<{ sent: number, retiredTokens: string[], errors: Array<{token: string, error: string}> }>}
 *
 * Per-message `provider` overrides the env default. Web-push messages
 * always go through the webpush driver regardless of the env default
 * — letting a single dispatch fan out to mixed mobile + web devices.
 */
export async function sendPushBatch(messages, opts = {}) {
  if (!messages.length) return { sent: 0, retiredTokens: [], errors: [] };
  const driver = opts.driver || DRIVER;

  // Split out webpush messages (driven per-row) from the rest (driven
  // by the configured env default). The default-driven group can use
  // its own batching path; webpush sends one-by-one.
  const webpushMessages = messages.filter((m) => m.provider === "webpush");
  const otherMessages = messages.filter((m) => m.provider !== "webpush");

  let combined = { sent: 0, retiredTokens: [], errors: [] };
  if (otherMessages.length) {
    const r = driver === "expo"
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

function mergeResults(a, b) {
  return {
    sent: a.sent + b.sent,
    retiredTokens: [...a.retiredTokens, ...b.retiredTokens],
    errors: [...a.errors, ...b.errors],
  };
}

function consoleSend(messages) {
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

async function expoSend(messages, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const accessToken = opts.accessToken || process.env.EXPO_ACCESS_TOKEN || "";
  let sent = 0;
  const retiredTokens = [];
  const errors = [];

  for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
    const slice = messages.slice(i, i + EXPO_BATCH_SIZE);
    const payload = slice.map((m) => ({
      to: m.token,
      title: m.title,
      body: m.body,
      data: m.data || {},
      sound: "default",
    }));
    let body;
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
      body = await res.json();
    } catch (err) {
      log.warn("Expo push fetch failed", { err });
      for (const m of slice) errors.push({ token: m.token, error: "network" });
      continue;
    }
    const tickets = Array.isArray(body?.data) ? body.data : [];
    tickets.forEach((t, idx) => {
      const token = slice[idx]?.token;
      if (t?.status === "ok") {
        sent++;
        return;
      }
      const code = t?.details?.error || t?.message || "error";
      // "DeviceNotRegistered" / "InvalidCredentials" mean the token is
      // dead; mark for retire so the next dispatch skips it.
      if (code === "DeviceNotRegistered" || code === "InvalidCredentials") {
        retiredTokens.push(token);
      }
      errors.push({ token, error: code });
    });
  }
  return { sent, retiredTokens, errors };
}

async function webpushSend(messages, opts = {}) {
  if (!ensureVapid()) {
    // No keys configured — log and treat each message as a soft fail
    // without retiring tokens. Operator hasn't completed setup.
    log.warn("VAPID keys not configured; skipping webpush", { count: messages.length });
    return {
      sent: 0,
      retiredTokens: [],
      errors: messages.map((m) => ({ token: m.token, error: "vapid_unconfigured" })),
    };
  }

  // Optional injection point for tests.
  const sender = opts.webpushImpl || webpush.sendNotification.bind(webpush);
  let sent = 0;
  const retiredTokens = [];
  const errors = [];

  for (const m of messages) {
    let subscription;
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
      const status = err?.statusCode;
      // 404 / 410 = subscription is dead. 401/403 = VAPID misconfigured;
      // bail rather than retire (operator issue, not subscriber issue).
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

function maskToken(t) {
  if (!t) return "";
  if (t.length <= 12) return `${t.slice(0, 3)}…`;
  return `${t.slice(0, 8)}…${t.slice(-4)}`;
}

export const pushDriver = DRIVER;
