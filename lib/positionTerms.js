// Position-of-Responsibility reconciliation. Member.position keeps the
// current label denormalized for fast list rendering; this module keeps
// the PositionTerm history table in sync whenever that label changes.
//
//   - new label is empty → close any open term
//   - new label matches the open term → no-op
//   - new label differs → close the open term, open a new one starting "now"

export async function reconcilePositionTerm(
  prisma,
  orgId,
  memberId,
  newPosition,
  now = new Date(),
) {
  const openTerm = await prisma.positionTerm.findFirst({
    where: { orgId, memberId, endedAt: null },
  });
  const newLabel = (newPosition || "").trim() || null;
  if (!newLabel) {
    if (openTerm) {
      await prisma.positionTerm.update({
        where: { id: openTerm.id },
        data: { endedAt: now },
      });
    }
    return;
  }
  if (openTerm && openTerm.position === newLabel) return;
  await prisma.$transaction(async (tx) => {
    if (openTerm) {
      await tx.positionTerm.update({
        where: { id: openTerm.id },
        data: { endedAt: now },
      });
    }
    await tx.positionTerm.create({
      data: {
        orgId,
        memberId,
        position: newLabel,
        startedAt: now,
      },
    });
  });
}
