// Every treasury page is for admins and the unit's treasurer only
// (lib/auth/treasury-access.ts). The CSV routes under here check the
// same rule themselves, since layouts don't wrap route handlers.

import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { canManageTreasury, TREASURY_FORBIDDEN } from "@/lib/auth/treasury-access";

export default async function TreasuryLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({ where: { slug }, select: { id: true } });
  if (!org) notFound();
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/treasury`);
  if (!(await canManageTreasury(user, org.id))) {
    return (
      <section className="mx-auto max-w-content px-6 py-16">
        <h1 className="font-display text-2xl font-semibold">Not authorized</h1>
        <p className="mt-2 text-slate-muted">{TREASURY_FORBIDDEN}</p>
      </section>
    );
  }
  return <>{children}</>;
}
