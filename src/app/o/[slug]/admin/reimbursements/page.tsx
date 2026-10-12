// /o/[slug]/admin/reimbursements — list + status update.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { canManageTreasury } from "@/lib/auth/treasury-access";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { setReimbursementStatus } from "@/server-actions/reimbursements";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { requireAdminPage } from "@/lib/admin/guard";

const STATUSES = ["pending", "approved", "denied", "paid"] as const;

export default async function ReimbursementsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/reimbursements`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return null;
  if (!(await canManageTreasury(user, org.id))) {
    return <p className="p-12">Not authorized.</p>;
  }

  const rows = await prisma.reimbursement.findMany({
    where: { orgId: org.id },
    orderBy: [{ status: "asc" }, { submittedAt: "desc" }],
    take: 200,
  });

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <AdminPageHeader kicker="Money" title="Reimbursements" />
      {rows.length === 0 ? (
        <p className="text-slate-soft">No reimbursement requests yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="card">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="font-medium">{r.requesterName}</div>
                  <div className="text-xs text-slate-muted">
                    ${(r.amountCents / 100).toFixed(2)} · {r.purpose}
                    {" · submitted "}
                    {r.submittedAt.toLocaleDateString()}
                  </div>
                </div>
                <span
                  className={`text-xs uppercase tracking-wide ${
                    r.status === "approved" || r.status === "paid"
                      ? "text-emerald-700"
                      : r.status === "denied"
                      ? "text-red-600"
                      : "text-amber-700"
                  }`}
                >
                  {r.status}
                </span>
              </div>
              <form action={setReimbursementStatus} className="mt-2 flex gap-2 items-center">
                <CsrfTokenInput />
                <input type="hidden" name="orgSlug" value={slug} />
                <input type="hidden" name="id" value={r.id} />
                <select name="status" defaultValue={r.status} className="input text-sm">
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn-secondary text-xs">
                  Save
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
