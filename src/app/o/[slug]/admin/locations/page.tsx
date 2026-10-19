// Locations admin (per design_handoff_compass_cms). Card grid by
// type filter + a simple drawer-style edit page below. Locations
// reference Event.locationId for the location autocomplete.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { LocationForm } from "@/components/admin/LocationForms";
import { Pill, Stat, StatRow } from "@/components/ui";
import { requireAdminPage } from "@/lib/admin/guard";

export const metadata = { title: "Event locations" };

export default async function LocationsAdmin({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ type?: string; archived?: string }>;
}) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const sp = await searchParams;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();

  const where = {
    orgId: org.id,
    ...(sp.archived === "1" ? { archived: true } : { archived: false }),
    ...(sp.type ? { type: sp.type } : {}),
  };

  const [locations, eventCounts] = await Promise.all([
    prisma.location.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.event.groupBy({
      by: ["locationId"],
      where: { orgId: org.id, locationId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const eventsByLocation = new Map(
    eventCounts.map((e) => [e.locationId!, e._count._all]),
  );

  const types = ["Meeting", "Camp", "Outdoor", "Service", "Trailhead", "High Adv."];

  return (
    <section className="space-y-10">
      <AdminPageHeader
        kicker="Calendar"
        title="Event locations"
        description="Save the places your unit returns to. Once a location exists here, it auto-completes when you schedule events."
        actions={
          <Link
            href={`/o/${slug}/admin/locations${sp.archived === "1" ? "" : "?archived=1"}`}
            className="btn-secondary"
          >
            {sp.archived === "1" ? "Active locations" : "View archived"}
          </Link>
        }
      />

      <StatRow>
        <Stat label="Locations on file" value={locations.length} />
        <Stat
          label="Most-used type"
          value={
            (() => {
              const counts: Record<string, number> = {};
              for (const l of locations) counts[l.type] = (counts[l.type] ?? 0) + 1;
              const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
              return sorted[0]?.[0] ?? "—";
            })()
          }
        />
        <Stat
          label="Linked to events"
          value={[...eventsByLocation.values()].reduce((a, b) => a + b, 0)}
        />
      </StatRow>

      <form action="" method="GET" className="flex flex-wrap items-center gap-2">
        <Link
          href={`/o/${slug}/admin/locations`}
          className={`pill ${!sp.type ? "border-accent text-accent bg-accent-soft" : ""}`}
        >
          All
        </Link>
        {types.map((t) => (
          <Link
            key={t}
            href={`/o/${slug}/admin/locations?type=${encodeURIComponent(t)}`}
            className={`pill ${sp.type === t ? "border-accent text-accent bg-accent-soft" : ""}`}
          >
            {t}
          </Link>
        ))}
      </form>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {locations.length === 0 ? (
          <p className="text-sm text-slate-muted col-span-full">
            No locations yet. Add one below.
          </p>
        ) : (
          locations.map((l) => (
            <Link
              key={l.id}
              href={`/o/${slug}/admin/locations/${l.id}`}
              className="rounded-xl border border-line bg-surface overflow-hidden hover:border-accent transition-colors"
            >
              {l.imageUrl ? (
                <div
                  className="h-32 w-full bg-surface-alt bg-cover bg-center"
                  style={{ backgroundImage: `url(${l.imageUrl})` }}
                />
              ) : (
                <div className="h-32 w-full bg-surface-alt grid place-items-center text-xs text-slate-muted">
                  No image
                </div>
              )}
              <div className="p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-display font-semibold text-lg text-ink">{l.name}</span>
                  <Pill tone="accent">{l.type}</Pill>
                </div>
                {l.address ? (
                  <p className="mt-1 text-xs text-slate-muted">{l.address}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  {l.distanceMiles != null ? (
                    <span className="font-mono text-slate-soft">
                      {l.distanceMiles < 1 ? "<1" : l.distanceMiles} mi
                    </span>
                  ) : null}
                  {l.tags.slice(0, 3).map((t) => (
                    <span key={t} className="tag">{t}</span>
                  ))}
                </div>
                <div className="mt-2 text-xs text-slate-muted">
                  Used in {eventsByLocation.get(l.id) ?? 0} event
                  {(eventsByLocation.get(l.id) ?? 0) === 1 ? "" : "s"}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      <div>
        <h2 className="font-display font-semibold text-2xl tracking-[-0.015em] text-ink mb-3">
          New location
        </h2>
        <LocationForm orgSlug={slug} csrf={<CsrfTokenInput />} />
      </div>
    </section>
  );
}
