// /mcp/oauth/consent?<authorize params> — "Let Claude see your scouts?"
// The adult taps Allow or Cancel; the form posts back to
// /mcp/oauth/authorize, which re-checks everything before minting a
// code. See lib/mcp/oauth/authorize.ts.

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { AUTHORIZE_PARAMS, checkAuthorizeRequest, pickParams, toQuery } from "@/lib/mcp/oauth/authorize";
import { SCOPE_WRITE } from "@/lib/mcp/config";
import { isKnownClaudeRedirect } from "@/lib/mcp/oauth/clients";

export const metadata = { title: "Connect Compass to Claude" };
export const dynamic = "force-dynamic";

function Problem({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-md px-6 py-12 space-y-4">
      <h1 className="font-display text-3xl font-semibold">Can&apos;t connect</h1>
      <p className="text-sm text-ink-muted">{message}</p>
    </main>
  );
}

export default async function McpConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = pickParams((k) => {
    const v = sp[k];
    return typeof v === "string" ? v : null;
  });
  const check = await checkAuthorizeRequest(params);
  if (!check.ok) {
    return <Problem message={"show" in check ? check.show : "This request isn't valid. Try adding the connector again."} />;
  }

  const { user } = await getSession();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/mcp/oauth/authorize?${toQuery(params)}`)}`);

  const canWrite = check.scope.split(" ").includes(SCOPE_WRITE);
  const redirectHost = (() => {
    try {
      return new URL(check.redirectUri).host || check.redirectUri;
    } catch {
      return check.redirectUri;
    }
  })();

  // Any app can register under any name; only Claude's own callback (or
  // this computer) gets its name in the heading.
  const known = isKnownClaudeRedirect(check.redirectUri);

  return (
    <main className="mx-auto max-w-md px-6 py-12 space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-semibold">
          {known ? `Connect Compass to ${check.client.clientName}?` : `Connect Compass to an app at ${redirectHost}?`}
        </h1>
        {!known && (
          <p className="text-sm font-semibold text-danger">
            This isn&apos;t Claude. The app calls itself &ldquo;{check.client.clientName}&rdquo;, but it would send your
            access to {redirectHost}. Cancel unless you set up that app yourself.
          </p>
        )}
        <p className="text-sm text-ink-muted">
          Signed in as <strong>{user.displayName || user.email}</strong>. Only allow this if you just added the
          Compass connector yourself.
        </p>
      </header>
      <section className="space-y-2 text-sm">
        <p>It will be able to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>See the ranks, merit badges and requirements of scouts linked to you, and of units you lead</li>
          <li>See upcoming events, your RSVPs and sign-offs waiting on a counselor</li>
          {canWrite && <li>Mark a requirement done and RSVP for you, each only after asking you first</li>}
        </ul>
        <p className="text-ink-muted">
          It can&apos;t sign off requirements, see other families&apos; scouts, or see money. You can disconnect it any
          time under{" "}
          <a href="/account/api-tokens" className="underline">
            Claude connections
          </a>{" "}
          in your account, and changing your password disconnects it too.
        </p>
        <p className="text-ink-muted">After you allow it, you&apos;ll go back to {redirectHost}.</p>
      </section>
      <form action="/mcp/oauth/authorize" method="post" className="flex gap-3">
        <CsrfTokenInput />
        {AUTHORIZE_PARAMS.map((k) =>
          params[k] !== undefined ? <input key={k} type="hidden" name={k} value={params[k]} /> : null,
        )}
        <button type="submit" name="decision" value="deny" className="btn-secondary flex-1">
          Cancel
        </button>
        <button type="submit" name="decision" value="allow" className="btn-primary flex-1">
          Allow
        </button>
      </form>
    </main>
  );
}
