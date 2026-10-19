import { cache } from "react";
import { prisma } from "@/lib/db";

/** The unit's display name for page titles; null when there's no such unit or the database is down. */
export const unitName = cache(async (slug: string): Promise<string | null> => {
  try {
    const org = await prisma.org.findUnique({ where: { slug }, select: { displayName: true } });
    return org?.displayName ?? null;
  } catch {
    return null;
  }
});
