// Lending equipment. An item has `quantity` units; a loan holds one
// until it's returned. The item row is locked first so two leaders
// lending the last tent at the same moment can't both succeed.

import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

export async function lendIfAvailable(args: {
  orgId: string;
  equipmentId: string;
  memberId: string;
  dueAt: Date | null;
  loanNotes: string | null;
  prismaClient?: PrismaClient;
}): Promise<{ ok: true; loanId: string } | { ok: false; out: number }> {
  const db = args.prismaClient ?? defaultPrisma;
  return db.$transaction(async (tx) => {
    const [item] = await tx.$queryRaw<{ quantity: number }[]>`
      SELECT quantity FROM "Equipment" WHERE id = ${args.equipmentId} FOR NO KEY UPDATE`;
    const out = await tx.equipmentLoan.count({
      where: { equipmentId: args.equipmentId, returnedAt: null },
    });
    if (!item || out >= item.quantity) return { ok: false as const, out };
    const loan = await tx.equipmentLoan.create({
      data: {
        orgId: args.orgId,
        equipmentId: args.equipmentId,
        memberId: args.memberId,
        dueAt: args.dueAt,
        loanNotes: args.loanNotes,
      },
      select: { id: true },
    });
    return { ok: true as const, loanId: loan.id };
  });
}
