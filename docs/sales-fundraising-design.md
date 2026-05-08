# Sales & Fundraising — design skeleton

Status: **proposed, blocked**. We do not start sales/fundraising until
treasury Phase 1 + 2 + 3 (online payments) ship — every cash flow in
this surface settles into a ledger, and we are not building a parallel
ledger.

This doc is intentionally a skeleton. The detailed design will fill
in once we know what the treasury surface looks like in practice.

## Why we want this

Popcorn / camp-card / wreath-sale season drives TWH adoption every
fall, because the treasurer is the loudest voice and they need
something that handles per-Scout sales credit, prize tier tracking,
and consolidated council orders. Compass without sales after treasury
is the dollar bill on the sidewalk.

## Goals

1. Run a full sales campaign — products, pricing, prize tiers,
   per-member orders, booth sales, online buyer URLs — without
   leaving Compass.
2. Make a Scout's family a single click away from buying through
   their own personal sales URL, with proceeds credited to that
   Scout's subaccount automatically.
3. Export a **single consolidated order** the unit submits to council.
4. Lean on the treasury ledger for every dollar in or out — no
   parallel money model.

## Non-goals

- We do not become a generic e-commerce store. The catalog is per
  campaign, ordered by leaders, fulfilled by the unit.
- We do not handle shipping logistics. Council picks up in bulk.
- No multi-unit splits / fundraising co-ops in v1.
- No automatic tax reporting; a sales report exports the data the CO
  treasurer needs to file with their existing process.

## Schema sketch

```prisma
model SalesCampaign {
  id          String   @id @default(cuid())
  orgId       String
  name        String   // "Fall Popcorn 2026"
  startsOn    DateTime
  endsOn      DateTime
  closedAt    DateTime?
  fundId      String   // Treasury fund proceeds land in
  // Default: "scout-accounts" — proceeds split per Scout. Some
  // campaigns post to "general" instead (whole-troop fundraisers).
  proceedsSplit  String  // "per-scout" | "whole-unit"
  scoutSplitPct  Int     @default(70)  // 0–100; rest stays in `general`
  publicSlug     String? // /sell/[publicSlug] — campaign landing page
  description    String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  org      Org           @relation(fields: [orgId], references: [id], onDelete: Cascade)
  fund     Fund          @relation(fields: [fundId], references: [id], onDelete: Restrict)
  products SalesProduct[]
  orders   SalesOrder[]
  prizes   PrizeTier[]
  scoutLinks ScoutSalesLink[]

  @@unique([orgId, name])
  @@unique([publicSlug])
  @@index([orgId, endsOn])
}

model SalesProduct {
  id          String  @id @default(cuid())
  campaignId  String
  sku         String
  name        String
  priceCents  Int
  unitCost    Int    // cost-of-goods, drives profit reports
  imageUrl    String?
  sortOrder   Int    @default(0)
  archived    Boolean @default(false)

  campaign    SalesCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  orderItems  SalesOrderItem[]

  @@unique([campaignId, sku])
}

model PrizeTier {
  id          String  @id @default(cuid())
  campaignId  String
  thresholdCents Int  // total sold (gross)
  name        String  // "Bronze", "Silver", "$500 club"
  description String?
  sortOrder   Int     @default(0)

  campaign    SalesCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
}

model ScoutSalesLink {
  id           String  @id @default(cuid())
  orgId        String
  campaignId   String
  memberId     String
  publicSlug   String  // /sell/[campaign-slug]/[scout-slug]
  shortUrl     String?
  createdAt    DateTime @default(now())

  campaign  SalesCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  member    Member        @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@unique([campaignId, memberId])
  @@unique([campaignId, publicSlug])
}

model SalesOrder {
  id           String   @id @default(cuid())
  orgId        String
  campaignId   String
  // Sales source: which surface posted the order.
  source       String   // "scout-personal" | "booth" | "leader-manual" | "public-page"
  // Selling Scout. Null for whole-unit / leader-manual / booth orders
  // unless the booth captures who staffed it.
  scoutMemberId String?
  buyerName    String
  buyerEmail   String?
  buyerPhone   String?
  buyerAddress String?
  notes        String?
  // Status drives prize math + delivery tracking.
  status       String   @default("placed")
  // placed | paid | delivered | cancelled
  paidAt       DateTime?
  deliveredAt  DateTime?
  totalCents   Int       // computed at write time, reverified on read
  // Stripe / payment hooks
  stripePaymentIntentId String?
  // Treasury linkage — the deposit transaction posted by the
  // treasury webhook.
  depositTransactionId String?
  // Reversal of deposit on cancel / refund.
  refundTransactionId  String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  campaign    SalesCampaign  @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  scout       Member?        @relation(fields: [scoutMemberId], references: [id], onDelete: SetNull)
  items       SalesOrderItem[]

  @@index([orgId, campaignId, createdAt])
  @@index([orgId, scoutMemberId])
}

model SalesOrderItem {
  id           String  @id @default(cuid())
  orderId      String
  productId    String
  quantity     Int
  // Snapshot of price at order time so backdated price changes
  // don't change historical orders.
  priceCentsAtOrder Int

  order   SalesOrder  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  product SalesProduct @relation(fields: [productId], references: [id], onDelete: Restrict)
}

model BoothSale {
  id          String  @id @default(cuid())
  orgId       String
  campaignId  String
  location    String   // "Walmart Saturday", "Hardware Store Friday"
  scheduledAt DateTime
  staffMemberIds String[] @default([])
  totalCents  Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

## Surfaces

- `/admin/sales` — campaigns list (active + past).
- `/admin/sales/[campaignId]` — overview, prize tiers, products,
  per-Scout leaderboard, recent orders.
- `/admin/sales/[campaignId]/orders` — full ledger of orders, with
  filters by source / scout / status.
- `/admin/sales/[campaignId]/products` — catalog editor.
- `/admin/sales/[campaignId]/booths` — booth schedule + per-booth
  sales tally.
- `/admin/sales/[campaignId]/export` — consolidated order CSV in
  council format.
- `/sell/[campaignSlug]` — public campaign landing page.
- `/sell/[campaignSlug]/[scoutSlug]` — Scout's personal page; orders
  default to `source=scout-personal` and `scoutMemberId=this scout`.
- `/account/my-scouts` — adds a "Your sales link" card per active
  campaign so the parent can share it.

## Settlement flow

A `placed` order with `source != "public-page"` posts no money. Once
it's marked `paid` (manual or Stripe webhook):

1. Treasury Transaction posted to `campaign.fundId` for the gross
   amount with `description = "Sale: order #{id}"`. Saved on
   `SalesOrder.depositTransactionId`.
2. If `proceedsSplit = "per-scout"`, post a `transfer-out` from the
   campaign fund and a `transfer-in` to scout-accounts pinned to the
   selling Scout for `gross * scoutSplitPct / 100`. Cost-of-goods
   stays in the campaign fund.
3. Refund / cancel posts the opposite-sign reversals via
   `Transaction.reversesId`.

Booth sales: the treasurer enters a single lump-sum order with
`source=booth`. Per-Scout credit is split evenly across `staffMemberIds`
(or a custom split UI if the count is uneven).

## Phasing

**Phase 1**: Catalog + manual leader-entered orders + per-Scout
leaderboard + consolidated CSV export. No public surface, no online
payments. Treasury settlement is manual via the existing
`/admin/treasury/posting` page. This is enough for a unit running a
"sell to friends, hand the leader cash" campaign.

**Phase 2**: Personal sales URLs + public Stripe-paid orders.
Webhook posts the deposit + per-Scout split. Email receipt to buyer.

**Phase 3**: Booth sales + prize tier tracking + leaderboard widget
on the unit homepage.

## Open questions

1. **Council formats.** Each council's submission template is
   different (popcorn especially). v1 ships generic CSV; we add
   council presets opportunistically.
2. **Tax handling.** Treasurer flag per campaign (taxable / not).
   Out of scope for v1; we capture buyer address, treasurer files.
3. **Inventory tracking.** Probably skip. Council allocates; the
   unit doesn't usually re-stock mid-campaign.
4. **Public catalog images.** Out of scope until we feel pressure;
   a unit typically links to council's flyer instead.

## Why this is blocked on treasury

Every paragraph above ends in "post a Transaction." Without the
ledger, we'd build a parallel money model (or worse, no audit trail)
and have to migrate when treasury lands. Don't.
