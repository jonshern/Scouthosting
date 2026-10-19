import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "success" | "danger" | "amber" | "teal";

const tones: Record<Tone, string> = {
  neutral: "bg-sunk text-ink-2",
  accent: "bg-accent-soft text-accent-soft-text",
  success: "bg-done-soft text-done-text",
  danger: "bg-danger-soft text-danger",
  amber: "bg-attention-soft text-attention-text",
  teal: "bg-teal-soft text-teal",
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
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
