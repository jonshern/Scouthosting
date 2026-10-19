// Everything the demo would have emailed or texted, newest first.
// Only exists when DEMO_MODE=1 (src/lib/demo/outbox.ts).

import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoMode } from "@/lib/demo/mode";
import { recentOutbox } from "@/lib/demo/outbox";

export const dynamic = "force-dynamic";
export const metadata = { title: "Demo outbox" };

const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default async function DemoOutboxPage() {
  if (!isDemoMode()) notFound();
  const messages = await recentOutbox(100);

  return (
    <main className="min-h-screen bg-bg px-5 py-12 text-ink">
      <div className="mx-auto max-w-3xl">
        <Link href="/demo" className="text-sm text-accent underline-offset-2 hover:underline">
          ← Back to the demo
        </Link>
        <h1 className="mt-4 font-display font-semibold text-4xl tracking-[-0.015em]">Demo outbox</h1>
        <p className="mt-3 text-base leading-[1.6] text-ink-muted">
          In a real unit these would go out by email and text. In the demo they stop here. The newest 100 are shown, and
          the outbox empties when the demo resets.
        </p>

        {messages.length === 0 ? (
          <p className="mt-10 rounded-xl border border-line bg-white p-6 text-sm text-ink-muted">
            Nothing yet. Sign in as the Scoutmaster and send a message to the troop, or RSVP to an event, then come back.
          </p>
        ) : (
          <ol className="mt-8 space-y-4">
            {messages.map((m) => (
              <li key={m.id} className="rounded-xl border border-line bg-white p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-ink-muted">
                  <span>
                    <span className="mr-2 rounded bg-surface-alt px-1.5 py-0.5 font-medium uppercase tracking-wide text-ink">
                      {m.kind === "sms" ? "Text" : "Email"}
                    </span>
                    To {m.toName ? `${m.toName} <${m.to}>` : m.to}
                  </span>
                  <time dateTime={m.createdAt.toISOString()}>{when.format(m.createdAt)}</time>
                </div>
                {m.subject ? <p className="mt-2 font-medium">{m.subject}</p> : null}
                <p className="mt-2 whitespace-pre-line text-sm leading-[1.55] text-ink-soft">
                  {m.body.length > 1200 ? `${m.body.slice(0, 1200)}…` : m.body}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}
