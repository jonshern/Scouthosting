// Permission slip helpers shared across the public-sign route, admin
// status reports, and parent portal.

export const DEFAULT_SLIP_TEXT = `I, the parent or legal guardian of the
Scout named below, give my permission for them to participate in this
event. I understand the activity may involve travel, the outdoors, and
physical exertion, and I authorize the unit's leadership to seek
emergency medical care if needed. I have read the event description
and confirm the contact information on file is current.`.replace(/\s+/g, " ").trim();

export function effectiveSlipText(eventText: string | null | undefined): string {
  const t = (eventText ?? "").trim();
  return t.length > 0 ? t : DEFAULT_SLIP_TEXT;
}

export type SignDecision = { ok: true } | { ok: false; reason: string; message: string };

/**
 * Whether a signed link may still record a signature. The token proves
 * who it was sent to, not that the facts still hold, so re-check:
 *   - the scout is still an active youth member of the event's org
 *   - the signer is still linked as one of the scout's parents
 *   - the event hasn't ended
 *   - once the event has started, an existing signature can't be
 *     overwritten (it's the record of what was in force at the time)
 */
export function canSignSlip(args: {
  now: Date;
  event: { orgId: string; startsAt: Date; endsAt: Date | null };
  member: {
    orgId: string;
    isYouth: boolean;
    deletedAt: Date | null;
    parentIds: string[];
  } | null;
  parentEmails: Array<string | null>;
  claimedParentEmail: string;
  alreadySigned: boolean;
}): SignDecision {
  const { now, event, member } = args;
  if (!member || member.orgId !== event.orgId || member.deletedAt || !member.isYouth) {
    return {
      ok: false,
      reason: "member",
      message: "This scout is no longer on the roster for this event.",
    };
  }
  const claimed = args.claimedParentEmail.trim().toLowerCase();
  const linked = args.parentEmails.some((e) => e && e.trim().toLowerCase() === claimed);
  if (!claimed || !linked) {
    return {
      ok: false,
      reason: "parent",
      message: "This link was sent to a parent who is no longer linked to this scout. Ask your unit leader to resend.",
    };
  }
  const end = event.endsAt ?? event.startsAt;
  if (now > end) {
    return { ok: false, reason: "ended", message: "This event has already ended." };
  }
  if (args.alreadySigned && now >= event.startsAt) {
    return {
      ok: false,
      reason: "locked",
      message: "This slip was already signed and the event has started, so it can't be changed.",
    };
  }
  return { ok: true };
}
