// Mobile push-token registration. Wraps expo-notifications + posts the
// resulting Expo push token to /api/v1/push/register so the server's
// PushDevice table can fan out chat-message notifications.
//
// Defensive about the runtime: if expo-notifications isn't available
// (Expo Go simulator without a build, web preview, etc.) we log and
// noop. Same shape as lib/sms / lib/mail's "console driver" idea —
// the app always launches.

import { Platform } from "react-native";

import { apiRequest, type ClientOptions } from "./client";

export type RegisterResult = { ok: true; id: string } | { ok: false; reason: string };

/**
 * Acquire the Expo push token from the device + register it with the
 * server. Idempotent (the server upserts on the unique token), so
 * calling on every launch is fine and handles token-rotation cases.
 */
export async function registerPushToken(
  client: ClientOptions,
  opts: { permissionPrompt?: boolean } = {},
): Promise<RegisterResult> {
  let Notifications: typeof import("expo-notifications");
  let Device: typeof import("expo-device") | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifications = require("expo-notifications");
  } catch {
    return { ok: false, reason: "notifications_module_missing" };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Device = require("expo-device");
  } catch {
    // expo-device is convenient but optional; we just lose the
    // simulator check + the device-label hint.
  }

  if (Device && Device.isDevice === false) {
    return { ok: false, reason: "simulator" };
  }

  // Permission prompt on first run; subsequent launches return the
  // already-granted status without re-prompting.
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    if (opts.permissionPrompt === false) {
      return { ok: false, reason: "permission_not_granted" };
    }
    const next = await Notifications.requestPermissionsAsync();
    status = next.status;
    if (status !== "granted") {
      return { ok: false, reason: "permission_denied" };
    }
  }

  let tokenObj: Awaited<ReturnType<typeof Notifications.getExpoPushTokenAsync>>;
  try {
    tokenObj = await Notifications.getExpoPushTokenAsync();
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? `expo_token_${err.message}` : "expo_token_failed",
    };
  }
  if (!tokenObj?.data) return { ok: false, reason: "no_token" };

  const deviceLabel = Device?.modelName || Device?.deviceName || undefined;
  try {
    const response = await apiRequest<{ id: string }>(client, "/push/register", {
      method: "POST",
      body: {
        token: tokenObj.data,
        provider: "expo",
        platform: Platform.OS, // "ios" | "android" | "web"
        deviceLabel,
      },
    });
    return { ok: true, id: response.id };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "register_failed",
    };
  }
}

/** Take this device out of rotation. Best-effort; ignores errors. */
export async function unregisterPushToken(client: ClientOptions): Promise<void> {
  let Notifications: typeof import("expo-notifications");
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifications = require("expo-notifications");
  } catch {
    return;
  }
  try {
    const tokenObj = await Notifications.getExpoPushTokenAsync();
    if (!tokenObj?.data) return;
    await apiRequest(client, "/push/unregister", {
      method: "POST",
      body: { token: tokenObj.data },
    });
  } catch {
    // Logging-only on the server side; no need to surface here.
  }
}
