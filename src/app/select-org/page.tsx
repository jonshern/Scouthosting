// Org picker for users belonging to 2+ units. Layout follows
// design-handoff/signin-flow.jsx — accepted memberships up top,
// pending invites in a separate section below. Lightweight: a leader
// who only ever signs in to one unit gets bounced straight to /admin
// by post-login (lib/auth/post-login.ts), so this page is only seen
// by Key Three / district / scoutmaster-of-multiple-units accounts.

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { isLeaderRole } from "@/lib/auth/role";
import { postLoginRedirectUrl } from "@/lib/auth/post-login";
import { supportEmail } from "@/lib/support";

export const metadata = { title: "Pick a unit" };

const SPECTRUM = ["#1d4ed8", "#0891b2", "#f59e0b", "#475569", "#0f172a"];

function initials(unitNumber: string | null, displayName: string): string {
  if (unitNumber) return unitNumber;
  const parts = displayName.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return displayName.slice(0, 2).toUpperCase();
}

export default async function SelectOrgPage() {
  const { user } = await getSession();
  if (!user) redirect("/login?next=/select-org");

  const memberships = await prisma.orgMembership.findMany({
    where: { userId: user.id },
    include: {
      org: {
        select: {
          id: true,
          slug: true,
          displayName: true,
          unitType: true,
          unitNumber: true,
          city: true,
          state: true,
          council: true,
          _count: { select: { members: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // 0 / 1 → bypass the picker.
  if (memberships.length <= 1) {
    redirect(await postLoginRedirectUrl(user.id));
  }

  return (
    <main className="min-h-screen bg-bg">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-[840px] items-center justify-between px-6 py-5">
          <span className="font-display text-xl tracking-tight">
            Compass<span className="text-sky">.</span>
          </span>
          <Link
            href="/account/profile"
            className="text-sm text-slate-soft hover:text-slate-ink"
          >
            Account
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-[840px] px-6 py-12">
        <div className="mb-1.5 font-display text-xs italic text-sky">§ Sign-in</div>
        <h1 className="font-display text-4xl font-normal tracking-[-0.02em] md:text-5xl">
          Which unit are we{" "}
          <em className="not-italic text-sky md:italic">opening today?</em>
        </h1>
        <p className="mt-3 max-w-xl text-sm text-slate-soft">
          You&apos;re a member of {memberships.length} units. Pick one to jump
          in — you can switch any time from the top nav.
        </p>

        <div className="mt-10 grid gap-3">
          {memberships.map((m, i) => {
            const c = SPECTRUM[i % SPECTRUM.length]!;
            const leader = isLeaderRole(m.role);
            const href = leader ? `/o/${m.org.slug}/admin` : `/o/${m.org.slug}`;
            return (
              <Link
                key={m.org.id}
                href={href}
                className="group flex items-center gap-5 rounded-xl border border-line bg-white p-5 transition-colors hover:border-slate-ink/40 hover:bg-surface-alt"
              >
                <div
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-lg font-display text-base font-medium text-white"
                  style={{ background: c }}
                >
                  {initials(m.org.unitNumber, m.org.displayName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-display text-xl font-medium text-slate-ink">
                      {m.org.displayName}
                    </span>
                    <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-soft">
                      {m.role}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-sm text-slate-soft">
                    {[m.org.council, m.org.city && `${m.org.city}, ${m.org.state}`]
                      .filter(Boolean)
                      .join(" · ")}
                    {" · "}
                    {m.org._count.members} member
                    {m.org._count.members === 1 ? "" : "s"}
                  </div>
                </div>
                <span
                  aria-hidden
                  className="text-2xl text-slate-muted transition-colors group-hover:text-sky"
                >
                  →
                </span>
              </Link>
            );
          })}
        </div>

        <p className="mt-10 text-center text-xs text-slate-muted">
          Don&apos;t see your unit?{" "}
          <a
            href={`mailto:${supportEmail()}`}
            className="text-sky hover:text-slate-ink"
          >
            Email support
          </a>{" "}
          and we&apos;ll re-send your invite.
        </p>
      </section>
    </main>
  );
}
