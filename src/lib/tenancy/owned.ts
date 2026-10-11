// Cross-unit guard for IDs that arrive in form input. A leader is
// authorized against one org, but an id in a hidden field can name any
// row in the database. Every input id that is written into a record (or
// used to update one) goes through these helpers first.

import { prisma } from "@/lib/db";

export type OwnedModel = "member" | "location" | "event" | "fund";

type Finder = {
  findMany: (args: {
    where: { id: { in: string[] }; orgId: string };
    select: { id: true };
  }) => Promise<Array<{ id: string }>>;
};

function finder(model: OwnedModel): Finder {
  return prisma[model] as unknown as Finder;
}

/** The subset of `ids` that belong to `orgId`, in input order. */
export async function ownedIds(
  model: OwnedModel,
  orgId: string,
  ids: string[],
): Promise<string[]> {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (!wanted.length) return [];
  const rows = await finder(model).findMany({
    where: { id: { in: wanted }, orgId },
    select: { id: true },
  });
  const ok = new Set(rows.map((r) => r.id));
  return wanted.filter((id) => ok.has(id));
}

/**
 * Optional foreign key from input: empty → null; present and owned by
 * the org → the id; present but foreign or missing → `false` so the
 * caller can reject the write.
 */
export async function ownedIdOrNull(
  model: OwnedModel,
  orgId: string,
  id: string | null | undefined,
): Promise<string | null | false> {
  if (!id) return null;
  const [hit] = await ownedIds(model, orgId, [id]);
  return hit ?? false;
}
