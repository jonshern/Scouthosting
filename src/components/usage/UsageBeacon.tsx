"use client";

// Sends a page view to /api/v1/usage on every Compass page, including
// client-side navigations, for the owner console's usage pages. No
// cookie or storage of its own; the server matches the signed-in
// session and counts signed-out visitors with a hash that changes every
// day (lib/usage). Nothing is sent when the browser asks not to be
// tracked, or from the owner console itself.

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const SKIP = /^\/(super-admin|api)(\/|$)/;

export function doNotTrack(nav: Navigator | undefined): boolean {
  if (!nav) return true;
  const n = nav as Navigator & { globalPrivacyControl?: boolean; doNotTrack?: string | null };
  return n.globalPrivacyControl === true || n.doNotTrack === "1";
}

export function sendUsage(body: unknown): void {
  try {
    const data = JSON.stringify(body);
    if (navigator.sendBeacon?.("/api/v1/usage", new Blob([data], { type: "text/plain" }))) return;
    void fetch("/api/v1/usage", { method: "POST", body: data, keepalive: true, credentials: "same-origin" }).catch(() => {});
  } catch {
    // Tracking never gets in the way of the page.
  }
}

export function UsageBeacon() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (!pathname || SKIP.test(pathname) || doNotTrack(globalThis.navigator)) return;
    const event: Record<string, unknown> = { name: "view", path: pathname };
    if (first.current) {
      first.current = false;
      const q = new URLSearchParams(window.location.search);
      event.referrer = document.referrer || null;
      event.source = q.get("utm_source") || q.get("ref");
    }
    sendUsage({ product: "compass", platform: "web", events: [event] });
  }, [pathname]);

  return null;
}
