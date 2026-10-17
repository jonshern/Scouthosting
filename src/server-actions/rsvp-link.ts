"use server";

import { redirect } from "next/navigation";
import { verifyOrigin } from "@/lib/security/csrf";
import { verifyRsvpToken } from "@/lib/security/rsvp-token";
import { parseLinkGuests, parseLinkResponse, recordLinkRsvp } from "@/lib/rsvp/link";

// The signed token is the credential; the origin check keeps another
// site from posting the form on someone's behalf.
export async function confirmLinkRsvp(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const path = `/rsvp/${encodeURIComponent(token)}`;
  if (!(await verifyOrigin())) redirect(path);
  const claims = verifyRsvpToken(token);
  const response = parseLinkResponse(formData.get("response"));
  if (!claims || !response) redirect(path);
  const res = await recordLinkRsvp({
    claims,
    response,
    guests: parseLinkGuests(formData.get("guests")),
  });
  if (res.ok) redirect(`${path}?done=${response}`);
  if (res.reason === "full") redirect(`${path}?full=${res.spotsLeft}`);
  redirect(path);
}
