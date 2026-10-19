// Public-facing permission slip signing page. Verifies the signed
// token, renders the event details + consent text + a typed-name
// signature box. POSTs to the sibling /sign route handler, which
// captures IP + UA, writes a PermissionSlip row, and redirects back
// here with ?signed=1 for the confirmation state.

import Link from "next/link";
import { prisma } from "@/lib/db";
import { verifyPermSlipToken } from "@/lib/security/perm-slip-token";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import { effectiveSlipText } from "@/lib/permission-slips";
import { Wordmark } from "@/components/ui";

export const dynamic = "force-dynamic";

type Search = { signed?: string; error?: string };

function ErrorPage({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-content px-6 py-16 text-center">
      <Wordmark />
      <h1 className="mt-8 font-display font-semibold text-3xl text-ink">Link expired or invalid</h1>
      <p className="mt-3 text-sm text-slate-soft">{children}</p>
    </main>
  );
}

export default async function PermissionSlipSignPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Search>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const claims = verifyPermSlipToken(token);
  if (!claims) {
    return (
      <ErrorPage>
        Permission slip links are valid for 90 days. Ask your unit leader
        to resend.
      </ErrorPage>
    );
  }

  const [org, event, member, existing] = await Promise.all([
    prisma.org.findUnique({ where: { id: claims.orgId } }),
    prisma.event.findUnique({ where: { id: claims.eventId } }),
    prisma.member.findUnique({ where: { id: claims.memberId } }),
    prisma.permissionSlip.findUnique({
      where: { eventId_memberId: { eventId: claims.eventId, memberId: claims.memberId } },
    }),
  ]);
  if (!org || !event || !member || event.orgId !== org.id || member.orgId !== org.id) {
    return <ErrorPage>This slip is no longer attached to a valid event.</ErrorPage>;
  }

  // Decrypt the youth's name only — display, no edits from this surface.
  let scoutName = "your Scout";
  if (org.encryptedDek) {
    const dek = unwrapDekWithMaster(org);
    const pii = decryptMemberPii(member, dek, org.id);
    scoutName = `${pii.firstName} ${pii.lastName}`.trim() || scoutName;
  }

  const slipText = effectiveSlipText(event.permissionSlipText);
  const signed = sp.signed === "1" || existing !== null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Wordmark />
      <header className="mt-10">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky">
          § Permission slip
        </div>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.02em] text-ink">
          {event.title}
        </h1>
        <p className="mt-2 text-sm text-slate-soft">
          {event.startsAt.toLocaleString()}
          {event.location ? ` · ${event.location}` : ""}
        </p>
        <p className="mt-1 text-sm text-slate-soft">
          For: <strong className="text-ink">{scoutName}</strong>
        </p>
      </header>

      <section className="mt-8 rounded-xl border border-line bg-surface p-6">
        <h2 className="font-display font-semibold text-lg text-ink">Consent text</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-soft whitespace-pre-line">
          {slipText}
        </p>
      </section>

      {signed ? (
        <section className="mt-8 rounded-xl border border-success/30 bg-success-soft p-6">
          <h2 className="font-display font-semibold text-lg text-success">Signed — thank you</h2>
          <p className="mt-2 text-sm text-slate-soft">
            We&rsquo;ve recorded your permission for {scoutName} to attend{" "}
            {event.title}. Your unit&rsquo;s leadership has been notified.
            You can re-sign by reopening this email link if anything
            changes.
          </p>
          <p className="mt-4 text-xs text-slate-muted">
            Signed by: <strong>{existing?.signedByName ?? claims.parentName}</strong>{" "}
            on {(existing?.signedAt ?? new Date()).toLocaleString()}
          </p>
          <Link href="/" className="mt-6 inline-block text-sm text-sky">
            Back to home →
          </Link>
        </section>
      ) : (
        <form
          action={`/permission-slip/${token}/sign`}
          method="POST"
          className="mt-8 space-y-4 rounded-xl border border-line bg-surface p-6"
        >
          <div>
            <label className="label" htmlFor="signedByName">
              Type your full name to sign
            </label>
            <input
              id="signedByName"
              name="signedByName"
              type="text"
              required
              defaultValue={claims.parentName}
              autoComplete="name"
              className="field"
            />
            <p className="mt-1 text-xs text-slate-muted">
              Typing your name acts as your electronic signature. We
              record the time and your IP address for audit.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="notes">
              Anything the leaders should know? (allergies, medications,
              early pickup, etc.)
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              className="field"
              placeholder="Optional"
            />
          </div>
          {sp.error ? (
            <p className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              {sp.error}
            </p>
          ) : null}
          <button type="submit" className="btn-primary">
            Sign permission slip
          </button>
        </form>
      )}
    </main>
  );
}
