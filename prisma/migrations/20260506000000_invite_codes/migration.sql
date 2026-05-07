-- Pre-launch invite codes. The apex (scoutingcompass.com) is gated
-- behind a Coming Soon page; valid codes set a signed cookie that
-- unlocks the marketing surface. Tenant subdomains stay open.

CREATE TABLE "InviteCode" (
  "id"         text PRIMARY KEY NOT NULL,
  "code"       text NOT NULL,
  "label"      text,
  "maxUses"    integer NOT NULL DEFAULT 0,
  "usedCount"  integer NOT NULL DEFAULT 0,
  "expiresAt"  timestamp(3),
  "disabledAt" timestamp(3),
  "createdAt"  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  timestamp(3) NOT NULL
);

CREATE UNIQUE INDEX "InviteCode_code_key" ON "InviteCode"("code");
