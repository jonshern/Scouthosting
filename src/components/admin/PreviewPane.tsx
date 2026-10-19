"use client";

// Live preview pane with phone / tablet / desktop frame switcher.
// Renders the unit's own /o/<slug> page in an iframe and lets the
// leader tab between viewport widths so they can sanity-check the
// hero + canvas layout without leaving the editor.

import { useState } from "react";

type Frame = "mobile" | "tablet" | "desktop";

const FRAMES: Record<Frame, { label: string; width: number; ratio: string }> = {
  mobile: { label: "Mobile", width: 390, ratio: "9 / 19.5" },
  tablet: { label: "Tablet", width: 820, ratio: "3 / 4" },
  desktop: { label: "Desktop", width: 1280, ratio: "16 / 10" },
};

export function PreviewPane({ src }: { src: string }) {
  const [frame, setFrame] = useState<Frame>("desktop");
  const [bust, setBust] = useState(0);
  const f = FRAMES[frame];

  return (
    <div className="rounded-xl border border-line bg-surface p-4 sticky top-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <span className="font-mono text-[12px] font-medium uppercase tracking-[0.08em] text-muted">§ Live preview</span>
        <button
          type="button"
          onClick={() => setBust((b) => b + 1)}
          className="text-xs text-slate-soft hover:text-ink"
          title="Reload preview"
        >
          ↻ Refresh
        </button>
      </div>
      <div role="tablist" aria-label="Frame size" className="flex gap-1 mb-3">
        {(Object.keys(FRAMES) as Frame[]).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={frame === k}
            onClick={() => setFrame(k)}
            className={
              "px-3 py-1 text-xs rounded-full transition-colors " +
              (frame === k
                ? "bg-ink text-white"
                : "text-slate-soft hover:text-ink hover:bg-surface-alt")
            }
          >
            {FRAMES[k].label}
          </button>
        ))}
      </div>
      <div
        className="mx-auto rounded-md border border-line-strong bg-bg overflow-hidden"
        style={{
          width: "100%",
          maxWidth: f.width,
          aspectRatio: f.ratio,
        }}
      >
        <iframe
          key={bust}
          src={`${src}${src.includes("?") ? "&" : "?"}_preview=${bust}`}
          title="Site preview"
          loading="lazy"
          className="w-full h-full"
          // Sandbox the iframe so any embedded scripts can't break out
          // — the preview is just a render, not a full sub-app.
          sandbox="allow-same-origin allow-scripts"
        />
      </div>
      <p className="mt-2 text-xs text-slate-muted">
        Preview reflects the most recent Save — click <strong>Refresh</strong>{" "}
        after editing to see your changes.
      </p>
    </div>
  );
}
