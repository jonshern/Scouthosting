import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";

export default async function OrgHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({
    where: { slug },
    include: {
      announcements: { orderBy: { createdAt: "desc" }, take: 3 },
    },
  });
  if (!org) notFound();
  return (
    <section className="mx-auto max-w-content px-6 py-16">
      <h1 className="font-display text-4xl md:text-5xl font-semibold">
        {org.unitType} {org.unitNumber}
      </h1>
      <p className="mt-2 text-ink-muted">{org.tagline ?? `${org.charterOrg} • ${org.city}, ${org.state}`}</p>

      <div className="mt-12 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl font-semibold">Meetings</h2>
          <p className="mt-2 text-ink-muted">
            {org.meetingDay} at {org.meetingTime}.
            {org.meetingLocation && <> {org.meetingLocation}.</>}
          </p>
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold">Recent announcements</h2>
          <ul className="mt-2 space-y-3">
            {org.announcements.length === 0 && (
              <li className="text-ink-muted">Nothing posted yet.</li>
            )}
            {org.announcements.map((a) => (
              <li key={a.id} className="card">
                <div className="font-medium">{a.title}</div>
                <div className="mt-1 text-sm text-ink-muted">
                  {new Date(a.createdAt).toLocaleDateString()}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
