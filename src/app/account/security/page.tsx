import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { MfaSettings } from "@/components/account/MfaSettings";
import { AddPasskey } from "@/components/account/PasskeySettings";
import { isSafeNextPath } from "@/lib/auth/post-login";
import { relyingPartyForRequest } from "@/lib/auth/passkeys";
import { readCsrfToken } from "@/lib/security/csrf";
import { removePasskey } from "@/server-actions/passkeys";

export const metadata = { title: "Security" };
export const dynamic = "force-dynamic";

const PASSKEY_NOTICES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  removed: { tone: "ok", text: "Passkey removed." },
  locked: {
    tone: "warn",
    text: "Leaders and admins must keep a second step. Set up an authenticator app or add another passkey before removing this one.",
  },
};

export default async function AccountSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string; next?: string; passkey?: string }>;
}) {
  const { required, next, passkey } = await searchParams;
  const { user } = await getSession();
  if (!user) redirect("/login");
  const safeNext = isSafeNextPath(next) ? next : undefined;

  const [dbUser, passkeys, rp, csrf] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { totpEnrolledAt: true } }),
    prisma.passkey.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, rpId: true, createdAt: true, lastUsedAt: true, backedUp: true },
    }),
    headers().then(relyingPartyForRequest),
    readCsrfToken(),
  ]);
  const enrolled = !!dbUser?.totpEnrolledAt;
  const secondStepOn = enrolled || passkeys.length > 0;
  const notice = passkey ? PASSKEY_NOTICES[passkey] : undefined;

  return (
    <section className="mx-auto max-w-2xl px-6 py-12 space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">Security</h1>
        <p className="text-ink-muted text-sm">Manage passkeys and two-step sign-in for your account.</p>
      </header>
      {required === "1" && !secondStepOn && (
        <p role="status" className="rounded border border-attention/30 bg-attention-soft p-3 text-sm text-attention-text">
          Leaders and admins need two-step sign-in. Add a passkey or set up an authenticator app below to
          continue.
        </p>
      )}
      {required === "1" && secondStepOn && safeNext && (
        <p role="status" className="rounded border border-done/30 bg-done-soft p-3 text-sm text-done-text">
          Two-step sign-in is on. <a href={safeNext} className="underline">Continue</a>
        </p>
      )}
      {notice && (
        <p
          role="status"
          className={
            notice.tone === "ok"
              ? "rounded border border-done/30 bg-done-soft p-3 text-sm text-done-text"
              : "rounded border border-attention/30 bg-attention-soft p-3 text-sm text-attention-text"
          }
        >
          {notice.text}
        </p>
      )}

      <section className="card space-y-4" aria-labelledby="passkeys-heading">
        <header className="space-y-1">
          <h2 id="passkeys-heading" className="font-display text-xl font-semibold">
            Passkeys
          </h2>
          <p className="text-sm text-ink-muted">
            Sign in with your fingerprint, face or device PIN instead of a password. A passkey also
            counts as two-step sign-in.
          </p>
        </header>
        {passkeys.length > 0 && (
          <ul className="divide-y divide-line rounded border border-line">
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 p-3 text-sm">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-ink-muted">
                    Added {p.createdAt.toLocaleDateString()}
                    {p.lastUsedAt ? ` · last used ${p.lastUsedAt.toLocaleDateString()}` : " · not used yet"}
                    {p.backedUp ? " · synced" : ""}
                    {rp && p.rpId !== rp.rpID ? ` · works on ${p.rpId}` : ""}
                  </div>
                </div>
                <form action={removePasskey}>
                  <CsrfTokenInput />
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" className="text-sm text-danger underline">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {rp ? (
          <AddPasskey csrf={csrf ?? ""} />
        ) : (
          <p className="text-sm text-ink-muted">Passkeys can&apos;t be added on this address.</p>
        )}
      </section>

      <MfaSettings enrolled={enrolled} csrf={<CsrfTokenInput />} next={safeNext} />
    </section>
  );
}
