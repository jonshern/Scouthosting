import type { ReactNode } from "react";

/** Top of a plain marketing page: eyebrow, big title, a line under it. */
export function PageHero({ eyebrow, title, lede }: { eyebrow: string; title: ReactNode; lede: ReactNode }) {
  return (
    <header className="max-w-3xl">
      <div className="eyebrow mb-3">{eyebrow}</div>
      <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] md:text-[52px]">{title}</h1>
      <p className="mt-5 max-w-2xl text-[17px] leading-[1.6] text-ink-2">{lede}</p>
    </header>
  );
}

/** A titled card in a two-column grid. */
export function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-6">
      <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      <div className="mt-2 text-[15px] leading-[1.6] text-ink-2">{children}</div>
    </div>
  );
}
