import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import {
  encryptField,
  provisionOrgVault,
} from "../src/lib/encryption";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

const ARGON_PARAMS = { memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 } as const;

const ADMIN_EMAIL = "scoutmaster@example.invalid";
const ADMIN_PASSWORD = "AdminPasswordTest123!";
const SUPER_EMAIL = "super@example.invalid";

// Demo passphrase for the seeded demo org. Recovery code is freshly
// generated on each seed and printed once to stdout — capture it from
// the seed output if a test needs it. NEVER use a fixed recovery code
// for a real org.
const DEMO_PASSPHRASE = "compass-demo-passphrase-12";

async function provisionStandingChannelsInline(orgId: string, displayName: string) {
  type ChannelDef = {
    kind: "troop" | "parents" | "leaders" | "patrol";
    name: string;
    patrolName: string | null;
  };

  const channelDefs: ChannelDef[] = [
    { kind: "troop", name: `${displayName} — All members`, patrolName: null },
    { kind: "parents", name: "Parents", patrolName: null },
    { kind: "leaders", name: "Leaders only", patrolName: null },
  ];

  const patrols = await prisma.member.findMany({
    where: { orgId, patrol: { not: null } },
    distinct: ["patrol"],
    select: { patrol: true },
  });
  for (const p of patrols) {
    if (!p.patrol) continue;
    channelDefs.push({ kind: "patrol", name: `${p.patrol} patrol`, patrolName: p.patrol });
  }

  for (const def of channelDefs) {
    const existing = await prisma.channel.findFirst({
      where: { orgId, kind: def.kind, patrolName: def.patrolName },
      select: { id: true },
    });
    const channel =
      existing ??
      (await prisma.channel.create({
        data: { orgId, kind: def.kind, name: def.name, patrolName: def.patrolName },
        select: { id: true },
      }));

    let desired: string[];
    if (def.kind === "leaders") {
      const rows = await prisma.orgMembership.findMany({
        where: { orgId, role: { in: ["leader", "admin"] } },
        select: { userId: true },
      });
      desired = rows.map((r) => r.userId);
    } else if (def.kind === "parents") {
      const rows = await prisma.orgMembership.findMany({
        where: { orgId, role: { in: ["parent", "leader", "admin"] } },
        select: { userId: true },
      });
      desired = rows.map((r) => r.userId);
    } else if (def.kind === "patrol") {
      // Scout members in this patrol who have a matching User by email,
      // plus all org leaders/admins so the channel meets two-deep.
      const [scoutMembers, leaderRows] = await Promise.all([
        prisma.member.findMany({
          where: { orgId, patrol: def.patrolName ?? undefined, email: { not: null } },
          select: { email: true },
        }),
        prisma.orgMembership.findMany({
          where: { orgId, role: { in: ["leader", "admin"] } },
          select: { userId: true },
        }),
      ]);
      const scoutEmails = scoutMembers.map((m) => m.email).filter((e): e is string => !!e);
      const scoutUsers = scoutEmails.length
        ? await prisma.user.findMany({
            where: { email: { in: scoutEmails } },
            select: { id: true },
          })
        : [];
      desired = [...scoutUsers.map((u) => u.id), ...leaderRows.map((r) => r.userId)];
    } else {
      const rows = await prisma.orgMembership.findMany({
        where: { orgId },
        select: { userId: true },
      });
      desired = rows.map((r) => r.userId);
    }

    if (desired.length) {
      await prisma.channelMember.createMany({
        data: desired.map((userId) => ({ channelId: channel.id, userId, addedAutomatically: true })),
        skipDuplicates: true,
      });
    }
  }
}

async function main() {
  const passwordHash = await hash(ADMIN_PASSWORD, ARGON_PARAMS);

  const user = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { passwordHash, displayName: "Sample Scoutmaster", emailVerified: true },
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      displayName: "Sample Scoutmaster",
      emailVerified: true,
    },
  });

  // Super-admin for /super-admin write-action tests.
  await prisma.user.upsert({
    where: { email: SUPER_EMAIL },
    update: { passwordHash, displayName: "Sample Super", emailVerified: true, isSuperAdmin: true },
    create: {
      email: SUPER_EMAIL,
      passwordHash,
      displayName: "Sample Super",
      emailVerified: true,
      isSuperAdmin: true,
    },
  });

  // Provision the encryption vault (DEK + 3 wraps + recovery code).
  // Re-uses any existing vault if the org already has one so re-running
  // the seed is idempotent and existing encrypted Member rows stay
  // decryptable. New orgs get a fresh DEK and the recovery code is
  // logged once to stdout.
  let existingOrg = await prisma.org.findUnique({
    where: { slug: "troop100" },
    select: {
      id: true,
      encryptedDek: true,
      passphraseWrappedDek: true,
      passphraseSalt: true,
      passphraseVerifier: true,
      recoveryWrappedDek: true,
      recoverySalt: true,
      recoveryVerifier: true,
      keyVersion: true,
      keyRotatedAt: true,
    },
  });

  let dek: Buffer;
  let recoveryCode: string | null = null;
  let vaultFields: Record<string, unknown> = {};

  if (
    existingOrg &&
    existingOrg.encryptedDek &&
    existingOrg.passphraseWrappedDek &&
    existingOrg.passphraseSalt &&
    existingOrg.passphraseVerifier &&
    existingOrg.recoveryWrappedDek &&
    existingOrg.recoverySalt &&
    existingOrg.recoveryVerifier
  ) {
    // Re-unlock with the demo passphrase so we can re-encrypt members.
    const { unwrapDekWithPassphrase } = await import("../src/lib/encryption");
    dek = await unwrapDekWithPassphrase(
      {
        passphraseWrappedDek: existingOrg.passphraseWrappedDek,
        passphraseSalt: existingOrg.passphraseSalt,
        passphraseVerifier: existingOrg.passphraseVerifier,
      },
      DEMO_PASSPHRASE,
    );
  } else {
    const provisioned = await provisionOrgVault(DEMO_PASSPHRASE);
    dek = provisioned.dek;
    recoveryCode = provisioned.recoveryCode;
    vaultFields = provisioned.fields as unknown as Record<string, unknown>;
  }

  const org = await prisma.org.upsert({
    where: { slug: "troop100" },
    update: vaultFields,
    create: {
      slug: "troop100",
      unitType: "Troop",
      unitNumber: "100",
      displayName: "Sample Troop 100",
      tagline: "Adventure since forever",
      charterOrg: "Example Charter Organization",
      city: "Anytown",
      state: "MN",
      council: "Sample Council",
      district: "District 1",
      meetingDay: "Mondays",
      meetingTime: "7:00 PM",
      scoutmasterName: "Sample Scoutmaster",
      scoutmasterEmail: ADMIN_EMAIL,
      ownerId: user.id,
      plan: "patrol",
      isDemo: true,
      ...vaultFields,
    },
  });

  if (recoveryCode) {
    // eslint-disable-next-line no-console
    console.log(`[seed] org=${org.slug} passphrase=${DEMO_PASSPHRASE} recoveryCode=${recoveryCode}`);
  }

  await prisma.orgMembership.upsert({
    where: { userId_orgId: { userId: user.id, orgId: org.id } },
    update: { role: "admin" },
    create: { userId: user.id, orgId: org.id, role: "admin" },
  });

  // A handful of Members so the group-email audience builder has rows.
  // Mix of email-eligible adults, youth, an opt-out, and a bounce.
  const memberSeeds = [
    { firstName: "Avery", lastName: "Adult", email: "avery@example.invalid", isYouth: false, position: "Scoutmaster", patrol: null },
    { firstName: "Briar", lastName: "Adult", email: "briar@example.invalid", isYouth: false, position: null, patrol: null },
    { firstName: "Casey", lastName: "Youth", email: "casey@example.invalid", isYouth: true, position: null, patrol: "Eagles" },
    { firstName: "Dale",  lastName: "Youth", email: "dale@example.invalid",  isYouth: true, position: null, patrol: "Eagles" },
    { firstName: "Eden",  lastName: "Optout", email: "eden@example.invalid", isYouth: false, position: null, patrol: null,
      emailUnsubscribed: true, unsubscribedAt: new Date() },
  ];
  const aad = (purpose: string) => ({ orgId: org.id, purpose });
  for (const m of memberSeeds) {
    const existing = await prisma.member.findFirst({
      where: { orgId: org.id, email: m.email },
      select: { id: true },
    });
    const data = {
      orgId: org.id,
      encFirstName: encryptField(m.firstName, dek, org.id, "member.firstName"),
      encLastName: encryptField(m.lastName, dek, org.id, "member.lastName"),
      lastNameLc1: m.lastName[0]?.toLowerCase() ?? "?",
      email: m.email,
      isYouth: m.isYouth,
      position: m.position,
      patrol: m.patrol,
      emailUnsubscribed: m.emailUnsubscribed ?? false,
      unsubscribedAt: m.unsubscribedAt ?? null,
      // Reset lifecycle on re-seed so test-run mutations don't leak.
      deletedAt: null,
      status: "active",
    };
    if (existing) {
      await prisma.member.update({ where: { id: existing.id }, data });
    } else {
      await prisma.member.create({ data });
    }
    // Quiet the unused warning if we later add address fields here.
    void aad;
  }

  // Standing chat channels (troop / parents / leaders / per-patrol).
  // Inlined so this seed runs in the Fly runtime image, which only
  // copies prisma/ — not src/. Mirrors provisionStandingChannels in
  // src/lib/chat without the YPT post-check (the runtime guard
  // enforces two-deep on every write, so seed-time validation is
  // redundant).
  await provisionStandingChannelsInline(org.id, org.displayName);

  // eslint-disable-next-line no-console
  console.log("Seeded:", { user: user.email, org: org.slug, members: memberSeeds.length });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
