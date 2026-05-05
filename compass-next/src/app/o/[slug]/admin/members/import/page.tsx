// /o/[slug]/admin/members/import — paste CSV / upload XLSX. The
// preview + commit live in the client form (RosterImportForm) which
// holds the parsed rows in component state between steps.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { RosterImportForm } from "@/components/admin/RosterImportForm";

export default async function RosterImportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/members/import`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return null;
  const member = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!member || (member.role !== "leader" && member.role !== "admin")) {
    return <p className="p-12">Not authorized.</p>;
  }

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <h1 className="font-display text-3xl mb-6">Roster import</h1>
      <RosterImportForm orgSlug={slug} csrf={<CsrfTokenInput />} />
    </main>
  );
}
