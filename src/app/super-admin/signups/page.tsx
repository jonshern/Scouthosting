// /super-admin/signups — managing new units and accounts: approve or
// decline each one, keep a note and a day to follow up by, turn a
// trial into free access or ask it to pick a plan, resend a
// confirmation email, and invite people to sign up. Filters by status
// and by the app they signed up through.

import Link from "next/link";
import {
  isSignupView,
  listInvites,
  signupQueue,
  SIGNUP_STATUSES,
  SIGNUP_STATUS_LABEL,
  type SignupItem,
  type SignupView,
} from "@/lib/owner/signups";
import { PRODUCT_LABEL, type Product } from "@/lib/owner/console";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { Done, LicensePill, Pill, Section, shortDate } from "@/components/owner/ConsoleBits";
import {
  approveSignupAction,
  askToPayAction,
  compSignupAction,
  declineSignupAction,
  inviteAction,
  markFollowedUpAction,
  resendConfirmationAction,
  resendInviteAction,
  saveSignupAction,
} from "@/server-actions/super-admin";

export const dynamic = "force-dynamic";

const PRODUCTS: Product[] = ["compass", "waypoint", "lantern"];
const VIEW_LABEL: Record<SignupView, string> = { todo: "To do", ...SIGNUP_STATUS_LABEL, all: "All" };
const STATUS_TONE = { new: "info", approved: "good", follow_up: "warn", declined: "bad", done: "muted" } as const;
const DAYS = [30, 90, 365];

export default async function OwnerSignupsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; product?: string; days?: string; all?: string; done?: string }>;
}) {
  const sp = await searchParams;
  // ?all=1 is the old "Show followed up too" link.
  const view: SignupView = isSignupView(sp.view) ? sp.view : sp.all === "1" ? "all" : "todo";
  const product = PRODUCTS.find((p) => p === sp.product) ?? null;
  const days = DAYS.find((d) => String(d) === sp.days) ?? 30;
  const [items, invites] = await Promise.all([signupQueue({ days, view, product }), listInvites()]);

  const href = (v: SignupView, p: Product | null, d: number) => {
    const q = new URLSearchParams({ view: v });
    if (p) q.set("product", p);
    if (d !== 30) q.set("days", String(d));
    return `/super-admin/signups?${q.toString()}`;
  };
  const back = href(view, product, days);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const inAMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return (
    <div className="space-y-10">
      <Section title={`Sign-ups, last ${days} days (${items.length})`}>
        <nav aria-label="Status" className="flex flex-wrap gap-4 text-sm">
          {(Object.keys(VIEW_LABEL) as SignupView[]).map((v) => (
            <Link key={v} href={href(v, product, days)} className={view === v ? "font-semibold underline" : ""}>
              {VIEW_LABEL[v]}
            </Link>
          ))}
        </nav>
        <nav aria-label="App" className="flex flex-wrap gap-4 text-sm">
          <Link href={href(view, null, days)} className={!product ? "font-semibold underline" : ""}>
            Every app
          </Link>
          {PRODUCTS.map((p) => (
            <Link key={p} href={href(view, p, days)} className={product === p ? "font-semibold underline" : ""}>
              {PRODUCT_LABEL[p]}
            </Link>
          ))}
          <span className="text-ink-muted">·</span>
          {DAYS.map((d) => (
            <Link key={d} href={href(view, product, d)} className={days === d ? "font-semibold underline" : ""}>
              {d} days
            </Link>
          ))}
        </nav>
        <Done message={sp.done} />
        {items.length === 0 ? (
          <p className="text-sm text-ink-muted">Nobody here.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {items.map((i) => (
              <SignupRow key={`${i.kind}:${i.id}`} item={i} back={back} today={today} inAMonth={inAMonth} />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Invite someone">
        <form action={inviteAction} className="grid gap-2 rounded-lg border border-line bg-surface p-4 text-sm sm:grid-cols-2">
          <CsrfTokenInput />
          <input type="hidden" name="back" value={back} />
          <input name="email" type="email" required placeholder="Email" aria-label="Invite email" className="field" />
          <input name="name" type="text" maxLength={120} placeholder="Name (optional)" aria-label="Invite name" className="field" />
          <select name="product" defaultValue="compass" aria-label="Invite to" className="field">
            {PRODUCTS.map((p) => (
              <option key={p} value={p}>
                {PRODUCT_LABEL[p]}
              </option>
            ))}
          </select>
          <input name="note" type="text" maxLength={1000} placeholder="A line from you (optional)" aria-label="Invite note" className="field" />
          <div>
            <button type="submit" className="btn-primary text-sm">
              Send invite
            </button>
          </div>
        </form>
        {invites.length ? (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface text-sm">
            {invites.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
                <div>
                  <span className="font-medium">{inv.name ? `${inv.name} · ${inv.email}` : inv.email}</span>{" "}
                  <Pill tone="info">{PRODUCT_LABEL[inv.product]}</Pill>{" "}
                  {inv.signedUpUserId ? <Pill tone="good">signed up</Pill> : null}
                  <div className="text-xs text-ink-muted">
                    invited {shortDate(inv.createdAt)}
                    {inv.sendCount > 1 ? `, sent ${inv.sendCount} times, last ${shortDate(inv.lastSentAt)}` : ""}
                  </div>
                </div>
                {inv.signedUpUserId ? (
                  <Link href={`/super-admin/people/${inv.signedUpUserId}`} className="text-xs">
                    Open account
                  </Link>
                ) : (
                  <form action={resendInviteAction}>
                    <CsrfTokenInput />
                    <input type="hidden" name="back" value={back} />
                    <input type="hidden" name="inviteId" value={inv.id} />
                    <button type="submit" className="btn-secondary text-xs" aria-label={`Resend invite to ${inv.email}`}>
                      Resend
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </Section>
    </div>
  );
}

function SignupRow({ item: i, back, today, inAMonth }: { item: SignupItem; back: string; today: string; inAMonth: string }) {
  const entityType = i.kind === "unit" ? "Org" : "User";
  const ref = (
    <>
      <CsrfTokenInput />
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="entityId" value={i.id} />
    </>
  );
  const confirmUserId = i.kind === "unit" ? i.ownerId : i.id;
  const overdue = i.status === "follow_up" && i.followUpOn && i.followUpOn.toISOString().slice(0, 10) <= today;

  return (
    <li className="space-y-2 px-4 py-3 text-sm" aria-label={i.name}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={i.kind === "unit" ? "info" : "muted"}>{i.kind === "unit" ? "New unit" : "New account"}</Pill>
            <Link href={i.kind === "unit" ? `/super-admin/orgs/${i.slug}` : `/super-admin/people/${i.id}`} className="font-medium">
              {i.name}
            </Link>
            {i.kind === "unit" ? <LicensePill license={i.license} /> : null}
            {i.kind === "person" ? i.products.map((p) => <Pill key={p} tone="info">{PRODUCT_LABEL[p]}</Pill>) : null}
            <Pill tone={STATUS_TONE[i.status]}>{SIGNUP_STATUS_LABEL[i.status]}</Pill>
            {i.status === "follow_up" && i.followUpOn ? (
              <Pill tone={overdue ? "bad" : "warn"}>by {shortDate(i.followUpOn)}</Pill>
            ) : null}
            {!i.confirmed ? <Pill tone="warn">email not confirmed</Pill> : null}
            {i.off && i.status !== "declined" ? <Pill tone="bad">{i.kind === "unit" ? "suspended" : "account off"}</Pill> : null}
            {i.invitedAt ? <Pill tone="muted">invited {shortDate(i.invitedAt)}</Pill> : null}
          </div>
          <div className="mt-0.5 text-xs text-ink-muted">
            {i.email} · signed up {shortDate(i.at)} ·{" "}
            {i.kind === "unit"
              ? `${i.adults} accounts, ${i.scouts} scouts so far`
              : i.products.length
                ? `${i.units} units`
                : "hasn't used a product yet"}
          </div>
          {i.note ? <p className="mt-1 whitespace-pre-line text-xs">{i.note}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {i.email ? (
            <a className="btn-secondary text-xs" href={`mailto:${i.email}`}>
              Email
            </a>
          ) : null}
          {i.status !== "approved" ? (
            <form action={approveSignupAction}>
              {ref}
              <button type="submit" className="btn-secondary text-xs" aria-label={`Approve ${i.name}`}>
                Approve
              </button>
            </form>
          ) : null}
          {i.status !== "done" ? (
            <form action={markFollowedUpAction}>
              {ref}
              <button type="submit" className="btn-secondary text-xs" aria-label={`Done with ${i.name}`}>
                Done
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <details>
        <summary className="cursor-pointer text-xs">Manage</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <form action={saveSignupAction} className="space-y-2">
            {ref}
            <select name="status" defaultValue={i.status === "declined" ? "new" : i.status} aria-label="Status" className="field text-sm">
              {SIGNUP_STATUSES.filter((s) => s !== "declined").map((s) => (
                <option key={s} value={s}>
                  {SIGNUP_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <input
              name="followUpOn"
              type="date"
              defaultValue={i.followUpOn ? i.followUpOn.toISOString().slice(0, 10) : ""}
              aria-label="Follow up by"
              className="field text-sm"
            />
            <textarea name="note" defaultValue={i.note ?? ""} maxLength={2000} rows={2} aria-label="Note" placeholder="Note (only you see this)" className="field w-full text-sm" />
            <button type="submit" className="btn-secondary text-xs">
              Save
            </button>
          </form>

          <div className="space-y-2">
            {i.kind === "unit" && !i.paying && i.license.kind !== "comped" ? (
              <>
                <form action={compSignupAction} className="flex flex-wrap items-center gap-2">
                  <CsrfTokenInput />
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="orgId" value={i.id} />
                  <input name="until" type="date" defaultValue={inAMonth} min={today} required aria-label="Free until" className="field text-sm" />
                  <button type="submit" className="btn-secondary text-xs">
                    Give free access
                  </button>
                </form>
                <form action={askToPayAction}>
                  <CsrfTokenInput />
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="orgId" value={i.id} />
                  <button type="submit" className="btn-secondary text-xs">
                    Ask to pick a plan
                  </button>
                </form>
              </>
            ) : null}
            {!i.confirmed && confirmUserId ? (
              <form action={resendConfirmationAction}>
                <CsrfTokenInput />
                <input type="hidden" name="back" value={back} />
                <input type="hidden" name="userId" value={confirmUserId} />
                <button type="submit" className="btn-secondary text-xs">
                  Resend confirmation email
                </button>
              </form>
            ) : null}
            {i.status !== "declined" ? (
              <form action={declineSignupAction} className="flex flex-wrap items-center gap-2">
                {ref}
                <input name="reason" type="text" required maxLength={500} placeholder="Why" aria-label="Decline reason" className="field text-sm" />
                <button type="submit" className="btn-secondary text-xs">
                  {i.kind === "unit" ? "Decline and suspend" : "Decline and turn off"}
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </details>
    </li>
  );
}
