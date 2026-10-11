-- Move sign-in from Lucia v3 to Better Auth.
--
-- What carries over:
--   * Passwords: each User.passwordHash becomes a "credential" Account
--     row. The argon2id hashes are copied as-is; Better Auth verifies them
--     with the same parameters (src/lib/auth/password.ts).
--   * Google / Apple links: each OAuthAccount row becomes an Account row
--     keyed by the provider's subject id, so returning SSO users land on
--     the same User.
--   * MFA: untouched. The TOTP secret, replay window and backup codes stay
--     on User / BackupCode and Compass's own MFA check keeps using them.
--
-- What doesn't: Lucia sessions. Better Auth signs its session cookie and
-- stores a separate token, so old cookies can't be honoured. Every
-- signed-in browser is signed out once and signs in again. API tokens
-- (mobile) are a separate table and keep working.

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Passwords -> credential accounts.
INSERT INTO "Account" ("id", "userId", "accountId", "providerId", "password", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u."id", u."id", 'credential', u."passwordHash", u."createdAt", CURRENT_TIMESTAMP
FROM "User" u
WHERE u."passwordHash" IS NOT NULL;

-- OAuthAccount -> provider accounts.
INSERT INTO "Account" ("id", "userId", "accountId", "providerId", "createdAt", "updatedAt")
SELECT o."id", o."userId", o."providerAccountId", o."provider", o."createdAt", o."updatedAt"
FROM "OAuthAccount" o;

ALTER TABLE "OAuthAccount" DROP CONSTRAINT "OAuthAccount_userId_fkey";
DROP TABLE "OAuthAccount";

ALTER TABLE "User" DROP COLUMN "passwordHash",
ADD COLUMN "image" TEXT;

-- Lucia sessions can't be carried over (see header).
DELETE FROM "Session";

ALTER TABLE "Session"
ADD COLUMN "token" TEXT NOT NULL,
ADD COLUMN "ipAddress" TEXT,
ADD COLUMN "userAgent" TEXT,
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL;

CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateTable
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RateLimit_key_key" ON "RateLimit"("key");
