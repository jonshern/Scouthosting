import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";

export default async function AdminOverview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({
    where: { slug },
    include: { _count: { select: { members: true, announcements: true, events: true } } },
  });
  if (!org) notFound();
  return (
    <section>
      <h1 className="font-display text-3xl font-semibold">{org.displayName}</h1>
      <p className="mt-2 text-ink-muted">Plan: {org.plan}</p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Stat label="Members" value={org._count.members} />
        <Stat label="Announcements" value={org._count.announcements} />
        <Stat label="Events" value={org._count.events} />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <div className="text-sm text-ink-muted">{label}</div>
      <div className="mt-2 font-display text-3xl font-semibold">{value}</div>
    </div>
  );
}
