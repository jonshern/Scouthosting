// /super-admin/signups — the sign-ups queue: new units and accounts
// from the last 30 days that the owner hasn't followed up with yet.
// "Email" opens the owner's own mail app; "Done" takes it off the queue.

import Link from "next/link";
import { signupQueue } from "@/lib/owner/signups";
import { PRODUCT_LABEL } from "@/lib/owner/console";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { Done, LicensePill, Pill, shortDate } from "@/components/owner/ConsoleBits";
import { markFollowedUpAction } from "@/server-actions/super-admin";

export const dynamic = "force-dynamic";

export default async function OwnerSignupsPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string; done?: string }>;
}) {
  const sp = await searchParams;
  const all = sp.all === "1";
  const items = await signupQueue({ includeFollowedUp: all });

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display font-semibold text-2xl">Sign-ups, last 30 days ({items.length})</h2>
        <Link href={all ? "/super-admin/signups" : "/super-admin/signups?all=1"} className="text-sm">
          {all ? "Only ones to follow up" : "Show followed up too"}
        </Link>
      </div>
      <Done message={sp.done} />
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">Nobody new to follow up with.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {items.map((i) => (
            <li key={`${i.kind}:${i.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {i.kind === "unit" ? (
                    <>
                      <Pill tone="info">New unit</Pill>
                      <Link href={`/super-admin/orgs/${i.slug}`} className="font-medium">
                        {i.name}
                      </Link>
                      <LicensePill license={i.license} />
                    </>
                  ) : (
                    <>
                      <Pill tone="muted">New account</Pill>
                      <Link href={`/super-admin/people/${i.id}`} className="font-medium">
                        {i.name}
                      </Link>
                      {i.products.map((p) => (
                        <Pill key={p} tone="info">
                          {PRODUCT_LABEL[p]}
                        </Pill>
                      ))}
                    </>
                  )}
                  {i.followedUpAt ? <Pill tone="good">followed up {shortDate(i.followedUpAt)}</Pill> : null}
                </div>
                <div className="mt-0.5 text-xs text-ink-muted">
                  {i.email} · signed up {shortDate(i.at)} ·{" "}
                  {i.kind === "unit"
                    ? `${i.adults} accounts, ${i.scouts} scouts so far`
                    : i.products.length
                      ? `${i.units} units`
                      : "hasn't used a product yet"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {i.email ? (
                  <a className="btn-secondary text-xs" href={`mailto:${i.email}`}>
                    Email
                  </a>
                ) : null}
                {!i.followedUpAt ? (
                  <form action={markFollowedUpAction}>
                    <CsrfTokenInput />
                    <input type="hidden" name="entityType" value={i.kind === "unit" ? "Org" : "User"} />
                    <input type="hidden" name="entityId" value={i.id} />
                    <button type="submit" className="btn-secondary text-xs" aria-label={`Done with ${i.name}`}>
                      Done
                    </button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
