import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { EmailComposer } from "@/components/admin/EmailComposer";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { requireAdminPage } from "@/lib/admin/guard";

export default async function AdminEmail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();

  const patrolRows = await prisma.member.findMany({
    where: { orgId: org.id, deletedAt: null, patrol: { not: null } },
    select: { patrol: true },
    distinct: ["patrol"],
    orderBy: { patrol: "asc" },
  });
  const patrols = patrolRows.map((r) => r.patrol).filter((p): p is string => Boolean(p));

  const recent = await prisma.mailLog.findMany({
    where: { orgId: org.id },
    orderBy: { sentAt: "desc" },
    take: 20,
    select: {
      id: true,
      subject: true,
      audienceLabel: true,
      recipientCount: true,
      deliveredCount: true,
      failedCount: true,
      status: true,
      sentAt: true,
    },
  });

  return (
    <section className="space-y-10">
      <AdminPageHeader
        kicker="Messages"
        title="Group email"
        description={
          <>
            Sends from the configured driver. In dev that&apos;s the console
            (logs to stdout). In production set{" "}
            <code className="font-mono text-xs">MAIL_DRIVER=resend</code> +{" "}
            <code className="font-mono text-xs">RESEND_API_KEY</code>.
          </>
        }
      />

      <EmailComposer orgSlug={slug} patrols={patrols} csrf={<CsrfTokenInput />} />

      <div className="space-y-3">
        <h2 className="font-display text-2xl font-normal tracking-[-0.015em]">
          Recent broadcasts
        </h2>
        {recent.length === 0 ? (
          <p className="text-ink-muted">No broadcasts yet.</p>
        ) : (
          <ul className="space-y-3">
            {recent.map((m) => (
              <li key={m.id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link href={`/o/${slug}/admin/email/${m.id}`} className="font-medium">
                      {m.subject}
                    </Link>
                    <div className="mt-1 text-sm text-ink-muted">
                      {m.audienceLabel} ({m.recipientCount}) · {m.status}
                      {m.status !== "dryrun" && (
                        <>
                          {" "}· {m.deliveredCount} delivered
                          {m.failedCount > 0 ? `, ${m.failedCount} failed` : ""}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-ink-muted">
                    {new Date(m.sentAt).toLocaleString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
