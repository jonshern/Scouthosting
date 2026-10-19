// Per-Scout sales page. Same product cart as the campaign landing
// but orders attribute to the linked Scout for the leaderboard +
// per-Scout split.

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { PublicSalesCart } from "@/components/public/PublicSalesCart";
import { Wordmark } from "@/components/ui";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import { publicCampaignBySlug } from "@/lib/sales";

export const dynamic = "force-dynamic";

export default async function ScoutSalesPage({
  params,
}: {
  params: Promise<{ campaignSlug: string; scoutSlug: string }>;
}) {
  const { campaignSlug, scoutSlug } = await params;
  const campaign = await publicCampaignBySlug(campaignSlug);
  if (!campaign) notFound();

  const link = await prisma.scoutSalesLink.findUnique({
    where: {
      campaignId_publicSlug: {
        campaignId: campaign.id,
        publicSlug: scoutSlug,
      },
    },
    include: { member: { include: { org: true } } },
  });
  if (!link) notFound();

  let scoutName = "Scout";
  const org = link.member.org;
  if (org.encryptedDek) {
    const dek = unwrapDekWithMaster(org);
    const pii = decryptMemberPii(link.member, dek, org.id);
    scoutName = `${pii.firstName} ${pii.lastName}`.trim() || scoutName;
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Wordmark />
      <header className="mt-10">
        <div className="eyebrow">
          § Buying from {scoutName}
        </div>
        <h1 className="mt-2 font-display font-semibold text-4xl tracking-[-0.02em] text-ink">
          {campaign.name}
        </h1>
        <p className="mt-1 text-sm text-slate-soft">
          Your purchase counts toward {scoutName}&rsquo;s totals at{" "}
          {campaign.orgDisplayName}.
        </p>
        {campaign.description ? (
          <p className="mt-4 text-slate-soft whitespace-pre-line">{campaign.description}</p>
        ) : null}
      </header>
      <section className="mt-10">
        <PublicSalesCart
          publicSlug={campaignSlug}
          scoutSlug={scoutSlug}
          products={campaign.products}
          csrf={<CsrfTokenInput />}
        />
      </section>
    </main>
  );
}
