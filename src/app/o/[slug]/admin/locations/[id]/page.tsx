import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import {
  LocationForm,
  DeleteLocationButton,
} from "@/components/admin/LocationForms";

export default async function LocationDetail({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const location = await prisma.location.findUnique({
    where: { id, orgId: org.id },
    include: { events: { orderBy: { startsAt: "desc" }, take: 20 } },
  });
  if (!location) notFound();

  return (
    <section className="space-y-8">
      <AdminPageHeader
        kicker="Calendar · Location"
        title={location.name}
        description={location.address ?? undefined}
        actions={
          <Link href={`/o/${slug}/admin/locations`} className="btn-secondary">
            ← All locations
          </Link>
        }
      />
      <LocationForm
        orgSlug={slug}
        initial={{
          id: location.id,
          name: location.name,
          type: location.type,
          address: location.address,
          description: location.description,
          phone: location.phone,
          website: location.website,
          lat: location.lat,
          lng: location.lng,
          distanceMiles: location.distanceMiles,
          imageUrl: location.imageUrl,
          tags: location.tags,
          archived: location.archived,
        }}
        csrf={<CsrfTokenInput />}
      />

      <div>
        <h2 className="font-display text-xl text-ink mb-3">Events at this location</h2>
        {location.events.length === 0 ? (
          <p className="text-sm text-slate-muted">None yet.</p>
        ) : (
          <ul className="text-sm divide-y divide-line">
            {location.events.map((e) => (
              <li key={e.id} className="py-2 flex items-baseline justify-between gap-3">
                <Link
                  href={`/o/${slug}/admin/events/${e.id}`}
                  className="text-ink hover:text-accent"
                >
                  {e.title}
                </Link>
                <span className="text-xs text-slate-muted">
                  {e.startsAt.toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-line pt-6">
        <DeleteLocationButton orgSlug={slug} id={location.id} csrf={<CsrfTokenInput />} />
      </div>
    </section>
  );
}
