// Single source of truth for the architecture page's stack manifest.
// Update this when introducing or replacing infrastructure pieces; the
// /super-admin/architecture page renders straight off this list and
// CLAUDE.md links to it for engineers.

export type StackEntry = {
  layer: string;
  tool: string;
  why: string;
};

export const STACK_MANIFEST: ReadonlyArray<StackEntry> = [
  { layer: "Runtime", tool: "Node 22", why: "LTS; native fetch + ESM stable." },
  { layer: "Web framework", tool: "Next.js 16 (App Router)", why: "Server actions, RSC, file-based routing." },
  { layer: "UI", tool: "React 19 + Tailwind", why: "Concurrent rendering; utility CSS." },
  { layer: "ORM / DB", tool: "Prisma 5 + Postgres 16", why: "Type-safe queries; row-level encryption columns are bytea." },
  { layer: "Auth", tool: "Lucia 3 + argon2id", why: "Session-based; password hashes parameterised in src/lib/auth/password.ts." },
  { layer: "Background jobs", tool: "pg-boss", why: "DB-backed queue, single deploy unit." },
  { layer: "Mail", tool: "Resend (lazy)", why: "Falls back to noop in dev; tracked via MailLog." },
  { layer: "Encryption", tool: "AES-256-GCM (node:crypto) + argon2id", why: "Per-org DEK envelope-encrypted with MASTER_KEY env; admin passphrase + recovery code." },
  { layer: "Object storage", tool: "STORAGE_DRIVER (local/s3/gcs)", why: "Driver-agnostic put/get; encrypted bytes layered above the driver." },
  { layer: "Realtime", tool: "src/lib/realtime/bus.ts (in-process)", why: "LISTEN/NOTIFY upgrade pending; works in single-pod." },
  { layer: "Mobile", tool: "Expo / React Native", why: "Talks to /api/v1 over HTTPS; no wildcard DNS needed." },
  { layer: "Deploy", tool: "Dockerfile → Cloud Run (runs on Jon's Mac for now)", why: "Single image; starts next only. Migrations are a separate step (scripts/migrate.sh / the migrate job)." },
] as const;

export type EncryptedField = {
  model: string;
  field: string;
  notes: string;
};

export const ENCRYPTED_FIELDS: ReadonlyArray<EncryptedField> = [
  { model: "Member", field: "firstName", notes: "Sort by lastNameLc1 (single-letter bucket); search post-decrypt within page window." },
  { model: "Member", field: "lastName", notes: "Same bucket sort." },
  { model: "Member", field: "phone", notes: "No search; null if absent." },
  { model: "Member", field: "street", notes: "Address line 1." },
  { model: "Member", field: "city", notes: "Encrypted alongside street/state/zip." },
  { model: "Member", field: "state", notes: "Encrypted with the rest of the address." },
  { model: "Member", field: "zip", notes: "Encrypted; postal code." },
  { model: "Photo", field: "<bytes>", notes: "File contents encrypted before storage put; decrypted on /uploads/<key> serve." },
  { model: "Photo", field: "originalName", notes: "Original filename hidden from on-disk path." },
  { model: "JourneyScout", field: "name", notes: "Lantern scout's first name. Not in an org, so keyed per owner by HKDF of MASTER_KEY (lib/journey/crypto.ts); re-encrypt on master-key rotation." },
  { model: "JourneyEntry", field: "text + photo bytes", notes: "Lantern notes, log notes and proof photos on a scout's requirements. Same per-owner journey key as the scout name, own AAD purposes (lib/journey/crypto.ts)." },
] as const;

export const PLAINTEXT_BY_DESIGN: ReadonlyArray<{ model: string; field: string; reason: string }> = [
  { model: "Member", field: "email", reason: "Background email + magic links + chat membership lookups need exact match without unlock." },
  { model: "Member", field: "patrol/position", reason: "Used for channel routing; no PII concern individually." },
  { model: "User", field: "email/displayName", reason: "Identity layer (Lucia)." },
  { model: "MailLog", field: "recipients (JSON snapshot)", reason: "Point-in-time audit log; future encrypt sweep is a follow-up." },
] as const;

export const VERIFY_RUNBOOK: ReadonlyArray<{ step: string; cmd?: string; expect: string }> = [
  {
    step: "DB columns are unreadable bytea",
    cmd: 'psql "$DATABASE_URL" -c \'SELECT id, enc_first_name FROM "Member" LIMIT 3;\'',
    expect: "enc_first_name shows \\x… hex bytes, not names.",
  },
  {
    step: "On-disk photos are ciphertext",
    cmd: "file .local-uploads/orgs/<orgId>/photos/<key>",
    expect: "→ data (not 'JPEG image data').",
  },
  {
    step: "Authenticated /uploads round-trip works",
    cmd: "curl -b \"$COOKIE\" http://troop100.localhost:3000/uploads/<key> -o /tmp/x.jpg && file /tmp/x.jpg",
    expect: "→ JPEG image data — proves serve-side decrypt path.",
  },
  {
    step: "Production refuses to boot without MASTER_KEY",
    cmd: "NODE_ENV=production MASTER_KEY= node -e \"require('./src/lib/encryption').getMasterKey()\"",
    expect: "Throws: 'MASTER_KEY env var is required in production.'",
  },
  {
    step: "Wrong passphrase rejected without unwrap",
    expect: "unwrapDekWithPassphrase throws WrongPassphraseError before touching the wrap (constant-time verifier check).",
  },
  {
    step: "Cross-tenant DEK isolation",
    expect: "Member from org A encrypted with org A's DEK; decryptField with org B's DEK throws auth-tag failure (AAD binds to orgId).",
  },
] as const;
