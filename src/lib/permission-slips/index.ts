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
