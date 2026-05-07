import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { renderMarkdownLite } from "@/lib/markdown";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default async function AdminEmailDetail({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const log = await prisma.mailLog.findUnique({ where: { id } });
  if (!log || log.orgId !== org.id) notFound();

  type Recip = { name: string; email: string; phone?: string | null; channel: string };
  const recipients: Recip[] = Array.isArray(log.recipients) ? (log.recipients as unknown as Recip[]) : [];

  return (
    <section className="space-y-10">
      <Link href={`/o/${slug}/admin/email`} className="text-sm">← Back to broadcasts</Link>
      <AdminPageHeader
        kicker="Messages"
        title={log.subject}
        description={`${log.audienceLabel} (${log.recipientCount}) · ${log.status} · ${new Date(log.sentAt).toLocaleString()}`}
      />
      {log.status !== "dryrun" && (
        <div className="text-sm">
          {log.deliveredCount} delivered{log.failedCount > 0 ? `, ${log.failedCount} failed` : ""}
        </div>
      )}
      {log.errors && (
        <pre className="card text-xs text-red-700 bg-red-50 whitespace-pre-wrap">{log.errors}</pre>
      )}

      <div className="card">
        <h2 className="font-display text-2xl font-normal tracking-[-0.015em] mb-2">Body preview</h2>
        <div
          className="prose prose-stone"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: renderMarkdownLite(log.body) }}
        />
      </div>

      <div>
        <h2 className="font-display text-2xl font-normal tracking-[-0.015em] mb-2">Recipients</h2>
        <ul className="text-sm divide-y divide-ink-muted/15">
          {recipients.map((r, i) => (
            <li key={`${r.email}-${i}`} className="py-2 flex justify-between gap-4">
              <span>{r.name}</span>
              <span className="text-slate-muted">{r.email}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
