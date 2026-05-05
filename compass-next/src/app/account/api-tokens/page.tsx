// /account/api-tokens — list + revoke. Issue is mobile-only via
// /api/v1/auth/token (requires the cookie session).

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/lucia";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { revokeApiToken } from "@/server-actions/account";

export default async function ApiTokensPage() {
  const { user } = await getSession();
  if (!user) redirect("/login?next=/account/api-tokens");
  const tokens = await prisma.apiToken.findMany({
    where: { userId: user.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, createdAt: true, lastUsedAt: true },
  });

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <h1 className="font-display text-3xl mb-2">API tokens</h1>
      <p className="text-ink-muted mb-6 text-sm">
        Bearer tokens issued to your mobile devices. Revoke any you no longer recognise.
      </p>
      {tokens.length === 0 ? (
        <p className="text-ink-muted">No active tokens.</p>
      ) : (
        <ul className="space-y-3">
          {tokens.map((t) => (
            <li key={t.id} className="card flex items-center justify-between">
              <div>
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-ink-muted">
                  Created {t.createdAt.toLocaleDateString()}
                  {t.lastUsedAt
                    ? ` · last used ${t.lastUsedAt.toLocaleDateString()}`
                    : " · never used"}
                </div>
              </div>
              <form action={revokeApiToken}>
                <CsrfTokenInput />
                <input type="hidden" name="id" value={t.id} />
                <button type="submit" className="btn-secondary text-xs">
                  Revoke
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
