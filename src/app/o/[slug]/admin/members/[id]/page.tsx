import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { MemberForm } from "@/components/admin/MemberForm";
import { MemberLifecycleButtons } from "@/components/admin/MemberLifecycleButtons";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";

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
      <section className="space-y-4">
        <h1 className="font-display text-3xl font-semibold">Member</h1>
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

  return (
    <section className="space-y-6">
      <div>
        <Link href={`/o/${slug}/admin/members`} className="text-sm">← All members</Link>
        <h1 className="font-display text-3xl font-semibold mt-1">
          {pii.firstName} {pii.lastName}
        </h1>
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
        }}
        csrf={<CsrfTokenInput />}
      />

      <MemberLifecycleButtons
        orgSlug={slug}
        memberId={member.id}
        isDeleted={Boolean(member.deletedAt)}
        csrf={<CsrfTokenInput />}
      />
    </section>
  );
}
