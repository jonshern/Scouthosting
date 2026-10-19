// /super-admin/inbox — questions, problems and ideas sent from the
// apps' "Send feedback" screens and the /contact page, newest first,
// plus the feature requests units post on their own roadmap pages.

import Link from "next/link";
import { prisma } from "@/lib/db";
import { KIND_NAMES, listInbox, PRODUCT_NAMES, PRODUCTS, STATUSES, type InboxProduct, type InboxStatus } from "@/lib/owner/inbox";
import { Pill, Section, shortDate } from "@/components/owner/ConsoleBits";
import { requireOwnerPage } from "@/lib/owner/guard";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<InboxStatus | "all", string> = {
  open: "Waiting on you",
  answered: "Answered",
  closed: "Closed",
  all: "All",
};

export default async function OwnerInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; product?: string }>;
}) {
  await requireOwnerPage();
  const sp = await searchParams;
  const status = ([...STATUSES, "all"] as string[]).includes(sp.status ?? "") ? (sp.status as InboxStatus | "all") : "open";
  const product = (PRODUCTS as readonly string[]).includes(sp.product ?? "") ? (sp.product as InboxProduct) : null;
  const [items, feedback] = await Promise.all([
    listInbox({ status, product }),
    prisma.feedbackRequest.findMany({
      where: { status: { in: ["submitted", "triaged"] } },
      orderBy: [{ voteCount: "desc" }, { createdAt: "desc" }],
      take: 30,
      include: { org: { select: { slug: true, displayName: true } } },
    }),
  ]);
  const href = (s: string, p: string | null) => {
    const q = new URLSearchParams({ status: s });
    if (p) q.set("product", p);
    return `/super-admin/inbox?${q.toString()}`;
  };

  return (
    <div className="space-y-10">
      <Section title="Questions and feedback">
        <nav aria-label="Status" className="flex flex-wrap items-center gap-2 text-sm">
          {(["open", "answered", "closed", "all"] as const).map((s) => (
            <Link key={s} href={href(s, product)} className={status === s ? "rounded-full bg-ink px-3 py-1 font-medium text-white no-underline hover:text-white" : "rounded-full border border-line bg-surface px-3 py-1 text-ink-2 no-underline hover:border-control hover:text-ink"}>
              {STATUS_LABEL[s]}
            </Link>
          ))}
          <span className="text-ink-muted">·</span>
          <Link href={href(status, null)} className={!product ? "rounded-full bg-ink px-3 py-1 font-medium text-white no-underline hover:text-white" : "rounded-full border border-line bg-surface px-3 py-1 text-ink-2 no-underline hover:border-control hover:text-ink"}>
            Every product
          </Link>
          {PRODUCTS.map((p) => (
            <Link key={p} href={href(status, p)} className={product === p ? "rounded-full bg-ink px-3 py-1 font-medium text-white no-underline hover:text-white" : "rounded-full border border-line bg-surface px-3 py-1 text-ink-2 no-underline hover:border-control hover:text-ink"}>
              {PRODUCT_NAMES[p]}
            </Link>
          ))}
        </nav>
        {items.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing here.</p>
        ) : (
          <ul className="divide-y divide-divider rounded-xl border border-line bg-surface">
            {items.map((t) => (
              <li key={t.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/super-admin/inbox/${t.id}`} className="font-medium">
                    {t.subject}
                  </Link>
                  <Pill tone={t.category === "bug" ? "warn" : "info"}>{KIND_NAMES[t.category] ?? t.category}</Pill>
                  {t.product ? <Pill tone="muted">{PRODUCT_NAMES[t.product as InboxProduct] ?? t.product}</Pill> : null}
                  {t._count.replies ? <span className="text-xs text-ink-muted">{t._count.replies} replies</span> : null}
                </div>
                <div className="mt-0.5 text-xs text-ink-muted">
                  {t.fromName ? `${t.fromName} · ` : ""}
                  {t.fromEmail}
                  {t.org ? ` · ${t.org.displayName}` : ""} · {shortDate(t.createdAt)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Feature requests on unit roadmaps">
        {feedback.length === 0 ? (
          <p className="text-sm text-ink-muted">No new requests.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {feedback.map((f) => (
              <li key={f.id}>
                <span className="font-medium">{f.title}</span>{" "}
                <span className="text-xs text-ink-muted">
                  {f.voteCount} votes · {f.kind} · {f.status} ·{" "}
                  {f.org ? <Link href={`/o/${f.org.slug}/feedback`}>{f.org.displayName}</Link> : "every unit"} ·{" "}
                  {shortDate(f.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
