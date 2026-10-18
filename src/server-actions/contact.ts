"use server";

// The public /contact form: a question, problem or idea about Compass,
// Waypoint or Lantern, from anyone (signed in or not). It lands in the
// owner console inbox.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { checkHoneypot } from "@/lib/security/honeypot";
import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/client-ip";
import { createInboxItem, KINDS, PRODUCTS } from "@/lib/owner/inbox";

const Schema = z.object({
  name: z.string().trim().min(1, "Add your name.").max(120),
  email: z.string().trim().toLowerCase().email("Check your email address.").max(200),
  product: z.enum([...PRODUCTS, "unsure"]).default("unsure"),
  kind: z.enum(KINDS).default("question"),
  message: z.string().trim().min(5, "Write a little more.").max(8000),
});

function back(error: string): never {
  redirect(`/contact?error=${encodeURIComponent(error)}`);
}

export async function submitContact(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) back("Something went wrong. Reload the page and try again.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) back("Something went wrong. Reload the page and try again.");
  const form = Object.fromEntries(formData) as Record<string, string>;
  if (!checkHoneypot(form).ok) back("That was a little fast. Try again.");
  const ip = clientIp(await headers()) ?? "unknown";
  if (!(await rateLimit(`contact:${ip}`, 5, 60 * 60_000)).ok) back("Too many messages from here. Try again in an hour.");

  const parsed = Schema.safeParse(form);
  if (!parsed.success) back(parsed.error.issues[0]?.message ?? "Check the form.");
  const input = parsed.data;
  const { user } = await getSession();

  await createInboxItem({
    product: input.product === "unsure" ? null : input.product,
    kind: input.kind,
    message: input.message,
    fromEmail: input.email,
    fromName: input.name,
    // Signed in with the same address: tie it to the account.
    userId: user && user.email.toLowerCase() === input.email ? user.id : null,
    context: { source: "contact page" },
  });
  redirect("/contact?sent=1");
}
