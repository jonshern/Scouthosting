// /unsubscribe/[token] — one-click unsubscribe from the email
// footer. Flips Member.emailUnsubscribed = true. Idempotent.

import { prisma } from "@/lib/db";
import { verifyUnsubToken } from "@/lib/security/unsub-token";

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const claims = verifyUnsubToken(token);
  if (!claims) {
    return (
      <main className="mx-auto max-w-content px-6 py-16 text-center">
        <h1 className="font-display font-semibold text-3xl">Link expired</h1>
        <p className="mt-2 text-ink-muted">
          This unsubscribe link is no longer valid. Reply to any email from your unit and ask
          to be removed.
        </p>
      </main>
    );
  }

  const member = await prisma.member.findFirst({
    where: { id: claims.memberId, orgId: claims.orgId },
    select: { id: true, email: true, emailUnsubscribed: true },
  });
  if (!member) {
    return (
      <main className="mx-auto max-w-content px-6 py-16 text-center">
        <h1 className="font-display font-semibold text-3xl">Already removed</h1>
      </main>
    );
  }
  if (!member.emailUnsubscribed) {
    await prisma.member.update({
      where: { id: member.id },
      data: { emailUnsubscribed: true, unsubscribedAt: new Date() },
    });
  }
  return (
    <main className="mx-auto max-w-content px-6 py-16 text-center">
      <h1 className="font-display font-semibold text-3xl">Unsubscribed</h1>
      <p className="mt-3 text-ink-muted">
        We won't send broadcast email to <strong>{member.email}</strong> from this unit.
      </p>
      <p className="mt-6 text-sm text-ink-muted">
        Changed your mind? Email your unit's leader and they can re-enable it from the roster.
      </p>
    </main>
  );
}
