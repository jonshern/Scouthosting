// "My Stuff" — member-editable fields across every org I belong to.
// Flips the skills / interests / dietaryFlags / shirtSize columns
// (already on Member) into a self-service form so leaders don't have
// to chase people down for "who has WFA / what's your shirt size?".

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { MyStuffForm } from "@/components/account/MyStuffForm";
import { SectionHeader, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Stuff" };

export default async function MyStuffPage() {
  const { user } = await getSession();
  if (!user) redirect("/login?next=/account/my-stuff");

  const email = user.email.toLowerCase();
  const members = await prisma.member.findMany({
    where: { email, deletedAt: null },
    include: { org: true },
  });

  const cards = members.map((m) => {
    let displayName = m.email ?? "";
    if (m.org?.encryptedDek) {
      try {
        const dek = unwrapDekWithMaster(m.org);
        const pii = decryptMemberPii(m, dek, m.org.id);
        displayName = `${pii.firstName} ${pii.lastName}`.trim() || displayName;
      } catch {
        // leave the email fallback
      }
    }
    return {
      id: m.id,
      orgDisplayName: m.org?.displayName ?? "Unit",
      patrol: m.patrol,
      position: m.position,
      isYouth: m.isYouth,
      displayName,
      skills: m.skills,
      interests: m.interests,
      dietaryFlags: m.dietaryFlags,
      shirtSize: m.shirtSize,
    };
  });

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <SectionHeader
        eyebrow="Account"
        title="My Stuff"
        description="The things only you can fill in: skills, interests, allergies, shirt size. Editable per unit so a parent in two troops can keep them separate."
      />

      {cards.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface p-8 text-center">
          <p className="text-sm text-slate-soft">
            We didn&rsquo;t find any roster row tied to your email
            (<strong>{user.email}</strong>). A leader can add you on the
            members page.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {cards.map((c) => (
            <article key={c.id} className="rounded-xl border border-line bg-surface p-6">
              <header className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <h2 className="font-display font-semibold text-xl text-ink">{c.displayName}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-muted">
                    <Pill tone="accent">{c.orgDisplayName}</Pill>
                    {c.patrol ? <span>· {c.patrol}</span> : null}
                    {c.position ? <span>· {c.position}</span> : null}
                    {c.isYouth ? null : <Pill tone="neutral">Adult</Pill>}
                  </div>
                </div>
              </header>
              <div className="mt-4">
                <MyStuffForm
                  memberId={c.id}
                  initial={{
                    skills: c.skills,
                    interests: c.interests,
                    dietaryFlags: c.dietaryFlags,
                    shirtSize: c.shirtSize,
                  }}
                  csrf={<CsrfTokenInput />}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
