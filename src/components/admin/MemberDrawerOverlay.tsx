"use client";

// Slide-over modal that wraps the server-rendered MemberDetailBody.
// URL-driven: the drawer is "open" whenever ?member=<id> is present.
// Closing strips that param via router.replace so the roster grid
// stays in place with its filters / scroll / sort intact.
//
// Esc + click-outside-to-close + scroll-lock are all handled here.
// Focus trap is intentionally light — the inner content has its own
// focusable chrome (close button + tab links + form fields), and
// blocking Tab outside the panel would conflict with how Tab cycles
// through the embedded form.

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function MemberDrawerOverlay({
  children,
  /** Pathname to send the user to on close (no member query). */
  closeHref,
}: {
  children: React.ReactNode;
  closeHref: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const panelRef = useRef<HTMLDivElement | null>(null);

  function close() {
    // Preserve other roster filters (tab, q, trash) — only strip
    // member + member-specific tab params.
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.delete("member");
    // The member tab param doubles as the roster's tab — drop only
    // the member-tab signal by checking which set of values it holds.
    // Roster tabs: scouts | adults | counselors | patrols | pending.
    // Member tabs: profile | advancement | parents | medical | activity.
    const memberTabValues = new Set([
      "profile",
      "advancement",
      "parents",
      "medical",
      "activity",
    ]);
    if (memberTabValues.has(next.get("tab") ?? "")) next.delete("tab");
    const qs = next.toString();
    router.replace(qs ? `${closeHref}?${qs}` : closeHref, { scroll: false });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener("keydown", onKey);
    // Prevent the body from scrolling under the open drawer.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
      close();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Member detail"
      className="fixed inset-0 z-50 flex justify-end bg-ink/40 backdrop-blur-sm"
      onMouseDown={onBackdropClick}
    >
      <div
        ref={panelRef}
        className="w-full max-w-[820px] h-full bg-bg shadow-2xl overflow-y-auto"
        // Stop the backdrop's mousedown from firing for clicks
        // inside the panel — onMouseDown bubbles up otherwise.
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between bg-bg/90 backdrop-blur border-b border-line px-6 py-3">
          <span className="font-display italic text-sm text-accent">
            § Member detail
          </span>
          <button
            type="button"
            onClick={close}
            className="text-slate-soft hover:text-ink text-2xl leading-none"
            aria-label="Close drawer"
          >
            ×
          </button>
        </div>
        <div className="px-6 py-6">{children}</div>
      </div>
    </div>
  );
}
