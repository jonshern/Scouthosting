import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto max-w-content px-6 py-24 text-center">
      <h1 className="font-display text-4xl font-semibold">Site not found</h1>
      <p className="mt-2 text-ink-muted">
        That subdomain isn&apos;t a Compass site yet.
      </p>
      <Link href="/" className="btn-primary mt-8">Start a site</Link>
    </section>
  );
}
