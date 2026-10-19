import type { ReactNode } from "react";

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? (
          <div className="eyebrow mb-2">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-3xl md:text-4xl font-semibold leading-tight tracking-[-0.03em] text-ink">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-[15px] text-ink-2">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
