// /o/[slug]/admin/trips/[id] — single trip detail. Renders the
// shopping list aggregator + dietary conflict report against the
// org's roster.

import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { buildShoppingList } from "@/lib/trips/shopping-list";
import { mealConflicts } from "@/lib/trips/dietary";
import { unwrapDekWithMaster, decryptField } from "@/lib/encryption";
import { requireAdminPage } from "@/lib/admin/guard";

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  await requireAdminPage(slug);
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/trips/${id}`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return notFound();
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    return <p className="p-12">Not authorized.</p>;
  }

  const trip = await prisma.tripPlan.findFirst({
    where: { id, orgId: org.id },
    include: {
      event: {
        select: {
          id: true,
          title: true,
          startsAt: true,
          location: true,
          rsvps: { where: { response: "yes" }, select: { guests: true } },
        },
      },
      meals: {
        orderBy: { sortOrder: "asc" },
        include: { ingredients: true },
      },
      gear: { orderBy: { name: "asc" } },
    },
  });
  if (!trip) return notFound();

  const yesCount = trip.event.rsvps.length;
  const guests = trip.event.rsvps.reduce((acc, r) => acc + (r.guests || 0), 0);
  const headcount = trip.headcountOverride ?? yesCount + guests;

  const groups = buildShoppingList(
    trip.meals.map((m) => ({
      name: m.name,
      ingredients: m.ingredients.map((i) => ({
        name: i.name,
        unit: i.unit,
        category: i.category,
        quantityPerPerson: i.quantityPerPerson,
      })),
    })),
    headcount,
  );

  // Dietary conflicts across yes-RSVP'd members
  const yesEmails = (
    await prisma.rsvp.findMany({
      where: { eventId: trip.event.id, response: "yes" },
      select: { email: true },
    })
  )
    .map((r) => r.email?.toLowerCase())
    .filter((e): e is string => !!e);
  const rawMembers = yesEmails.length && org.encryptedDek
    ? await prisma.member.findMany({
        where: { orgId: org.id, email: { in: yesEmails } },
        select: { encFirstName: true, encLastName: true, dietaryFlags: true },
      })
    : [];
  const members = org.encryptedDek
    ? rawMembers.map((mm) => {
        const dek = unwrapDekWithMaster(org);
        return {
          firstName: decryptField(mm.encFirstName, dek, org.id, "member.firstName") ?? "",
          lastName: decryptField(mm.encLastName, dek, org.id, "member.lastName") ?? "",
          dietaryFlags: mm.dietaryFlags,
        };
      })
    : [];
  const allMealTags = trip.meals.flatMap((m) => m.dietaryTags ?? []);
  const conflicts = mealConflicts(members, allMealTags);

  return (
    <main className="mx-auto max-w-content px-6 py-12 space-y-6">
      <header>
        <h1 className="font-display text-3xl">{trip.event.title}</h1>
        <p className="text-ink-muted text-sm mt-1">
          {trip.event.startsAt.toLocaleDateString()}
          {trip.event.location ? ` · ${trip.event.location}` : ""}
        </p>
        <p className="text-sm mt-2">
          Headcount: <strong>{headcount}</strong>{" "}
          {trip.headcountOverride
            ? "(override)"
            : `(${yesCount} yes + ${guests} guests)`}
        </p>
      </header>

      <section>
        <h2 className="font-display text-xl mb-2">Meals</h2>
        {trip.meals.length === 0 ? (
          <p className="text-ink-muted text-sm">No meals planned.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {trip.meals.map((m) => (
              <li key={m.id}>
                {m.name}{" "}
                <span className="text-ink-muted text-xs">
                  ({m.ingredients.length} ingredients)
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl mb-2">Shopping list</h2>
        {groups.length === 0 ? (
          <p className="text-ink-muted text-sm">Add ingredients to see a shopping list.</p>
        ) : (
          groups.map((g) => (
            <div key={g.category} className="mb-3">
              <h3 className="text-sm font-medium uppercase tracking-wide text-ink-muted">
                {g.category}
              </h3>
              <ul className="text-sm">
                {g.items.map((it) => (
                  <li key={`${it.name}|${it.unit}`}>
                    {it.quantity} {it.unit} {it.name}{" "}
                    <span className="text-ink-muted text-xs">
                      ({it.fromMeals.join(", ")})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section>
        <h2 className="font-display text-xl mb-2">Dietary flags</h2>
        {conflicts.length === 0 ? (
          <p className="text-ink-muted text-sm">No conflicts detected.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {conflicts.map((c, i) => (
              <li key={i}>
                <strong>{c.name}</strong> — {c.flag} (conflicts with{" "}
                {c.tags.join(", ")})
              </li>
            ))}
          </ul>
        )}
      </section>

      {trip.gear.length > 0 && (
        <section>
          <h2 className="font-display text-xl mb-2">Gear</h2>
          <ul className="text-sm">
            {trip.gear.map((g) => (
              <li key={g.id}>
                {g.name}
                {g.quantity ? ` × ${g.quantity}` : ""}
                {g.notes ? ` — ${g.notes}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
