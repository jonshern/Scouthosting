"use client";

import { useState } from "react";

const CHOICES = [
  { value: "yes", label: "Yes, I'll be there" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "Can't make it" },
] as const;

export function StaffRsvpForm({ token, initialStatus }: { token: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function answer(value: string) {
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/events/staff-rsvp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, status: value, notes: notes.trim() || undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; staff?: { status: string } };
      if (!res.ok || !body.staff) {
        setError(
          body.error === "rate_limited"
            ? "Too many tries. Wait a minute and try again."
            : body.error === "invalid_token"
              ? "This link is no longer valid."
              : "Couldn't save your answer. Try again.",
        );
        return;
      }
      setStatus(body.staff.status);
      setSaved(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div>
        <label className="label" htmlFor="staff-notes">Note for the organizer (optional)</label>
        <textarea
          id="staff-notes"
          rows={2}
          maxLength={1000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="field"
          placeholder="Morning only, bringing my own first-aid kit…"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {CHOICES.map((c) => (
          <button
            key={c.value}
            type="button"
            disabled={pending}
            onClick={() => answer(c.value)}
            className={status === c.value ? "btn-primary" : "btn-secondary"}
            aria-pressed={status === c.value}
          >
            {c.label}
          </button>
        ))}
      </div>
      {saved ? <p className="text-sm text-ink-muted">Thanks, we&apos;ve recorded your answer: {status}.</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
