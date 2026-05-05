// /o/[slug]/admin/refunds — operator-issued refunds list.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";

export default async function RefundsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/refunds`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return null;
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    return <p className="p-12">Not authorized.</p>;
  }

  const refunds = await prisma.refund.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <h1 className="font-display text-3xl mb-6">Refunds</h1>
      {refunds.length === 0 ? (
        <p className="text-ink-muted">No refunds issued.</p>
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
                    r.status === "issued" ? "text-emerald-700" : "text-red-600"
                  }`}
                >
                  {r.status}
                </span>
              </div>
              <p className="text-sm">{r.reason}</p>
              {r.paymentRef && (
                <p className="text-xs text-ink-muted">
                  ref: <span className="font-mono">{r.paymentRef}</span>
                </p>
              )}
              <p className="text-xs text-ink-muted">
                {r.createdAt.toLocaleDateString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
