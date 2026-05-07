// Live announcements widget for the public unit homepage.

"use client";

import { useEffect, useState } from "react";

type AnnouncementSummary = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
};

type State =
  | { kind: "loading" }
  | { kind: "ok"; items: AnnouncementSummary[] }
  | { kind: "empty" }
  | { kind: "error" };

function relativeDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AnnouncementsWidget({ orgSlug }: { orgSlug: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/orgs/${encodeURIComponent(orgSlug)}/announcements`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { announcements: AnnouncementSummary[] }) => {
        if (cancelled) return;
        setState(
          data.announcements.length === 0
            ? { kind: "empty" }
            : { kind: "ok", items: data.announcements },
        );
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [orgSlug]);

  if (state.kind === "loading") {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded bg-line-soft"
            aria-hidden
          />
        ))}
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <p className="text-sm text-slate-muted">
        Couldn&apos;t load announcements right now.
      </p>
    );
  }
  if (state.kind === "empty") {
    return <p className="text-sm text-slate-muted">No announcements yet.</p>;
  }
  return (
    <ul className="space-y-4">
      {state.items.map((a) => (
        <li key={a.id} className="border-t border-line-soft pt-4">
          <div className="text-xs text-slate-muted">
            {relativeDate(a.createdAt)}
          </div>
          <div className="mt-1 font-semibold text-slate-ink">{a.title}</div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-soft">
            {a.body}
          </p>
        </li>
      ))}
    </ul>
  );
}
