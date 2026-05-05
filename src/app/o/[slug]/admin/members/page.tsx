import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { MemberForm } from "@/components/admin/MemberForm";

export default async function AdminMembersIndex({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ trash?: string; q?: string }>;
}) {
  const { slug } = await params;
  const { trash, q } = await searchParams;
  const showTrash = trash === "1";
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();

  const where = {
    orgId: org.id,
    deletedAt: showTrash ? { not: null } : null,
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" as const } },
            { lastName: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const members = await prisma.member.findMany({
    where: where as never,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 100,
  });

  return (
    <section className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold">Members</h1>
        <div className="flex items-center gap-3">
          <Link
            href={`/o/${slug}/admin/members${showTrash ? "" : "?trash=1"}`}
            className="text-sm"
          >
            {showTrash ? "Active" : "Trash"}
          </Link>
        </div>
      </div>

      <form action={`/o/${slug}/admin/members`} method="GET" className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by name or email"
          className="field flex-1"
        />
        {showTrash && <input type="hidden" name="trash" value="1" />}
        <button type="submit" className="btn-secondary">Search</button>
      </form>

      {!showTrash && (
        <div>
          <h2 className="font-display text-xl font-semibold mb-3">Add a member</h2>
          <MemberForm orgSlug={slug} csrf={<CsrfTokenInput />} />
        </div>
      )}

      <div>
        <h2 className="font-display text-xl font-semibold mb-3">
          {showTrash ? "Trashed" : "Roster"} ({members.length})
        </h2>
        {members.length === 0 && <p className="text-ink-muted">{showTrash ? "Nothing in the trash." : "No members yet."}</p>}
        <ul className="divide-y divide-ink-muted/15">
          {members.map((m) => (
            <li key={m.id} className="py-3 flex items-center justify-between gap-4">
              <div>
                <Link href={`/o/${slug}/admin/members/${m.id}`} className="font-medium">
                  {m.firstName} {m.lastName}
                </Link>
                <div className="text-sm text-ink-muted">
                  {m.isYouth ? "Youth" : "Adult"}
                  {m.patrol ? ` · ${m.patrol}` : ""}
                  {m.position ? ` · ${m.position}` : ""}
                  {m.email ? ` · ${m.email}` : ""}
                  {m.status !== "active" ? ` · ${m.status}` : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
