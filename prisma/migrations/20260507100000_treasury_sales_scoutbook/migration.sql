-- Treasury, sales/fundraising, and Scoutbook read-only sync.
-- Designs in docs/{treasury,sales-fundraising,scoutbook-sync}-design.md.

ALTER TABLE "Org"
  ADD COLUMN "treasuryStripeKeyCt"           bytea,
  ADD COLUMN "treasuryStripeWebhookSecretCt" bytea,
  ADD COLUMN "treasuryStripeKeyPrefix"       text,
  ADD COLUMN "treasuryStripeAccountLabel"    text;

-- ===================================================================
-- Treasury
-- ===================================================================

CREATE TABLE "Fund" (
  "id"                          text PRIMARY KEY NOT NULL,
  "orgId"                       text NOT NULL,
  "code"                        text NOT NULL,
  "name"                        text NOT NULL,
  "isSystem"                    boolean NOT NULL DEFAULT false,
  "archived"                    boolean NOT NULL DEFAULT false,
  "balanceCents"                integer NOT NULL DEFAULT 0,
  "stripeDestinationAccountId"  text,
  "createdAt"                   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                   timestamp(3) NOT NULL,
  CONSTRAINT "Fund_org_fk" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "Fund_org_code_key"     ON "Fund"("orgId", "code");
CREATE INDEX        "Fund_org_archived_idx" ON "Fund"("orgId", "archived");

CREATE TABLE "MemberSubaccount" (
  "id"           text PRIMARY KEY NOT NULL,
  "orgId"        text NOT NULL,
  "memberId"     text NOT NULL UNIQUE,
  "balanceCents" integer NOT NULL DEFAULT 0,
  "createdAt"    timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    timestamp(3) NOT NULL,
  CONSTRAINT "MemberSubaccount_org_fk"    FOREIGN KEY ("orgId")    REFERENCES "Org"("id")    ON DELETE CASCADE,
  CONSTRAINT "MemberSubaccount_member_fk" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE
);
CREATE INDEX "MemberSubaccount_org_idx" ON "MemberSubaccount"("orgId");

CREATE TABLE "BankImport" (
  "id"           text PRIMARY KEY NOT NULL,
  "orgId"        text NOT NULL,
  "filename"     text NOT NULL,
  "format"       text NOT NULL,
  "uploadedById" text,
  "uploadedAt"   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankImport_org_fk" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE
);
CREATE INDEX "BankImport_org_uploaded_idx" ON "BankImport"("orgId", "uploadedAt");

CREATE TABLE "BankImportRow" (
  "id"          text PRIMARY KEY NOT NULL,
  "importId"    text NOT NULL,
  "postedAt"    timestamp(3) NOT NULL,
  "amountCents" integer NOT NULL,
  "description" text NOT NULL,
  "matchedAt"   timestamp(3),
  "createdAt"   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankImportRow_import_fk" FOREIGN KEY ("importId") REFERENCES "BankImport"("id") ON DELETE CASCADE
);
CREATE INDEX "BankImportRow_import_matched_idx" ON "BankImportRow"("importId", "matchedAt");

CREATE TABLE "Transaction" (
  "id"                    text PRIMARY KEY NOT NULL,
  "orgId"                 text NOT NULL,
  "fundId"                text NOT NULL,
  "memberId"              text,
  "eventId"               text,
  "reimbursementId"       text,
  "type"                  text NOT NULL,
  "amountCents"           integer NOT NULL,
  "description"           text NOT NULL,
  "postedAt"              timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversesId"            text,
  "stripePaymentIntentId" text,
  "bankImportRowId"       text,
  "salesOrderId"          text,
  "createdById"           text,
  "createdAt"             timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             timestamp(3) NOT NULL,
  CONSTRAINT "Transaction_org_fk"           FOREIGN KEY ("orgId")           REFERENCES "Org"("id")            ON DELETE CASCADE,
  CONSTRAINT "Transaction_fund_fk"          FOREIGN KEY ("fundId")          REFERENCES "Fund"("id")           ON DELETE RESTRICT,
  CONSTRAINT "Transaction_member_fk"        FOREIGN KEY ("memberId")        REFERENCES "Member"("id")         ON DELETE SET NULL,
  CONSTRAINT "Transaction_event_fk"         FOREIGN KEY ("eventId")         REFERENCES "Event"("id")          ON DELETE SET NULL,
  CONSTRAINT "Transaction_reimbursement_fk" FOREIGN KEY ("reimbursementId") REFERENCES "Reimbursement"("id")  ON DELETE SET NULL,
  CONSTRAINT "Transaction_reverses_fk"      FOREIGN KEY ("reversesId")      REFERENCES "Transaction"("id")    ON DELETE SET NULL,
  CONSTRAINT "Transaction_bankrow_fk"       FOREIGN KEY ("bankImportRowId") REFERENCES "BankImportRow"("id")  ON DELETE SET NULL
  -- Sales-order FK added after SalesOrder exists (below).
);
CREATE INDEX "Transaction_org_posted_idx"        ON "Transaction"("orgId", "postedAt");
CREATE INDEX "Transaction_org_fund_posted_idx"   ON "Transaction"("orgId", "fundId", "postedAt");
CREATE INDEX "Transaction_org_member_posted_idx" ON "Transaction"("orgId", "memberId", "postedAt");
CREATE INDEX "Transaction_org_event_idx"         ON "Transaction"("orgId", "eventId");
CREATE INDEX "Transaction_stripe_pi_idx"         ON "Transaction"("stripePaymentIntentId");

CREATE TABLE "FiscalYear" (
  "id"        text PRIMARY KEY NOT NULL,
  "orgId"     text NOT NULL,
  "label"     text NOT NULL,
  "startsOn"  timestamp(3) NOT NULL,
  "endsOn"    timestamp(3) NOT NULL,
  "closedAt"  timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,
  CONSTRAINT "FiscalYear_org_fk" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "FiscalYear_org_label_key"  ON "FiscalYear"("orgId", "label");
CREATE INDEX        "FiscalYear_org_starts_idx" ON "FiscalYear"("orgId", "startsOn");

CREATE TABLE "FundBudget" (
  "id"            text PRIMARY KEY NOT NULL,
  "orgId"         text NOT NULL,
  "fiscalYearId"  text NOT NULL,
  "fundId"        text NOT NULL,
  "expectedCents" integer NOT NULL,
  "notes"         text,
  "createdAt"     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     timestamp(3) NOT NULL,
  CONSTRAINT "FundBudget_org_fk"  FOREIGN KEY ("orgId")        REFERENCES "Org"("id")        ON DELETE CASCADE,
  CONSTRAINT "FundBudget_fy_fk"   FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear"("id") ON DELETE CASCADE,
  CONSTRAINT "FundBudget_fund_fk" FOREIGN KEY ("fundId")       REFERENCES "Fund"("id")       ON DELETE CASCADE
);
CREATE UNIQUE INDEX "FundBudget_fy_fund_key" ON "FundBudget"("fiscalYearId", "fundId");
CREATE INDEX        "FundBudget_org_fy_idx"  ON "FundBudget"("orgId", "fiscalYearId");

-- ===================================================================
-- Sales / fundraising
-- ===================================================================

CREATE TABLE "SalesCampaign" (
  "id"            text PRIMARY KEY NOT NULL,
  "orgId"         text NOT NULL,
  "name"          text NOT NULL,
  "startsOn"      timestamp(3) NOT NULL,
  "endsOn"        timestamp(3) NOT NULL,
  "closedAt"      timestamp(3),
  "fundId"        text NOT NULL,
  "proceedsSplit" text NOT NULL DEFAULT 'per-scout',
  "scoutSplitPct" integer NOT NULL DEFAULT 70,
  "publicSlug"    text,
  "description"   text,
  "createdAt"     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     timestamp(3) NOT NULL,
  CONSTRAINT "SalesCampaign_org_fk"  FOREIGN KEY ("orgId")  REFERENCES "Org"("id")  ON DELETE CASCADE,
  CONSTRAINT "SalesCampaign_fund_fk" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "SalesCampaign_org_name_key"     ON "SalesCampaign"("orgId", "name");
CREATE UNIQUE INDEX "SalesCampaign_publicSlug_key"   ON "SalesCampaign"("publicSlug");
CREATE INDEX        "SalesCampaign_org_endsOn_idx"   ON "SalesCampaign"("orgId", "endsOn");

CREATE TABLE "SalesProduct" (
  "id"            text PRIMARY KEY NOT NULL,
  "campaignId"    text NOT NULL,
  "sku"           text NOT NULL,
  "name"          text NOT NULL,
  "priceCents"    integer NOT NULL,
  "unitCostCents" integer NOT NULL DEFAULT 0,
  "imageUrl"      text,
  "sortOrder"     integer NOT NULL DEFAULT 0,
  "archived"      boolean NOT NULL DEFAULT false,
  CONSTRAINT "SalesProduct_campaign_fk" FOREIGN KEY ("campaignId") REFERENCES "SalesCampaign"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "SalesProduct_campaign_sku_key" ON "SalesProduct"("campaignId", "sku");

CREATE TABLE "PrizeTier" (
  "id"             text PRIMARY KEY NOT NULL,
  "campaignId"     text NOT NULL,
  "thresholdCents" integer NOT NULL,
  "name"           text NOT NULL,
  "description"    text,
  "sortOrder"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "PrizeTier_campaign_fk" FOREIGN KEY ("campaignId") REFERENCES "SalesCampaign"("id") ON DELETE CASCADE
);
CREATE INDEX "PrizeTier_campaign_idx" ON "PrizeTier"("campaignId");

CREATE TABLE "ScoutSalesLink" (
  "id"         text PRIMARY KEY NOT NULL,
  "campaignId" text NOT NULL,
  "memberId"   text NOT NULL,
  "publicSlug" text NOT NULL,
  "shortUrl"   text,
  "createdAt"  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScoutSalesLink_campaign_fk" FOREIGN KEY ("campaignId") REFERENCES "SalesCampaign"("id") ON DELETE CASCADE,
  CONSTRAINT "ScoutSalesLink_member_fk"   FOREIGN KEY ("memberId")   REFERENCES "Member"("id")        ON DELETE CASCADE
);
CREATE UNIQUE INDEX "ScoutSalesLink_campaign_member_key" ON "ScoutSalesLink"("campaignId", "memberId");
CREATE UNIQUE INDEX "ScoutSalesLink_campaign_slug_key"   ON "ScoutSalesLink"("campaignId", "publicSlug");

CREATE TABLE "SalesOrder" (
  "id"                    text PRIMARY KEY NOT NULL,
  "orgId"                 text NOT NULL,
  "campaignId"            text NOT NULL,
  "source"                text NOT NULL,
  "scoutMemberId"         text,
  "buyerName"             text NOT NULL,
  "buyerEmail"            text,
  "buyerPhone"            text,
  "buyerAddress"          text,
  "notes"                 text,
  "status"                text NOT NULL DEFAULT 'placed',
  "paidAt"                timestamp(3),
  "deliveredAt"           timestamp(3),
  "totalCents"            integer NOT NULL,
  "stripePaymentIntentId" text,
  "depositTransactionId"  text,
  "refundTransactionId"   text,
  "createdAt"             timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             timestamp(3) NOT NULL,
  CONSTRAINT "SalesOrder_campaign_fk" FOREIGN KEY ("campaignId")    REFERENCES "SalesCampaign"("id") ON DELETE CASCADE,
  CONSTRAINT "SalesOrder_scout_fk"    FOREIGN KEY ("scoutMemberId") REFERENCES "Member"("id")        ON DELETE SET NULL
);
CREATE UNIQUE INDEX "SalesOrder_depositTxn_key"       ON "SalesOrder"("depositTransactionId");
CREATE UNIQUE INDEX "SalesOrder_refundTxn_key"        ON "SalesOrder"("refundTransactionId");
CREATE INDEX        "SalesOrder_org_campaign_idx"     ON "SalesOrder"("orgId", "campaignId", "createdAt");
CREATE INDEX        "SalesOrder_org_scout_idx"        ON "SalesOrder"("orgId", "scoutMemberId");
CREATE INDEX        "SalesOrder_stripe_pi_idx"        ON "SalesOrder"("stripePaymentIntentId");

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_salesOrder_fk" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL;

CREATE TABLE "SalesOrderItem" (
  "id"                text PRIMARY KEY NOT NULL,
  "orderId"           text NOT NULL,
  "productId"         text NOT NULL,
  "quantity"          integer NOT NULL,
  "priceCentsAtOrder" integer NOT NULL,
  CONSTRAINT "SalesOrderItem_order_fk"   FOREIGN KEY ("orderId")   REFERENCES "SalesOrder"("id")   ON DELETE CASCADE,
  CONSTRAINT "SalesOrderItem_product_fk" FOREIGN KEY ("productId") REFERENCES "SalesProduct"("id") ON DELETE RESTRICT
);
CREATE INDEX "SalesOrderItem_order_idx" ON "SalesOrderItem"("orderId");

CREATE TABLE "BoothSale" (
  "id"             text PRIMARY KEY NOT NULL,
  "orgId"          text NOT NULL,
  "campaignId"     text NOT NULL,
  "location"       text NOT NULL,
  "scheduledAt"    timestamp(3) NOT NULL,
  "staffMemberIds" text[] NOT NULL DEFAULT ARRAY[]::text[],
  "totalCents"     integer NOT NULL DEFAULT 0,
  "notes"          text,
  "createdAt"      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      timestamp(3) NOT NULL,
  CONSTRAINT "BoothSale_org_fk"      FOREIGN KEY ("orgId")      REFERENCES "Org"("id")           ON DELETE CASCADE,
  CONSTRAINT "BoothSale_campaign_fk" FOREIGN KEY ("campaignId") REFERENCES "SalesCampaign"("id") ON DELETE CASCADE
);
CREATE INDEX "BoothSale_org_campaign_scheduled_idx" ON "BoothSale"("orgId", "campaignId", "scheduledAt");

-- ===================================================================
-- Scoutbook read-only sync
-- ===================================================================

CREATE TABLE "ScoutbookConnection" (
  "id"             text PRIMARY KEY NOT NULL,
  "orgId"          text NOT NULL UNIQUE,
  "refreshTokenCt" bytea,
  "unitNumber"     text,
  "councilNumber"  text,
  "lastSyncedAt"   timestamp(3),
  "lastSyncStatus" text,
  "lastSyncError"  text,
  "createdAt"      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      timestamp(3) NOT NULL,
  CONSTRAINT "ScoutbookConnection_org_fk" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE
);

CREATE TABLE "ScoutbookProfile" (
  "id"              text PRIMARY KEY NOT NULL,
  "orgId"           text NOT NULL,
  "memberId"        text NOT NULL UNIQUE,
  "scoutbookUserId" text NOT NULL,
  "rank"            text,
  "rankAchievedAt"  timestamp(3),
  "serviceHours"    double precision NOT NULL DEFAULT 0,
  "campingNights"   integer NOT NULL DEFAULT 0,
  "hikingMiles"     double precision NOT NULL DEFAULT 0,
  "extras"          jsonb NOT NULL DEFAULT '{}'::jsonb,
  "syncedAt"        timestamp(3) NOT NULL,
  "createdAt"       timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       timestamp(3) NOT NULL,
  CONSTRAINT "ScoutbookProfile_org_fk"    FOREIGN KEY ("orgId")    REFERENCES "Org"("id")    ON DELETE CASCADE,
  CONSTRAINT "ScoutbookProfile_member_fk" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE
);
CREATE INDEX "ScoutbookProfile_org_synced_idx" ON "ScoutbookProfile"("orgId", "syncedAt");

CREATE TABLE "ScoutbookMeritBadge" (
  "id"           text PRIMARY KEY NOT NULL,
  "profileId"    text NOT NULL,
  "badgeName"    text NOT NULL,
  "status"       text NOT NULL,
  "startedAt"    timestamp(3),
  "completedAt"  timestamp(3),
  "counselorRef" text,
  CONSTRAINT "ScoutbookMeritBadge_profile_fk" FOREIGN KEY ("profileId") REFERENCES "ScoutbookProfile"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "ScoutbookMeritBadge_profile_badge_key" ON "ScoutbookMeritBadge"("profileId", "badgeName");
CREATE INDEX        "ScoutbookMeritBadge_profile_status_idx" ON "ScoutbookMeritBadge"("profileId", "status");

CREATE TABLE "ScoutbookAward" (
  "id"        text PRIMARY KEY NOT NULL,
  "profileId" text NOT NULL,
  "awardName" text NOT NULL,
  "awardedAt" timestamp(3),
  CONSTRAINT "ScoutbookAward_profile_fk" FOREIGN KEY ("profileId") REFERENCES "ScoutbookProfile"("id") ON DELETE CASCADE
);
CREATE INDEX "ScoutbookAward_profile_idx" ON "ScoutbookAward"("profileId");

CREATE TABLE "ScoutbookSyncRun" (
  "id"           text PRIMARY KEY NOT NULL,
  "orgId"        text NOT NULL,
  "startedAt"    timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"   timestamp(3),
  "source"       text NOT NULL,
  "rowsSeen"     integer NOT NULL DEFAULT 0,
  "rowsApplied"  integer NOT NULL DEFAULT 0,
  "warnings"     text[] NOT NULL DEFAULT ARRAY[]::text[],
  "errorMessage" text,
  CONSTRAINT "ScoutbookSyncRun_org_fk" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE
);
CREATE INDEX "ScoutbookSyncRun_org_started_idx" ON "ScoutbookSyncRun"("orgId", "startedAt");
