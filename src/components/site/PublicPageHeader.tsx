// Header for public unit-site sub-pages (Calendar, Photos, Posts,
// custom Pages): mono kicker (e.g. "§ Calendar"), semibold title,
// optional lede and actions. Modern Clean, like AdminPageHeader.

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
    <header className="mx-auto mb-10 max-w-content px-6 pt-14">
      <div className="mb-1.5 font-mono text-[12px] font-medium uppercase tracking-[0.08em] text-muted">
        {kicker.startsWith("§") ? kicker : `§ ${kicker}`}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] text-ink md:text-[52px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-3 text-[17px] leading-relaxed text-ink-2">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
