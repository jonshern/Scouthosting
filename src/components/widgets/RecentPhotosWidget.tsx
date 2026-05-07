// Live recent-photos widget for the public unit homepage. Mirrors
// UpcomingEventsWidget — fetches from /api/public on mount, shows a
// loading skeleton, falls back gracefully on error.

"use client";

import { useEffect, useState } from "react";

type PhotoSummary = {
  id: string;
  filename: string;
  caption: string | null;
  takenAt: string | null;
  album: { slug: string; title: string } | null;
};

type State =
  | { kind: "loading" }
  | { kind: "ok"; photos: PhotoSummary[] }
  | { kind: "empty" }
  | { kind: "error" };

export function RecentPhotosWidget({
  orgSlug,
  count = 6,
}: {
  orgSlug: string;
  count?: number;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/orgs/${encodeURIComponent(orgSlug)}/recent-photos`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { photos: PhotoSummary[] }) => {
        if (cancelled) return;
        setState(
          data.photos.length === 0
            ? { kind: "empty" }
            : { kind: "ok", photos: data.photos.slice(0, count) },
        );
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [orgSlug, count]);

  if (state.kind === "loading") {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="aspect-square animate-pulse rounded bg-line-soft"
            aria-hidden
          />
        ))}
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <p className="text-sm text-slate-muted">
        Couldn&apos;t load photos right now. Refresh in a moment.
      </p>
    );
  }
  if (state.kind === "empty") {
    return <p className="text-sm text-slate-muted">No public photos yet.</p>;
  }
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {state.photos.map((p) => (
        <a
          key={p.id}
          href={p.album ? `/photos/${p.album.slug}` : "#"}
          className="block aspect-square overflow-hidden rounded bg-line-soft"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/uploads/${p.filename}`}
            alt={p.caption ?? p.album?.title ?? "Recent photo"}
            className="h-full w-full object-cover transition-transform hover:scale-105"
            loading="lazy"
          />
        </a>
      ))}
    </div>
  );
}
