import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "success" | "danger" | "amber" | "teal";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-alt text-slate-soft border-line",
  accent: "bg-accent-soft text-sky border-sky/30",
  success: "bg-success-soft text-success border-success/30",
  danger: "bg-danger-soft text-danger border-danger/30",
  amber: "bg-amber-soft text-amber border-amber/30",
  teal: "bg-teal-soft text-teal border-teal/30",
};

export function Pill({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
