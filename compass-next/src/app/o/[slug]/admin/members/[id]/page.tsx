import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { MemberForm } from "@/components/admin/MemberForm";
import { MemberLifecycleButtons } from "@/components/admin/MemberLifecycleButtons";

export default async function AdminMemberEdit({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const member = await prisma.member.findUnique({ where: { id } });
  if (!member || member.orgId !== org.id) notFound();

  return (
    <section className="space-y-6">
      <div>
        <Link href={`/o/${slug}/admin/members`} className="text-sm">← All members</Link>
        <h1 className="font-display text-3xl font-semibold mt-1">
          {member.firstName} {member.lastName}
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
          firstName: member.firstName,
          lastName: member.lastName,
          email: member.email,
          phone: member.phone,
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
