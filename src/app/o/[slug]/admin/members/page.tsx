import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { MemberForm } from "@/components/admin/MemberForm";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";

// Search semantics now that PII is encrypted:
//  - email: SQL `contains` against the plaintext column (works as before)
//  - first name / last name: post-decrypt JS substring on the page window.
//    The DB query already narrows by lastNameLc1 prefix when the search
//    starts with a single letter, keeping the window small.
function applyTextSearch<T extends { firstName: string; lastName: string }>(
  rows: T[],
  q: string,
): T[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((r) =>
    `${r.firstName} ${r.lastName}`.toLowerCase().includes(needle),
  );
}

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
  if (!org.encryptedDek) {
    return (
      <section className="space-y-4">
        <h1 className="font-display text-3xl font-semibold">Members</h1>
        <div className="card text-sm text-red-700 bg-red-50 border border-red-200">
          This site doesn&apos;t have an encryption vault yet. Re-create the org or
          restore from a recovery code to view roster data.
        </div>
      </section>
    );
  }

  // Initial-letter narrowing: if the search starts with a letter, hit
  // the lastNameLc1 index. Otherwise we widen the candidate window.
  const firstChar = q && /^[a-zA-Z]/.test(q) ? q[0]!.toLowerCase() : null;
  const where = {
    orgId: org.id,
    deletedAt: showTrash ? { not: null } : null,
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" as const } },
            ...(firstChar ? [{ lastNameLc1: firstChar }] : []),
          ],
        }
      : {}),
  };

  const rawMembers = await prisma.member.findMany({
    where: where as never,
    orderBy: [{ lastNameLc1: "asc" }, { createdAt: "asc" }],
    take: q ? 200 : 100,
  });

  const dek = unwrapDekWithMaster(org);
  const decrypted = rawMembers.map((m) => {
    const pii = decryptMemberPii(m, dek, org.id);
    return { ...m, ...pii };
  });

  // Stable alphabetical sort by lastName once decrypted.
  decrypted.sort((a, b) => {
    const cmp = a.lastName.localeCompare(b.lastName);
    return cmp !== 0 ? cmp : a.firstName.localeCompare(b.firstName);
  });

  const members = q ? applyTextSearch(decrypted, q).slice(0, 100) : decrypted.slice(0, 100);

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
      <p className="text-xs text-ink-muted -mt-6">
        Names are encrypted at rest — name searches match within the visible page.
        For broader matches, search by email.
      </p>

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
