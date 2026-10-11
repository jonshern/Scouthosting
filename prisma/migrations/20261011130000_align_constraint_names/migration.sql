-- Align hand-written constraint and index names with the names Prisma
-- derives from schema.prisma, bring the Event.location, PostReaction,
-- PushDevice, Refund and SupportTicket foreign keys in line with the
-- schema, and fix three column types/defaults. Generated with
-- `prisma migrate diff --from-migrations --to-schema-datamodel`; CI now
-- fails when migrations and schema drift apart again.
--
-- Take a database backup before deploying this migration.

-- Clear rows pointing at nothing so the foreign keys can be (re)added.
UPDATE "Event" SET "locationId" = NULL
  WHERE "locationId" IS NOT NULL AND "locationId" NOT IN (SELECT "id" FROM "Location");
DELETE FROM "PostReaction"
  WHERE "postId" NOT IN (SELECT "id" FROM "Post") OR "userId" NOT IN (SELECT "id" FROM "User");
DELETE FROM "PushDevice" WHERE "userId" NOT IN (SELECT "id" FROM "User");
DELETE FROM "Refund" WHERE "orgId" NOT IN (SELECT "id" FROM "Org");
UPDATE "SupportTicket" SET "orgId" = NULL
  WHERE "orgId" IS NOT NULL AND "orgId" NOT IN (SELECT "id" FROM "Org");

-- DropForeignKey
ALTER TABLE "BankImport" DROP CONSTRAINT "BankImport_org_fk";

-- DropForeignKey
ALTER TABLE "BankImportRow" DROP CONSTRAINT "BankImportRow_import_fk";

-- DropForeignKey
ALTER TABLE "BoothSale" DROP CONSTRAINT "BoothSale_campaign_fk";

-- DropForeignKey
ALTER TABLE "BoothSale" DROP CONSTRAINT "BoothSale_org_fk";

-- DropForeignKey
ALTER TABLE "EquipmentLoan" DROP CONSTRAINT "EquipmentLoan_equipment_fk";

-- DropForeignKey
ALTER TABLE "EquipmentLoan" DROP CONSTRAINT "EquipmentLoan_member_fk";

-- DropForeignKey
ALTER TABLE "EquipmentLoan" DROP CONSTRAINT "EquipmentLoan_org_fk";

-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_location_fk";

-- DropForeignKey
ALTER TABLE "FiscalYear" DROP CONSTRAINT "FiscalYear_org_fk";

-- DropForeignKey
ALTER TABLE "Fund" DROP CONSTRAINT "Fund_org_fk";

-- DropForeignKey
ALTER TABLE "FundBudget" DROP CONSTRAINT "FundBudget_fund_fk";

-- DropForeignKey
ALTER TABLE "FundBudget" DROP CONSTRAINT "FundBudget_fy_fk";

-- DropForeignKey
ALTER TABLE "FundBudget" DROP CONSTRAINT "FundBudget_org_fk";

-- DropForeignKey
ALTER TABLE "Location" DROP CONSTRAINT "Location_org_fk";

-- DropForeignKey
ALTER TABLE "MemberSubaccount" DROP CONSTRAINT "MemberSubaccount_member_fk";

-- DropForeignKey
ALTER TABLE "MemberSubaccount" DROP CONSTRAINT "MemberSubaccount_org_fk";

-- DropForeignKey
ALTER TABLE "Patrol" DROP CONSTRAINT "Patrol_leader_fk";

-- DropForeignKey
ALTER TABLE "Patrol" DROP CONSTRAINT "Patrol_org_fk";

-- DropForeignKey
ALTER TABLE "PermissionSlip" DROP CONSTRAINT "PermissionSlip_event_fk";

-- DropForeignKey
ALTER TABLE "PermissionSlip" DROP CONSTRAINT "PermissionSlip_member_fk";

-- DropForeignKey
ALTER TABLE "PermissionSlip" DROP CONSTRAINT "PermissionSlip_org_fk";

-- DropForeignKey
ALTER TABLE "PostReaction" DROP CONSTRAINT "PostReaction_postId_fkey";

-- DropForeignKey
ALTER TABLE "PostReaction" DROP CONSTRAINT "PostReaction_userId_fkey";

-- DropForeignKey
ALTER TABLE "PrizeTier" DROP CONSTRAINT "PrizeTier_campaign_fk";

-- DropForeignKey
ALTER TABLE "PushDevice" DROP CONSTRAINT "PushDevice_userId_fkey";

-- DropForeignKey
ALTER TABLE "Refund" DROP CONSTRAINT "Refund_orgId_fkey";

-- DropForeignKey
ALTER TABLE "SalesCampaign" DROP CONSTRAINT "SalesCampaign_fund_fk";

-- DropForeignKey
ALTER TABLE "SalesCampaign" DROP CONSTRAINT "SalesCampaign_org_fk";

-- DropForeignKey
ALTER TABLE "SalesOrder" DROP CONSTRAINT "SalesOrder_campaign_fk";

-- DropForeignKey
ALTER TABLE "SalesOrder" DROP CONSTRAINT "SalesOrder_scout_fk";

-- DropForeignKey
ALTER TABLE "SalesOrderItem" DROP CONSTRAINT "SalesOrderItem_order_fk";

-- DropForeignKey
ALTER TABLE "SalesOrderItem" DROP CONSTRAINT "SalesOrderItem_product_fk";

-- DropForeignKey
ALTER TABLE "SalesProduct" DROP CONSTRAINT "SalesProduct_campaign_fk";

-- DropForeignKey
ALTER TABLE "ScoutSalesLink" DROP CONSTRAINT "ScoutSalesLink_campaign_fk";

-- DropForeignKey
ALTER TABLE "ScoutSalesLink" DROP CONSTRAINT "ScoutSalesLink_member_fk";

-- DropForeignKey
ALTER TABLE "ScoutbookAward" DROP CONSTRAINT "ScoutbookAward_profile_fk";

-- DropForeignKey
ALTER TABLE "ScoutbookConnection" DROP CONSTRAINT "ScoutbookConnection_org_fk";

-- DropForeignKey
ALTER TABLE "ScoutbookMeritBadge" DROP CONSTRAINT "ScoutbookMeritBadge_profile_fk";

-- DropForeignKey
ALTER TABLE "ScoutbookProfile" DROP CONSTRAINT "ScoutbookProfile_member_fk";

-- DropForeignKey
ALTER TABLE "ScoutbookProfile" DROP CONSTRAINT "ScoutbookProfile_org_fk";

-- DropForeignKey
ALTER TABLE "ScoutbookSyncRun" DROP CONSTRAINT "ScoutbookSyncRun_org_fk";

-- DropForeignKey
ALTER TABLE "SupportTicket" DROP CONSTRAINT "SupportTicket_orgId_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_bankrow_fk";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_event_fk";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_fund_fk";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_member_fk";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_org_fk";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_reimbursement_fk";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_reverses_fk";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_salesOrder_fk";

-- DropIndex
DROP INDEX "PrizeTier_campaign_idx";

-- AlterTable
ALTER TABLE "EventCategory" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MailLog" ALTER COLUMN "status" SET DEFAULT 'queued';

-- AlterTable
ALTER TABLE "PageVersion" ALTER COLUMN "publishedAt" SET DATA TYPE TIMESTAMP(3);

-- RenameForeignKey
ALTER TABLE "MailEvent" RENAME CONSTRAINT "MailEvent_mailLog_fkey" TO "MailEvent_mailLogId_fkey";

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostReaction" ADD CONSTRAINT "PostReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostReaction" ADD CONSTRAINT "PostReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionSlip" ADD CONSTRAINT "PermissionSlip_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionSlip" ADD CONSTRAINT "PermissionSlip_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionSlip" ADD CONSTRAINT "PermissionSlip_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLoan" ADD CONSTRAINT "EquipmentLoan_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLoan" ADD CONSTRAINT "EquipmentLoan_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLoan" ADD CONSTRAINT "EquipmentLoan_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fund" ADD CONSTRAINT "Fund_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberSubaccount" ADD CONSTRAINT "MemberSubaccount_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberSubaccount" ADD CONSTRAINT "MemberSubaccount_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_reimbursementId_fkey" FOREIGN KEY ("reimbursementId") REFERENCES "Reimbursement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_bankImportRowId_fkey" FOREIGN KEY ("bankImportRowId") REFERENCES "BankImportRow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalYear" ADD CONSTRAINT "FiscalYear_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundBudget" ADD CONSTRAINT "FundBudget_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundBudget" ADD CONSTRAINT "FundBudget_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundBudget" ADD CONSTRAINT "FundBudget_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankImport" ADD CONSTRAINT "BankImport_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankImportRow" ADD CONSTRAINT "BankImportRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "BankImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCampaign" ADD CONSTRAINT "SalesCampaign_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCampaign" ADD CONSTRAINT "SalesCampaign_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesProduct" ADD CONSTRAINT "SalesProduct_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SalesCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrizeTier" ADD CONSTRAINT "PrizeTier_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SalesCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutSalesLink" ADD CONSTRAINT "ScoutSalesLink_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SalesCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutSalesLink" ADD CONSTRAINT "ScoutSalesLink_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SalesCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_scoutMemberId_fkey" FOREIGN KEY ("scoutMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SalesProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoothSale" ADD CONSTRAINT "BoothSale_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoothSale" ADD CONSTRAINT "BoothSale_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SalesCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutbookConnection" ADD CONSTRAINT "ScoutbookConnection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutbookProfile" ADD CONSTRAINT "ScoutbookProfile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutbookProfile" ADD CONSTRAINT "ScoutbookProfile_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutbookMeritBadge" ADD CONSTRAINT "ScoutbookMeritBadge_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ScoutbookProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutbookAward" ADD CONSTRAINT "ScoutbookAward_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ScoutbookProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutbookSyncRun" ADD CONSTRAINT "ScoutbookSyncRun_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patrol" ADD CONSTRAINT "Patrol_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patrol" ADD CONSTRAINT "Patrol_leaderMemberId_fkey" FOREIGN KEY ("leaderMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "BankImport_org_uploaded_idx" RENAME TO "BankImport_orgId_uploadedAt_idx";

-- RenameIndex
ALTER INDEX "BankImportRow_import_matched_idx" RENAME TO "BankImportRow_importId_matchedAt_idx";

-- RenameIndex
ALTER INDEX "BoothSale_org_campaign_scheduled_idx" RENAME TO "BoothSale_orgId_campaignId_scheduledAt_idx";

-- RenameIndex
ALTER INDEX "EquipmentLoan_org_equipment_returned_idx" RENAME TO "EquipmentLoan_orgId_equipmentId_returnedAt_idx";

-- RenameIndex
ALTER INDEX "EquipmentLoan_org_member_returned_idx" RENAME TO "EquipmentLoan_orgId_memberId_returnedAt_idx";

-- RenameIndex
ALTER INDEX "Event_org_locationId_idx" RENAME TO "Event_orgId_locationId_idx";

-- RenameIndex
ALTER INDEX "FiscalYear_org_label_key" RENAME TO "FiscalYear_orgId_label_key";

-- RenameIndex
ALTER INDEX "FiscalYear_org_starts_idx" RENAME TO "FiscalYear_orgId_startsOn_idx";

-- RenameIndex
ALTER INDEX "Fund_org_archived_idx" RENAME TO "Fund_orgId_archived_idx";

-- RenameIndex
ALTER INDEX "Fund_org_code_key" RENAME TO "Fund_orgId_code_key";

-- RenameIndex
ALTER INDEX "FundBudget_fy_fund_key" RENAME TO "FundBudget_fiscalYearId_fundId_key";

-- RenameIndex
ALTER INDEX "FundBudget_org_fy_idx" RENAME TO "FundBudget_orgId_fiscalYearId_idx";

-- RenameIndex
ALTER INDEX "Location_org_archived_idx" RENAME TO "Location_orgId_archived_idx";

-- RenameIndex
ALTER INDEX "Location_org_name_key" RENAME TO "Location_orgId_name_key";

-- RenameIndex
ALTER INDEX "Location_org_type_idx" RENAME TO "Location_orgId_type_idx";

-- RenameIndex
ALTER INDEX "MemberSubaccount_org_idx" RENAME TO "MemberSubaccount_orgId_idx";

-- RenameIndex
ALTER INDEX "Patrol_org_archived_idx" RENAME TO "Patrol_orgId_archived_idx";

-- RenameIndex
ALTER INDEX "Patrol_org_name_key" RENAME TO "Patrol_orgId_name_key";

-- RenameIndex
ALTER INDEX "PermissionSlip_event_member_key" RENAME TO "PermissionSlip_eventId_memberId_key";

-- RenameIndex
ALTER INDEX "PermissionSlip_org_event_idx" RENAME TO "PermissionSlip_orgId_eventId_idx";

-- RenameIndex
ALTER INDEX "PermissionSlip_org_member_idx" RENAME TO "PermissionSlip_orgId_memberId_idx";

-- RenameIndex
ALTER INDEX "SalesCampaign_org_endsOn_idx" RENAME TO "SalesCampaign_orgId_endsOn_idx";

-- RenameIndex
ALTER INDEX "SalesCampaign_org_name_key" RENAME TO "SalesCampaign_orgId_name_key";

-- RenameIndex
ALTER INDEX "SalesOrder_depositTxn_key" RENAME TO "SalesOrder_depositTransactionId_key";

-- RenameIndex
ALTER INDEX "SalesOrder_org_campaign_idx" RENAME TO "SalesOrder_orgId_campaignId_createdAt_idx";

-- RenameIndex
ALTER INDEX "SalesOrder_org_scout_idx" RENAME TO "SalesOrder_orgId_scoutMemberId_idx";

-- RenameIndex
ALTER INDEX "SalesOrder_refundTxn_key" RENAME TO "SalesOrder_refundTransactionId_key";

-- RenameIndex
ALTER INDEX "SalesOrder_stripe_pi_idx" RENAME TO "SalesOrder_stripePaymentIntentId_idx";

-- RenameIndex
ALTER INDEX "SalesOrderItem_order_idx" RENAME TO "SalesOrderItem_orderId_idx";

-- RenameIndex
ALTER INDEX "SalesProduct_campaign_sku_key" RENAME TO "SalesProduct_campaignId_sku_key";

-- RenameIndex
ALTER INDEX "ScoutSalesLink_campaign_member_key" RENAME TO "ScoutSalesLink_campaignId_memberId_key";

-- RenameIndex
ALTER INDEX "ScoutSalesLink_campaign_slug_key" RENAME TO "ScoutSalesLink_campaignId_publicSlug_key";

-- RenameIndex
ALTER INDEX "ScoutbookAward_profile_idx" RENAME TO "ScoutbookAward_profileId_idx";

-- RenameIndex
ALTER INDEX "ScoutbookMeritBadge_profile_badge_key" RENAME TO "ScoutbookMeritBadge_profileId_badgeName_key";

-- RenameIndex
ALTER INDEX "ScoutbookMeritBadge_profile_status_idx" RENAME TO "ScoutbookMeritBadge_profileId_status_idx";

-- RenameIndex
ALTER INDEX "ScoutbookProfile_org_synced_idx" RENAME TO "ScoutbookProfile_orgId_syncedAt_idx";

-- RenameIndex
ALTER INDEX "ScoutbookSyncRun_org_started_idx" RENAME TO "ScoutbookSyncRun_orgId_startedAt_idx";

-- RenameIndex
ALTER INDEX "Transaction_org_event_idx" RENAME TO "Transaction_orgId_eventId_idx";

-- RenameIndex
ALTER INDEX "Transaction_org_fund_posted_idx" RENAME TO "Transaction_orgId_fundId_postedAt_idx";

-- RenameIndex
ALTER INDEX "Transaction_org_member_posted_idx" RENAME TO "Transaction_orgId_memberId_postedAt_idx";

-- RenameIndex
ALTER INDEX "Transaction_org_posted_idx" RENAME TO "Transaction_orgId_postedAt_idx";

-- RenameIndex
ALTER INDEX "Transaction_stripe_pi_idx" RENAME TO "Transaction_stripePaymentIntentId_idx";

