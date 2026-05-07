// Header treatment for public unit-site sub-pages (Calendar, Photos,
// Posts, custom Pages). Mirrors AdminPageHeader but lives in the
// site/ namespace so it can evolve independently.

import type { ReactNode } from "react";

export function PublicPageHeader({
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
    <header className="mx-auto mb-10 max-w-content px-6 pt-12">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sky">
        {kicker}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="font-display text-[44px] font-normal leading-[1.05] tracking-[-0.02em] text-slate-ink md:text-[56px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-3 text-base text-slate-soft">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
