-- Quick-wins batch:
--   1. Electronic permission slips per (event, member) with parent
--      typed signature, IP, and snapshot of the consent text.
--   2. Equipment loan ledger — promotes Equipment from trip-only
--      assignment into a real member-borrowing log.
--   3. Member.shirtSize — free-form column powering the shirt-size
--      report under /admin/reports.
-- All add fields/tables only; no destructive migrations.

ALTER TABLE "Member"
  ADD COLUMN "shirtSize" text;

ALTER TABLE "Event"
  ADD COLUMN "requiresPermissionSlip" boolean NOT NULL DEFAULT false,
  ADD COLUMN "permissionSlipText"     text;

CREATE TABLE "PermissionSlip" (
  "id"               text PRIMARY KEY NOT NULL,
  "orgId"            text NOT NULL,
  "eventId"          text NOT NULL,
  "memberId"         text NOT NULL,
  "signedByName"     text NOT NULL,
  "signedByEmail"    text,
  "signedAt"         timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "signedIp"         text,
  "slipTextSnapshot" text NOT NULL,
  "notes"            text,
  "createdAt"        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        timestamp(3) NOT NULL,
  CONSTRAINT "PermissionSlip_org_fk"    FOREIGN KEY ("orgId")    REFERENCES "Org"("id")    ON DELETE CASCADE,
  CONSTRAINT "PermissionSlip_event_fk"  FOREIGN KEY ("eventId")  REFERENCES "Event"("id")  ON DELETE CASCADE,
  CONSTRAINT "PermissionSlip_member_fk" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "PermissionSlip_event_member_key" ON "PermissionSlip"("eventId", "memberId");
CREATE INDEX "PermissionSlip_org_event_idx"           ON "PermissionSlip"("orgId", "eventId");
CREATE INDEX "PermissionSlip_org_member_idx"          ON "PermissionSlip"("orgId", "memberId");

CREATE TABLE "EquipmentLoan" (
  "id"          text PRIMARY KEY NOT NULL,
  "orgId"       text NOT NULL,
  "equipmentId" text NOT NULL,
  "memberId"    text NOT NULL,
  "loanedAt"    timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueAt"       timestamp(3),
  "returnedAt"  timestamp(3),
  "loanNotes"   text,
  "returnNotes" text,
  "createdAt"   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   timestamp(3) NOT NULL,
  CONSTRAINT "EquipmentLoan_org_fk"       FOREIGN KEY ("orgId")       REFERENCES "Org"("id")       ON DELETE CASCADE,
  CONSTRAINT "EquipmentLoan_equipment_fk" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE,
  CONSTRAINT "EquipmentLoan_member_fk"    FOREIGN KEY ("memberId")    REFERENCES "Member"("id")    ON DELETE CASCADE
);
CREATE INDEX "EquipmentLoan_org_equipment_returned_idx" ON "EquipmentLoan"("orgId", "equipmentId", "returnedAt");
CREATE INDEX "EquipmentLoan_org_member_returned_idx"    ON "EquipmentLoan"("orgId", "memberId", "returnedAt");
