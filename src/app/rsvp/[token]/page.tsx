// /rsvp/[token] — one-click email RSVP. Each email button links here
// with `r` ∈ {yes, no, maybe}. Opening the link only verifies the signed
// token and asks the reader to confirm; mail scanners fetch every link,
// so the answer is recorded by the confirm POST (src/lib/rsvp/link.ts).

import { prisma } from "@/lib/db";
import { verifyRsvpToken } from "@/lib/security/rsvp-token";
import { parseLinkGuests, parseLinkResponse } from "@/lib/rsvp/link";
import { confirmLinkRsvp } from "@/server-actions/rsvp-link";

type Search = { r?: string; guests?: string; done?: string; full?: string };

const LABEL = { yes: "Yes, I'm going", maybe: "Maybe", no: "Can't make it" } as const;

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
        <h1 className="font-display font-semibold text-3xl">Link expired</h1>
        <p className="mt-2 text-ink-muted">
          This RSVP link is no longer valid. Open the calendar in your unit's site to RSVP.
        </p>
      </main>
    );
  }

  const event = await prisma.event.findUnique({
    where: { id: claims.eventId },
    select: { id: true, title: true, location: true },
  });
  if (!event) {
    return (
      <main className="mx-auto max-w-content px-6 py-16 text-center">
        <h1 className="font-display font-semibold text-3xl">Event not found</h1>
      </main>
    );
  }

  const done = parseLinkResponse(sp.done);
  if (done) {
    return (
      <main className="mx-auto max-w-content px-6 py-16 text-center">
        <h1 className="font-display font-semibold text-3xl">Thanks — RSVP saved</h1>
        <p className="mt-3 text-ink-muted">
          We've recorded <strong>{done}</strong> for <strong>{event.title}</strong>
          {event.location ? ` at ${event.location}` : ""}.
        </p>
        <p className="mt-6 text-sm text-ink-muted">
          Made a mistake? Click a different button in the email and confirm again.
        </p>
      </main>
    );
  }

  const picked = parseLinkResponse(sp.r) ?? "yes";
  const guests = parseLinkGuests(sp.guests);
  const order = [picked, ...(["yes", "maybe", "no"] as const).filter((r) => r !== picked)];

  return (
    <main className="mx-auto max-w-content px-6 py-16 text-center">
      <h1 className="font-display font-semibold text-3xl">RSVP for {event.title}</h1>
      <p className="mt-3 text-ink-muted">
        Answering as {claims.name}
        {event.location ? ` · ${event.location}` : ""}.
      </p>
      {sp.full !== undefined ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {fullNotice(sp.full)}
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {order.map((r, i) => (
          <form key={r} action={confirmLinkRsvp}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="response" value={r} />
            <input type="hidden" name="guests" value={guests} />
            <button
              type="submit"
              className={
                i === 0
                  ? "rounded-md bg-ink px-5 py-2.5 font-medium text-white"
                  : "rounded-md border border-line px-5 py-2.5 font-medium"
              }
            >
              {LABEL[r]}
            </button>
          </form>
        ))}
      </div>
    </main>
  );
}

function fullNotice(left: string): string {
  const n = Math.max(0, Math.floor(Number(left)) || 0);
  if (n === 0) return "Sorry, this event is full. Your RSVP wasn't saved.";
  return `Only ${n === 1 ? "1 spot" : `${n} spots`} left, so your RSVP wasn't saved. Try fewer guests, or answer maybe.`;
}
