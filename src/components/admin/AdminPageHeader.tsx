// Shared header for admin subpages. Implements the AdminBalanced
// editorial treatment: italic sky-blue kicker, Newsreader display
// title, ink-soft description, optional actions on the right.

import type { ReactNode } from "react";

export function AdminPageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8">
      <div className="mb-1.5 font-display text-xs italic text-sky">§ {kicker}</div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="font-display text-4xl font-normal leading-[1.05] tracking-[-0.02em] text-slate-ink">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 text-sm text-slate-soft">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
