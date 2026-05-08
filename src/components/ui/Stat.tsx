import type { ReactNode } from "react";

// Stat strip card — large display number, eyebrow label, optional sub-line.
// Matches design-handoff/marketing-balanced.jsx stat blocks.
export function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "success" | "danger" | "accent";
}) {
  const valueTone = {
    default: "text-ink",
    success: "text-success",
    danger: "text-danger",
    accent: "text-sky",
  }[tone];
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-muted">
        {label}
      </div>
      <div className={`font-display text-4xl font-normal tracking-[-0.02em] mt-2 ${valueTone}`}>
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-slate-muted">{sub}</div> : null}
    </div>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}
