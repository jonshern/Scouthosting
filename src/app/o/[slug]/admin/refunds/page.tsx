// /o/[slug]/admin/refunds — operator-issued refunds list.

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { canManageTreasury } from "@/lib/auth/treasury-access";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { requireAdminPage } from "@/lib/admin/guard";

export default async function RefundsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/refunds`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return null;
  if (!(await canManageTreasury(user, org.id))) {
    return <p className="p-12">Not authorized.</p>;
  }

  const refunds = await prisma.refund.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <AdminPageHeader
        kicker="Money"
        title="Refunds"
        actions={
          <Link href={`/o/${slug}/admin/refunds/new`} className="btn-primary">
            Issue refund
          </Link>
        }
      />
      {refunds.length === 0 ? (
        <p className="text-slate-soft">No refunds issued.</p>
      ) : (
        <ul className="space-y-2">
          {refunds.map((r) => (
            <li key={r.id} className="card">
              <div className="flex items-baseline justify-between">
                <div className="font-medium">
                  ${(r.amountCents / 100).toFixed(2)}
                </div>
                <span
                  className={`text-xs uppercase tracking-wide ${
                    r.status === "issued" ? "text-done-text" : "text-danger"
                  }`}
                >
                  {r.status}
                </span>
              </div>
              <p className="text-sm">{r.reason}</p>
              {r.paymentRef && (
                <p className="text-xs text-slate-muted">
                  ref: <span className="font-mono">{r.paymentRef}</span>
                </p>
              )}
              <p className="text-xs text-slate-muted">
                {r.createdAt.toLocaleDateString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
