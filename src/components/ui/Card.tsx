import type { HTMLAttributes, ReactNode } from "react";

export function Card({
  children,
  className = "",
  ...rest
}: { children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border border-line bg-surface p-6 shadow-sm ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="mb-4">
      {eyebrow ? (
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky mb-2">
          § {eyebrow}
        </div>
      ) : null}
      <h2 className="font-display text-2xl font-medium tracking-[-0.015em] text-ink">
        {title}
      </h2>
      {description ? (
        <p className="mt-1 text-sm text-slate-muted">{description}</p>
      ) : null}
    </div>
  );
}
