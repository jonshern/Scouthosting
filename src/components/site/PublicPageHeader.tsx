// Header treatment for public unit-site sub-pages (Calendar, Photos,
// Posts, custom Pages). Mirrors AdminPageHeader's editorial style:
// italic serif kicker (e.g. "§ Calendar") + serif display title +
// optional muted lede + optional actions row. Per
// design_handoff_compass_cms README.

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
      <div className="mb-1.5 font-display text-xs italic text-sky">
        {kicker.startsWith("§") ? kicker : `§ ${kicker}`}
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
