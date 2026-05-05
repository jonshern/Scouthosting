export const metadata = { title: "Security" };

export default function SecurityPage() {
  return (
    <section className="mx-auto max-w-content px-6 py-16">
      <h1 className="font-display text-4xl font-semibold">Security &amp; Trust</h1>
      <p className="mt-4 max-w-2xl text-ink-muted">
        Compass is built for organizations who keep youth safety at the center.
        Here&apos;s what that looks like under the hood.
      </p>
      <div className="mt-12 grid gap-8 md:grid-cols-2">
        <Block
          title="Two-deep leadership in chat"
          body="Adult-to-youth direct messages are blocked unless a second adult is in the channel. Enforced server-side, not just in the UI."
        />
        <Block
          title="MFA for leaders + admins"
          body="TOTP plus single-use backup codes. In production, password sign-in is disabled for privileged accounts — Google or Apple SSO only."
        />
        <Block
          title="Per-unit data isolation"
          body="Every tenant has its own subdomain. Every record carries its org id. Cross-tenant queries are flat-out impossible at the API layer."
        />
        <Block
          title="Audit log on every write"
          body="Every leader-facing change records who, what, and when. Discoverable from the org admin console."
        />
      </div>
    </section>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-ink-muted">{body}</p>
    </div>
  );
}
