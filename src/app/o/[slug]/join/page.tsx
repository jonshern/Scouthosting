// /o/[slug]/join — where a unit's invite email lands. A signed-in adult
// whose confirmed email is on the roster joins the unit here (role
// "parent"; an admin can raise it later). Everyone else is told the one
// thing standing in the way: an account, a confirmed email, or a roster
// entry with this address. See lib/members/access.ts.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { roleInOrg } from "@/lib/auth/role";
import { joinUnitsByRosterEmail } from "@/lib/members/access";

export const dynamic = "force-dynamic";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-[560px] px-6 py-16">
      <div className="card space-y-4">
        <h1 className="font-display font-semibold text-2xl text-ink">{title}</h1>
        {children}
      </div>
    </main>
  );
}

export default async function JoinUnitPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({
    where: { slug },
    select: { id: true, displayName: true },
  });
  if (!org) notFound();
  const next = encodeURIComponent(`/o/${slug}/join`);
  const { user } = await getSession();

  if (!user) {
    return (
      <Shell title={`Join ${org.displayName}`}>
        <p className="text-ink-2">
          Make a free Compass account with the email address your unit has on file, and you&apos;re in:
          calendar, RSVPs, permission slips, photos and the unit chat.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <Link href={`/signup?next=${next}`} className="btn-primary no-underline">
            Create my account
          </Link>
          <Link href={`/login?next=${next}`} className="btn-secondary no-underline">
            I already have one
          </Link>
        </div>
      </Shell>
    );
  }

  let role = await roleInOrg(user.id, org.id);
  if (!role && user.emailVerified) {
    await joinUnitsByRosterEmail(user.id, user.email, { orgId: org.id });
    role = await roleInOrg(user.id, org.id);
  }

  if (role) {
    return (
      <Shell title={`You're in ${org.displayName}`}>
        <p className="text-ink-2">Here&apos;s where things live:</p>
        <div className="flex flex-wrap gap-2.5">
          <Link href={`/o/${slug}/calendar`} className="btn-primary no-underline">
            Calendar
          </Link>
          <Link href={`/o/${slug}/chat`} className="btn-secondary no-underline">
            Chat
          </Link>
          <Link href={`/o/${slug}/photos`} className="btn-secondary no-underline">
            Photos
          </Link>
          <Link href={`/o/${slug}`} className="btn-secondary no-underline">
            Unit home
          </Link>
        </div>
        {role === "leader" || role === "admin" ? (
          <p className="text-sm text-muted">
            You&apos;re a {role} here, so the <Link href={`/o/${slug}/admin`}>admin pages</Link> are open to you too.
          </p>
        ) : null}
      </Shell>
    );
  }

  if (!user.emailVerified) {
    return (
      <Shell title="Confirm your email first">
        <p className="text-ink-2">
          We sent a link to <strong>{user.email}</strong>. Tap it and you&apos;ll join {org.displayName} right
          away. Can&apos;t find it? Check spam, or send a new one from{" "}
          <Link href="/account/profile">your account</Link>.
        </p>
      </Shell>
    );
  }

  return (
    <Shell title="We couldn't find you on the roster">
      <p className="text-ink-2">
        {org.displayName}&apos;s roster doesn&apos;t have <strong>{user.email}</strong> yet. Ask one of your
        unit&apos;s leaders to add that address to your roster entry, then come back to this page.
      </p>
      <p className="text-sm text-muted">
        Signed up with a different email than the one on file? <Link href="/account/profile">Change it here</Link>{" "}
        or sign in with the other one.
      </p>
    </Shell>
  );
}
