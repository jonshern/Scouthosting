import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { EventForm } from "@/components/admin/EventForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { requireAdminPage } from "@/lib/admin/guard";

export default async function NewEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const locations = await prisma.location.findMany({
    where: { orgId: org.id, archived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true, address: true },
  });
  return (
    <section className="space-y-10">
      <AdminPageHeader kicker="Calendar" title="New event" />
      <EventForm orgSlug={slug} csrf={<CsrfTokenInput />} locations={locations} />
    </section>
  );
}
