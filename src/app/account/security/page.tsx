import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { MfaSettings } from "@/components/account/MfaSettings";
import { isSafeNextPath } from "@/lib/auth/post-login";

export const metadata = { title: "Security" };
export const dynamic = "force-dynamic";

export default async function AccountSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string; next?: string }>;
}) {
  const { required, next } = await searchParams;
  const { user } = await getSession();
  if (!user) redirect("/login");
  const safeNext = isSafeNextPath(next) ? next : undefined;

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { totpEnrolledAt: true },
  });
  const enrolled = !!dbUser?.totpEnrolledAt;

  return (
    <section className="mx-auto max-w-2xl px-6 py-12 space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">Security</h1>
        <p className="text-ink-muted text-sm">Manage two-factor authentication for your account.</p>
      </header>
      {required === "1" && !enrolled && (
        <p role="status" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Leaders and admins need two-step sign-in. Set it up below to continue.
        </p>
      )}
      {required === "1" && enrolled && safeNext && (
        <p role="status" className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Two-step sign-in is on. <a href={safeNext} className="underline">Continue</a>
        </p>
      )}
      <MfaSettings enrolled={enrolled} csrf={<CsrfTokenInput />} next={safeNext} />
    </section>
  );
}
