// Live upcoming-events widget for the public unit homepage. Renders a
// loading skeleton, then swaps to data fetched from
// /api/public/orgs/[slug]/upcoming-events. Falls back to a graceful
// "couldn't load" line if the API is unavailable — meaning a DB blip
// shows the (cached, static) page shell with a quiet widget area
// rather than a 500.

"use client";

import { useEffect, useState } from "react";
import { colorForCategory } from "@/lib/calendar/month-grid";

type EventSummary = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  location: string | null;
  category: string | null;
};

type State =
  | { kind: "loading" }
  | { kind: "ok"; events: EventSummary[] }
  | { kind: "empty" }
  | { kind: "error" };

function formatDate(s: string): string {
  const d = new Date(s);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(s: string, allDay: boolean): string {
  if (allDay) return "All day";
  return new Date(s).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function UpcomingEventsWidget({ orgSlug }: { orgSlug: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/orgs/${encodeURIComponent(orgSlug)}/upcoming-events`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { events: EventSummary[] }) => {
        if (cancelled) return;
        setState(
          data.events.length === 0
            ? { kind: "empty" }
            : { kind: "ok", events: data.events },
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
      <ul className="divide-y divide-line-soft">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="h-14 animate-pulse" aria-hidden />
        ))}
      </ul>
    );
  }
  if (state.kind === "error") {
    return (
      <p className="text-sm text-slate-muted">
        Couldn&apos;t load events right now. Refresh in a moment.
      </p>
    );
  }
  if (state.kind === "empty") {
    return <p className="text-sm text-slate-muted">No upcoming events scheduled.</p>;
  }
  return (
    <ul className="divide-y divide-line-soft">
      {state.events.map((e) => {
        const c = colorForCategory(e.category);
        return (
          <li key={e.id} className="flex items-baseline gap-4 py-3">
            <div className="w-20 font-display text-sm italic text-sky">
              {formatDate(e.startsAt)}
            </div>
            <span
              className="mt-1.5 inline-block h-3 w-3 rounded-sm flex-shrink-0"
              style={{ background: c.bg, border: `1px solid ${c.line}` }}
              aria-hidden
            />
            <div className="flex-1">
              <div className="text-sm font-semibold text-slate-ink">{e.title}</div>
              <div className="text-xs text-slate-soft">
                {formatTime(e.startsAt, e.allDay)}
                {e.location ? ` · ${e.location}` : ""}
                {e.category ? ` · ${e.category}` : ""}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
