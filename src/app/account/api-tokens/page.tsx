// /account/api-tokens — list + revoke. Issue is mobile-only via
// /api/v1/auth/token (requires the cookie session). Also lists the
// Claude connections (lib/mcp) with a Disconnect button.

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { connectionsFor } from "@/lib/mcp/oauth/tokens";
import { revokeApiToken, revokeMcpConnection } from "@/server-actions/account";

export const metadata = { title: "Apps and Claude" };

export default async function ApiTokensPage() {
  const { user } = await getSession();
  if (!user) redirect("/login?next=/account/api-tokens");
  const tokens = await prisma.apiToken.findMany({
    where: { userId: user.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, createdAt: true, lastUsedAt: true },
  });
  const connections = await connectionsFor(user.id);

  return (
    <div className="max-w-2xl">
      <h1 className="font-display font-semibold text-3xl mb-2">Apps and Claude</h1>
      <p className="text-muted mb-8 text-sm">
        Everything that can use your account without a password: the Compass, Waypoint and Lantern apps, and Claude.
      </p>
      <h2 className="font-display font-semibold text-xl mb-1">Signed-in phones and apps</h2>
      <p className="text-muted mb-4 text-sm">
        Each one keeps a token for 90 days. Revoke any you don&apos;t recognize and it&apos;s signed out right away.
      </p>
      {tokens.length === 0 ? (
        <p className="text-sm text-muted">No phones or apps signed in.</p>
      ) : (
        <ul className="space-y-3">
          {tokens.map((t) => (
            <li key={t.id} className="card flex items-center justify-between gap-4">
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

      <h2 className="font-display font-semibold text-xl mt-10 mb-1">Claude connections</h2>
      <p className="text-muted mb-4 text-sm">
        Apps you let read your scouts&apos; progress, such as Claude. Disconnecting signs the app out right away.
      </p>
      {connections.length === 0 ? (
        <p className="text-sm text-muted">Nothing connected.</p>
      ) : (
        <ul className="space-y-3">
          {connections.map((c) => (
            <li key={c.clientId} className="card flex items-center justify-between gap-4">
              <div>
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-ink-muted">
                  Connected {c.connectedAt.toLocaleDateString()} · last used {c.lastUsedAt.toLocaleDateString()}
                </div>
              </div>
              <form action={revokeMcpConnection}>
                <CsrfTokenInput />
                <input type="hidden" name="clientId" value={c.clientId} />
                <button type="submit" className="btn-secondary text-xs">
                  Disconnect
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
