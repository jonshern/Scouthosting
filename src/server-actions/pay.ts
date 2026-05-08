"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { dollarsToCents } from "@/lib/treasury/money";
import { createMemberPaymentSession } from "@/lib/treasury/stripe";

const Schema = z.object({
  orgSlug: z.string().min(1),
  memberId: z.string().min(1),
  amount: z.string().min(1),
  description: z.string().trim().min(1).max(500),
});

async function originForRequest(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function startMemberPayment(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string } | null> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const { user } = await getSession();
  if (!user) return { error: "Sign in to pay." };

  const org = await prisma.org.findUnique({ where: { slug: parsed.data.orgSlug } });
  if (!org) return { error: "Org not found." };

  // Verify the user is linked to this member as a parent.
  const member = await prisma.member.findUnique({
    where: { id: parsed.data.memberId },
    include: { org: true },
  });
  if (!member || member.orgId !== org.id) return { error: "Member not found." };

  const parentRow = await prisma.member.findFirst({
    where: { orgId: org.id, email: user.email.toLowerCase(), deletedAt: null },
    select: { id: true },
  });
  const isOwner = parentRow && (member.parentIds.includes(parentRow.id) || member.id === parentRow.id);
  if (!isOwner) return { error: "Not your scout." };

  const cents = dollarsToCents(parsed.data.amount);
  if (cents < 50) return { error: "Minimum payment is $0.50." };

  const baseUrl = await originForRequest();
  let session;
  try {
    session = await createMemberPaymentSession({
      org,
      memberId: member.id,
      amountCents: cents,
      description: parsed.data.description,
      buyerEmail: user.email,
      successUrl: `${baseUrl}/account/my-scouts?paid=ok`,
      cancelUrl: `${baseUrl}/account/my-scouts?paid=cancel`,
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!session.url) return { error: "Stripe did not return a checkout URL." };
  redirect(session.url);
}
