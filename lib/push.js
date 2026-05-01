// Push-notification dispatch.
//
// Two driver shapes:
//   - "expo"  — Expo's push API (https://exp.host/--/api/v2/push/send).
//               One HTTP call, batched up to 100 notifications. Works
//               for both iOS + Android via Expo's app credentials.
//               Default driver — matches the mobile app's existing
//               Expo setup.
//   - "console" — log-only, for dev. Default when EXPO_ACCESS_TOKEN
//               isn't set.
//
// Direct APNs / FCM are intentionally out of scope until we ship a
// non-Expo binary; the data model carries a `provider` column on
// PushDevice so future drivers slot in without migration.
//
// Inputs are plain DTOs so the function is testable without hitting
// Expo. The fetch override is a parameter (not a module-level mock)
// so vitest can pass its own.

import { logger } from "./log.js";

const log = logger.child("push");

const DRIVER = (process.env.PUSH_DRIVER || "").toLowerCase()
  || (process.env.EXPO_ACCESS_TOKEN ? "expo" : "console");

const EXPO_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;

/**
 * @param {Array<{token: string, title: string, body: string, data?: any}>} messages
 * @param {{ fetchImpl?: typeof fetch, accessToken?: string, driver?: string }} [opts]
 * @returns {Promise<{ sent: number, retiredTokens: string[], errors: Array<{token: string, error: string}> }>}
 */
export async function sendPushBatch(messages, opts = {}) {
  if (!messages.length) return { sent: 0, retiredTokens: [], errors: [] };
  const driver = opts.driver || DRIVER;
  if (driver === "console") return consoleSend(messages);
  if (driver === "expo") return expoSend(messages, opts);
  log.warn("unknown driver; falling back to console", { driver });
  return consoleSend(messages);
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

function maskToken(t) {
  if (!t) return "";
  if (t.length <= 12) return `${t.slice(0, 3)}…`;
  return `${t.slice(0, 8)}…${t.slice(-4)}`;
}

export const pushDriver = DRIVER;
