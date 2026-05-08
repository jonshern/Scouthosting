// Treasury settings — paste-to-configure Stripe credentials. We never
// surface the plaintext key after save; only the prefix + label.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import {
  StripeKeyForm,
  ClearStripeKeyButton,
} from "@/components/admin/StripeSettingsForms";

export default async function TreasurySettings({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();

  return (
    <section className="space-y-8">
      <AdminPageHeader
        kicker="Treasury · Settings"
        title="Online payments"
        description="Connect this unit's Stripe account so families can pay account balances online."
        actions={
          <Link href={`/o/${slug}/admin/treasury`} className="btn-secondary">
            ← Overview
          </Link>
        }
      />
      <div className="grid gap-6 md:grid-cols-2">
        <StripeKeyForm
          orgSlug={slug}
          csrf={<CsrfTokenInput />}
          currentPrefix={org.treasuryStripeKeyPrefix}
          currentLabel={org.treasuryStripeAccountLabel}
        />
        <div className="space-y-3">
          <h3 className="font-display text-lg text-ink">How this works</h3>
          <ol className="list-decimal pl-5 text-sm text-slate-soft space-y-2">
            <li>
              Create a <strong>restricted secret key</strong> in your Stripe
              dashboard (Developers → API keys → Create restricted key).
              Give it Write on Checkout sessions and Read on PaymentIntents
              and Customers.
            </li>
            <li>Paste the key on the left.</li>
            <li>
              Add a webhook endpoint pointing at{" "}
              <code className="font-mono text-xs">
                /api/webhooks/treasury-stripe?org={slug}
              </code>{" "}
              for events
              <code className="font-mono text-xs"> checkout.session.completed</code>
              {" "}and{" "}
              <code className="font-mono text-xs">payment_intent.succeeded</code>.
              Paste the signing secret above.
            </li>
            <li>
              Parents will see a &ldquo;Pay online&rdquo; button on My Scouts
              when their balance is negative.
            </li>
          </ol>
          {org.treasuryStripeKeyPrefix ? (
            <div className="pt-4 border-t border-line">
              <ClearStripeKeyButton orgSlug={slug} csrf={<CsrfTokenInput />} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
