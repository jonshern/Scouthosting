// /o/[slug]/admin/refunds/new — issue a refund. Free-form payment
// reference + amount in dollars (server action stores cents).

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { issueRefund } from "@/server-actions/refunds";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default async function NewRefundPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/refunds/new`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return null;
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    return <p className="p-12">Not authorized.</p>;
  }

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <AdminPageHeader kicker="Money" title="Issue refund" />
      <form action={issueRefund} className="space-y-4 max-w-md">
        <CsrfTokenInput />
        <input type="hidden" name="orgSlug" value={slug} />
        <label className="block">
          <span className="block text-sm">Amount (USD)</span>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            className="input mt-1"
          />
        </label>
        <label className="block">
          <span className="block text-sm">Reason</span>
          <textarea name="reason" rows={3} required className="input mt-1" />
        </label>
        <label className="block">
          <span className="block text-sm">Payment reference (optional)</span>
          <input
            name="paymentRef"
            type="text"
            placeholder="ch_xxx, invoice #, etc."
            className="input mt-1"
          />
        </label>
        <label className="block">
          <span className="block text-sm">Notes (optional)</span>
          <textarea name="notes" rows={2} className="input mt-1" />
        </label>
        <button type="submit" className="btn-primary">
          Issue refund
        </button>
      </form>
    </main>
  );
}
