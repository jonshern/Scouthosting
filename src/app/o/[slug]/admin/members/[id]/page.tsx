import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { MemberForm } from "@/components/admin/MemberForm";
import { MemberLifecycleButtons } from "@/components/admin/MemberLifecycleButtons";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default async function AdminMemberEdit({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  if (!org.encryptedDek) {
    return (
      <section className="space-y-10">
        <AdminPageHeader kicker="Roster" title="Member" />
        <div className="card text-sm text-red-700 bg-red-50 border border-red-200">
          This site doesn&apos;t have an encryption vault yet.
        </div>
      </section>
    );
  }
  const member = await prisma.member.findUnique({ where: { id } });
  if (!member || member.orgId !== org.id) notFound();
  const dek = unwrapDekWithMaster(org);
  const pii = decryptMemberPii(member, dek, org.id);
  const [subaccount, scoutbook] = await Promise.all([
    prisma.memberSubaccount.findUnique({ where: { memberId: member.id } }),
    prisma.scoutbookProfile.findUnique({ where: { memberId: member.id } }),
  ]);

  return (
    <section className="space-y-10">
      <div>
        <Link href={`/o/${slug}/admin/members`} className="text-sm">← All members</Link>
        <div className="mt-1">
          <AdminPageHeader
            kicker="Roster"
            title={`${pii.firstName} ${pii.lastName}`}
          />
        </div>
        {member.deletedAt && (
          <div className="mt-2 inline-block text-sm bg-amber-50 border border-amber-200 rounded p-2">
            Removed on {new Date(member.deletedAt).toLocaleDateString()}.
          </div>
        )}
      </div>

      <MemberForm
        orgSlug={slug}
        initial={{
          id: member.id,
          firstName: pii.firstName,
          lastName: pii.lastName,
          email: member.email,
          phone: pii.phone,
          street: pii.street,
          city: pii.city,
          state: pii.state,
          zip: pii.zip,
          isYouth: member.isYouth,
          patrol: member.patrol,
          position: member.position,
          commPreference: member.commPreference,
          status: member.status,
          shirtSize: member.shirtSize,
          dietaryFlags: member.dietaryFlags,
        }}
        csrf={<CsrfTokenInput />}
      />

      {subaccount ? (
        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-lg text-ink">Treasury subaccount</h3>
            <Link
              href={`/o/${slug}/admin/treasury/members/${member.id}`}
              className="text-sm text-sky hover:text-ink"
            >
              Open ledger →
            </Link>
          </div>
          <p
            className={`mt-2 font-mono text-xl ${
              subaccount.balanceCents < 0 ? "text-danger" : "text-success"
            }`}
          >
            {subaccount.balanceCents > 0 ? "+" : ""}
            ${(subaccount.balanceCents / 100).toFixed(2)}
          </p>
        </div>
      ) : null}

      {scoutbook ? (
        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-lg text-ink">Scoutbook (read-only)</h3>
            <span className="text-xs text-slate-muted">
              Synced {scoutbook.syncedAt.toLocaleDateString()}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-muted">Rank</div>
              <div className="text-ink font-medium">{scoutbook.rank ?? "—"}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-muted">Service hr</div>
              <div className="font-mono">{scoutbook.serviceHours}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-muted">Camping nt</div>
              <div className="font-mono">{scoutbook.campingNights}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-muted">Hiking mi</div>
              <div className="font-mono">{scoutbook.hikingMiles}</div>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-muted">
            BSA member id: <span className="font-mono">{scoutbook.scoutbookUserId}</span>. Edits go through Scoutbook directly.
          </p>
        </div>
      ) : null}

      <MemberLifecycleButtons
        orgSlug={slug}
        memberId={member.id}
        isDeleted={Boolean(member.deletedAt)}
        csrf={<CsrfTokenInput />}
      />
    </section>
  );
}
