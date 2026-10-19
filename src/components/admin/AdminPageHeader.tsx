// Shared header for admin subpages (Modern Clean, Admin board): small
// mono kicker, semibold title, muted description, actions on the right.

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
      <div className="mb-1.5 eyebrow">§ {kicker}</div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink md:text-[36px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
