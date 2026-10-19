// Small pieces the owner console (/super-admin) pages share.

import Link from "next/link";
import type { ReactNode } from "react";
import type { License, LicenseTone } from "@/lib/owner/license";
import { USAGE_STATE_LABEL, type UsageState } from "@/lib/owner/usage";

const TONE: Record<LicenseTone, string> = {
  good: "bg-done-soft text-done-text",
  info: "bg-accent-soft text-accent-soft-text",
  warn: "bg-attention-soft text-attention-text",
  bad: "bg-danger-soft text-danger",
  muted: "bg-sunk text-ink-2",
};

export function Pill({ tone, children }: { tone: LicenseTone; children: ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium leading-none ${TONE[tone]}`}>
      {children}
    </span>
  );
}

const USAGE_TONE: Record<UsageState, LicenseTone> = { active: "good", quiet: "warn", dormant: "bad", not_started: "muted" };

export function UsageStatePill({ state }: { state: UsageState }) {
  return <Pill tone={USAGE_TONE[state]}>{USAGE_STATE_LABEL[state]}</Pill>;
}

export function LicensePill({ license }: { license: License }) {
  return <Pill tone={license.tone}>{license.label}</Pill>;
}

export function Stat({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  tone?: LicenseTone;
}) {
  const body = (
    <>
      <div className="text-[13px] text-muted">{label}</div>
      <div className={`mt-1 text-[28px] font-semibold leading-tight tracking-[-0.02em] ${tone === "bad" ? "text-danger" : tone === "warn" ? "text-attention" : "text-ink"}`}>
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </>
  );
  const cls = "block rounded-xl border border-line bg-surface p-[18px] text-ink no-underline";
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:border-control hover:text-ink`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Done({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-md bg-done-soft px-3 py-2 text-sm text-done-text">
      {message}
    </p>
  );
}

export function shortDate(d: Date | null | undefined): string {
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
}
