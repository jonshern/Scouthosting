"use server";

// The public "Join our troop" form on a unit's site. Anyone can send
// it, signed in or not. It becomes a lead on the roster's Pending tab
// (Member status "prospect", source "web-form"), where a leader
// approves or declines it, and the Scoutmaster gets an email with the
// family's address as Reply-To.
//
// Spam and abuse: CSRF, origin, the honeypot, and rate limits for each
// IP address and for each unit. The family gets no email from us, so
// the form can't be used to send mail to a stranger. Names and phone
// are encrypted like every roster row. The page shows the same thanks
// whether or not the address is already on the roster.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { checkHoneypot } from "@/lib/security/honeypot";
import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/client-ip";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { encryptMemberPii } from "@/lib/members/crypto";
import { INTEREST_AGES as AGES, sendInterestNotice } from "@/lib/members/interest-mail";
import { orgBasePath } from "@/lib/tenancy/base-path";
import { logger } from "@/lib/log";

const log = logger.child("interest");

// One line, no control characters: these end up in an email subject.
const line = (max: number) => z.string().trim().max(max).transform((v) => v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim());

const Schema = z.object({
  orgSlug: z.string().min(1).max(64),
  firstName: line(80).pipe(z.string().min(1, "Add your first name.")),
  lastName: line(80).pipe(z.string().min(1, "Add your last name.")),
  email: z.string().trim().toLowerCase().email("Check your email address.").max(200),
  phone: line(40).optional().default(""),
  scoutName: line(80).optional().default(""),
  scoutAge: z.enum(["", ...AGES]).optional().default(""),
  message: z.string().trim().max(2000).optional().default(""),
});

export async function submitInterest(formData: FormData): Promise<void> {
  const form = Object.fromEntries(formData) as Record<string, string>;
  const slug = String(form.orgSlug ?? "");
  // The unit's own host shows /interest; the apex shows /o/<slug>/interest.
  const base = /^[a-z0-9-]{1,64}$/.test(slug) ? await orgBasePath(slug) : "";
  const back = (q: string): never => redirect(`${base}/interest?${q}`);
  const oops = () => back("error=" + encodeURIComponent("Something went wrong. Reload the page and try again."));

  if (!(await verifyOrigin())) oops();
  if (!(await verifyCsrf(String(form._csrf ?? "")))) oops();
  if (!checkHoneypot(form).ok) back("error=" + encodeURIComponent("That was a little fast. Try again."));

  const org = await prisma.org.findUnique({
    where: { slug },
    select: { id: true, slug: true, displayName: true, unitType: true, customDomain: true, encryptedDek: true, scoutmasterEmail: true, suspendedAt: true },
  });
  if (!org || org.suspendedAt || !org.encryptedDek) oops();

  const ip = clientIp(await headers()) ?? "unknown";
  if (!(await rateLimit(`interest:ip:${ip}`, 5, 60 * 60_000)).ok) back("error=" + encodeURIComponent("Too many from here. Try again in an hour."));
  if (!(await rateLimit(`interest:org:${org!.id}`, 30, 24 * 60 * 60_000)).ok) back("error=" + encodeURIComponent("This unit has had a lot of messages today. Try again tomorrow."));

  const parsed = Schema.safeParse(form);
  if (!parsed.success) back("error=" + encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the form."));
  const d = parsed.data!;

  const existing = await prisma.member.findFirst({
    where: { orgId: org!.id, deletedAt: null, email: { equals: d.email, mode: "insensitive" } },
    select: { id: true, status: true },
  });

  const note = [
    d.scoutName ? `Scout: ${d.scoutName}${d.scoutAge ? `, ${d.scoutAge}` : ""}` : d.scoutAge ? `Scout's age: ${d.scoutAge}` : "",
    d.message,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000);

  let leadId: string | null = existing?.id ?? null;
  if (!existing) {
    const dek = unwrapDekWithMaster(org!);
    const now = new Date();
    const adult = await prisma.member.create({
      data: {
        orgId: org!.id,
        ...encryptMemberPii({ firstName: d.firstName, lastName: d.lastName, phone: d.phone || null }, dek, org!.id),
        email: d.email,
        isYouth: false,
        status: "prospect",
        prospectSource: "web-form",
        prospectNote: note || null,
        joinedAt: now,
      },
      select: { id: true },
    });
    leadId = adult.id;
    if (d.scoutName) {
      // "Sam" → Sam <parent's last name>; "Sam Lee" → Sam Lee.
      const parts = d.scoutName.split(/\s+/);
      const first = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0];
      const last = parts.length > 1 ? parts[parts.length - 1] : d.lastName;
      await prisma.member.create({
        data: {
          orgId: org!.id,
          ...encryptMemberPii({ firstName: first, lastName: last }, dek, org!.id),
          isYouth: true,
          status: "prospect",
          prospectSource: "web-form",
          prospectNote: d.scoutAge ? `Age ${d.scoutAge} (from the join form)` : "From the join form",
          parentIds: [adult.id],
          joinedAt: now,
        },
      });
    }
  }

  try {
    await sendInterestNotice({
      to: org!.scoutmasterEmail,
      org: org!,
      from: { name: `${d.firstName} ${d.lastName}`, email: d.email, phone: d.phone || null },
      scout: d.scoutName ? `${d.scoutName}${d.scoutAge ? ` (${d.scoutAge})` : ""}` : d.scoutAge ? `age ${d.scoutAge}` : null,
      message: d.message || null,
      alreadyOnRoster: !!existing && existing.status !== "prospect",
      leadId,
    });
  } catch (err) {
    log.warn("interest notice failed", { org: org!.slug, err: err instanceof Error ? err.message : String(err) });
  }
  back("sent=1");
}
