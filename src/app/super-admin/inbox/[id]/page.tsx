// /super-admin/inbox/[id] — one question: what they wrote, what the app
// sent with it, the replies so far, and the reply box. A reply is
// emailed to them and marks the question answered.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { KIND_NAMES, PRODUCT_NAMES, type InboxProduct } from "@/lib/owner/inbox";
import { Done, Pill, Section, shortDate } from "@/components/owner/ConsoleBits";
import { replyToTicketAction, setTicketStatusAction } from "@/server-actions/super-admin";
import { requireOwnerPage } from "@/lib/owner/guard";

export const metadata = { title: "Message" };

export const dynamic = "force-dynamic";

function when(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export default async function OwnerInboxItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  await requireOwnerPage();
  const { id } = await params;
  const { done } = await searchParams;
  const t = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      org: { select: { slug: true, displayName: true } },
      replies: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!t) return notFound();
  const context = t.context && typeof t.context === "object" ? Object.entries(t.context as Record<string, unknown>) : [];
  const statusButton = (status: string, label: string) => (
    <form action={setTicketStatusAction}>
      <CsrfTokenInput />
      <input type="hidden" name="ticketId" value={t.id} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className="btn-secondary text-xs">
        {label}
      </button>
    </form>
  );

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <Link href="/super-admin/inbox" className="text-sm">
          ← Inbox
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[32px] font-semibold leading-tight tracking-[-0.03em]">{t.subject}</h2>
          <Pill tone={t.status === "closed" ? "muted" : t.status === "answered" ? "good" : "warn"}>{t.status}</Pill>
        </div>
        <p className="text-sm text-ink-muted">
          {KIND_NAMES[t.category] ?? t.category}
          {t.product ? ` about ${PRODUCT_NAMES[t.product as InboxProduct] ?? t.product}` : ""} from {t.fromName ? `${t.fromName}, ` : ""}
          {t.userId ? <Link href={`/super-admin/people/${t.userId}`}>{t.fromEmail}</Link> : t.fromEmail}
          {t.org ? (
            <>
              {" "}
              in <Link href={`/super-admin/orgs/${t.org.slug}`}>{t.org.displayName}</Link>
            </>
          ) : null}{" "}
          · {shortDate(t.createdAt)}
        </p>
        <Done message={done} />
      </header>

      <div className="card whitespace-pre-wrap text-sm">{t.body}</div>

      {context.length ? (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs text-ink-muted">
          {context.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>{k}</dt>
              <dd className="font-mono">{typeof v === "string" ? v : JSON.stringify(v)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {t.replies.length ? (
        <Section title="Replies">
          <ul className="space-y-3">
            {t.replies.map((r) => (
              <li key={r.id} className="card text-sm">
                <div className="mb-1 text-xs text-ink-muted">
                  {r.authorName ?? "You"} · {when(r.createdAt)} · {r.emailed ? "emailed" : "not emailed"}
                </div>
                <div className="whitespace-pre-wrap">{r.body}</div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Reply">
        <form action={replyToTicketAction} className="space-y-2">
          <CsrfTokenInput />
          <input type="hidden" name="ticketId" value={t.id} />
          <textarea name="body" required rows={6} maxLength={8000} aria-label="Reply" className="field w-full" />
          <button type="submit" className="btn-primary text-sm">
            Send reply to {t.fromEmail}
          </button>
        </form>
      </Section>

      <div className="flex flex-wrap gap-2">
        {t.status !== "closed" ? statusButton("closed", "Close") : statusButton("open", "Reopen")}
        {t.status === "open" || t.status === "acknowledged" ? statusButton("answered", "Mark answered without replying") : null}
      </div>
    </div>
  );
}
