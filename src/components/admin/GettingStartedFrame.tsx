"use client";

// The card around GettingStarted, with a "Hide" that sticks in this
// browser. Shown until the browser says otherwise, so it renders on the
// server and a missing or blocked localStorage just means it stays.

import { useState, useSyncExternalStore } from "react";

function storageKey(orgSlug: string) {
  return `compass:getting-started-hidden:${orgSlug}`;
}

function noSubscribe() {
  return () => {};
}

function readHidden(orgSlug: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(orgSlug)) === "1";
  } catch {
    return false; // storage blocked: keep showing
  }
}

export function GettingStartedFrame({ orgSlug, children }: { orgSlug: string; children: React.ReactNode }) {
  const [hiddenNow, setHidden] = useState(false);
  const hiddenBefore = useSyncExternalStore(
    noSubscribe,
    () => readHidden(orgSlug),
    () => false,
  );

  if (hiddenNow || hiddenBefore) return null;

  function hide() {
    try {
      window.localStorage.setItem(storageKey(orgSlug), "1");
    } catch {
      /* storage blocked: hide for this visit only */
    }
    setHidden(true);
  }

  return (
    <section aria-label="Getting started" className="relative rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={hide}
        className="absolute right-4 top-4 text-[13px] text-muted hover:text-ink"
      >
        Hide
      </button>
      {children}
    </section>
  );
}
