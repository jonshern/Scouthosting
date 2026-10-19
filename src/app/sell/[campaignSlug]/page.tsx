// Public campaign landing page. Listed at /sell/[campaignSlug] for
// any campaign with a publicSlug. Orders attribute as "public-page".

import { notFound } from "next/navigation";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { PublicSalesCart } from "@/components/public/PublicSalesCart";
import { Wordmark } from "@/components/ui";
import { publicCampaignBySlug } from "@/lib/sales";

export const dynamic = "force-dynamic";

export default async function PublicCampaignLanding({
  params,
}: {
  params: Promise<{ campaignSlug: string }>;
}) {
  const { campaignSlug } = await params;
  const campaign = await publicCampaignBySlug(campaignSlug);
  if (!campaign) notFound();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Wordmark />
      <header className="mt-10">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky">
          § Fundraiser
        </div>
        <h1 className="mt-2 font-display font-semibold text-4xl tracking-[-0.02em] text-ink">
          {campaign.name}
        </h1>
        <p className="mt-1 text-sm text-slate-soft">
          From {campaign.orgDisplayName} · ends {campaign.endsOn.toLocaleDateString()}
        </p>
        {campaign.description ? (
          <p className="mt-4 text-slate-soft whitespace-pre-line">{campaign.description}</p>
        ) : null}
      </header>
      <section className="mt-10">
        <PublicSalesCart
          publicSlug={campaignSlug}
          products={campaign.products}
          csrf={<CsrfTokenInput />}
        />
      </section>
    </main>
  );
}
