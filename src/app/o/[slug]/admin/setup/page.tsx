// /o/[slug]/admin/setup — guided 12-step rollout for new units. Per
// design_handoff_compass_cms/setup.jsx. Renders the checklist UI;
// progress is per-browser via localStorage (no DB schema change).

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { SetupChecklist } from "@/components/admin/SetupChecklist";
import { requireAdminPage } from "@/lib/admin/guard";

export const metadata = { title: "Setup" };

export default async function AdminSetupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();

  return (
    <section className="space-y-8">
      <AdminPageHeader
        kicker="Welcome"
        title="Get your unit set up"
        description="A guided 12-step rollout, sequenced so each step builds on the last. Most units finish the required steps in 4–6 hours over a couple of evenings. Don't go alone — split it across the committee."
      />
      <SetupChecklist orgSlug={slug} />
    </section>
  );
}
