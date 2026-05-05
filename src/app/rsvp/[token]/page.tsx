// /rsvp/[token] — one-click email RSVP. Verify the signed token,
// then upsert an Rsvp keyed on (eventId, email) using the embedded
// claims. The query string carries `r` ∈ {yes, no, maybe} so each
// button in the email is its own URL.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyRsvpToken } from "@/lib/security/rsvp-token";

type Search = { r?: string; guests?: string };

export default async function OneClickRsvp({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Search>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const claims = verifyRsvpToken(token);
  if (!claims) {
    return (
      <main className="mx-auto max-w-content px-6 py-16 text-center">
        <h1 className="font-display text-3xl">Link expired</h1>
        <p className="mt-2 text-ink-muted">
          This RSVP link is no longer valid. Open the calendar in your unit's site to RSVP.
        </p>
      </main>
    );
  }

  const event = await prisma.event.findUnique({
    where: { id: claims.eventId },
    select: { id: true, orgId: true, title: true, startsAt: true, location: true },
  });
  if (!event) {
    return (
      <main className="mx-auto max-w-content px-6 py-16 text-center">
        <h1 className="font-display text-3xl">Event not found</h1>
      </main>
    );
  }

  const response = (sp.r === "no" || sp.r === "maybe" ? sp.r : "yes") as "yes" | "no" | "maybe";
  const guests = Math.max(0, Math.floor(Number(sp.guests ?? 0)) || 0);

  const existing = await prisma.rsvp.findFirst({
    where: { eventId: event.id, email: claims.email.toLowerCase() },
    select: { id: true },
  });
  if (existing) {
    await prisma.rsvp.update({
      where: { id: existing.id },
      data: { response, guests },
    });
  } else {
    await prisma.rsvp.create({
      data: {
        orgId: event.orgId,
        eventId: event.id,
        name: claims.name,
        email: claims.email.toLowerCase(),
        response,
        guests,
      },
    });
  }

  return (
    <main className="mx-auto max-w-content px-6 py-16 text-center">
      <h1 className="font-display text-3xl">Thanks — RSVP saved</h1>
      <p className="mt-3 text-ink-muted">
        We've recorded <strong>{response}</strong> for{" "}
        <strong>{event.title}</strong>
        {event.location ? ` at ${event.location}` : ""}.
      </p>
      <p className="mt-6 text-sm text-ink-muted">
        Made a mistake? Just click a different button in the email — we'll overwrite this.
      </p>
    </main>
  );
}
