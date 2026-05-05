"use client";

// Minimal placeholder. The signup-slot server action wasn't carried
// across in the parallel-agent merge — wiring this up to an action
// (with capacity + waitlist semantics) is tracked as the next chunk.
// For now this component lets the calendar page typecheck and renders
// a non-destructive notice so the public page stays usable.

type Props = {
  orgSlug: string;
  slotId: string;
  signedIn: boolean;
  csrf: React.ReactNode;
  full: boolean;
  allowWaitlist: boolean;
};

export function SlotSignupForm({ full, allowWaitlist }: Props) {
  const label = full
    ? allowWaitlist
      ? "Waitlist sign-up coming soon."
      : "This slot is full."
    : "Slot sign-up coming soon.";
  return <p className="mt-2 text-xs text-ink-muted">{label}</p>;
}
