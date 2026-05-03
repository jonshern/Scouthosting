-- TOTP-based 2FA. User gets totpSecret + enrollment timestamps;
-- BackupCode holds the 10 one-time recovery codes generated at
-- enrollment (argon2id hashed, same as passwords). totpSecret is
-- stored plaintext for v1 — acceptable risk; future PR adds env-var-
-- keyed AEAD encryption at rest.

ALTER TABLE "User"
  ADD COLUMN "totpSecret"     TEXT,
  ADD COLUMN "totpEnrolledAt" TIMESTAMP(3),
  ADD COLUMN "totpLastUsedAt" TIMESTAMP(3);

CREATE TABLE "BackupCode" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL,
  "codeHash"  TEXT NOT NULL,
  "usedAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BackupCode_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "BackupCode_userId_idx" ON "BackupCode"("userId");
