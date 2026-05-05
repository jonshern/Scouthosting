import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/lucia";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { MfaSettings } from "@/components/account/MfaSettings";

export const metadata = { title: "Security" };
export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const { user } = await getSession();
  if (!user) redirect("/login");

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
      <MfaSettings enrolled={enrolled} csrf={<CsrfTokenInput />} />
    </section>
  );
}
