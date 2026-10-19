import type { ReactNode } from "react";

// Stat tile: label, big number, optional sub-line (Admin board stat strip).
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
    accent: "text-accent-text",
  }[tone];
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="text-[13px] text-muted">
        {label}
      </div>
      <div className={`text-[30px] font-semibold tracking-[-0.02em] mt-1.5 ${valueTone}`}>
        {value}
      </div>
      {sub ? <div className="mt-1 text-[13px] text-muted">{sub}</div> : null}
    </div>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}
