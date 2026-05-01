#!/usr/bin/env node
// Grant super-admin status to a user by email.
//
// Out-of-band only — there is no HTTP form that flips this flag. Run:
//
//   node scripts/grant-super-admin.js me@example.com
//   node scripts/grant-super-admin.js me@example.com --revoke
//
// The user must already exist (sign up at https://compass.app/signup.html
// first; this just elevates them).

import { prisma } from "../lib/db.js";

const args = process.argv.slice(2);
const email = (args.find((a) => !a.startsWith("--")) || "").trim().toLowerCase();
const revoke = args.includes("--revoke");

if (!email) {
  console.error("usage: node scripts/grant-super-admin.js <email> [--revoke]");
  process.exit(1);
}

const user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  console.error(`No user with email ${email}. Sign up at the apex first.`);
  process.exit(2);
}

const updated = await prisma.user.update({
  where: { id: user.id },
  data: { isSuperAdmin: !revoke },
});

console.log(
  `${revoke ? "Revoked" : "Granted"} super-admin: ${updated.email} (${updated.id})`,
);
process.exit(0);
