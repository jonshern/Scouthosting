// Small pieces the owner console (/super-admin) pages share.

import Link from "next/link";
import type { ReactNode } from "react";
import type { License, LicenseTone } from "@/lib/owner/license";

const TONE: Record<LicenseTone, string> = {
  good: "bg-success-soft text-success",
  info: "bg-accent-soft text-accent",
  warn: "bg-warn-soft text-warn",
  bad: "bg-danger-soft text-danger",
  muted: "bg-line-soft text-ink-muted",
};

export function Pill({ tone, children }: { tone: LicenseTone; children: ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONE[tone]}`}>
      {children}
    </span>
  );
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
      <div className="text-xs uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={`mt-1 font-display text-3xl ${tone === "bad" ? "text-danger" : tone === "warn" ? "text-warn" : "text-ink"}`}>
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-ink-muted">{hint}</div> : null}
    </>
  );
  const cls = "block rounded-lg border border-line bg-surface p-4";
  return href ? (
    <Link href={href} className={`${cls} hover:border-line-strong`}>
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
        <h2 className="font-display text-xl">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Done({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-md bg-success-soft px-3 py-2 text-sm text-success">
      {message}
    </p>
  );
}

export function shortDate(d: Date | null | undefined): string {
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
}
