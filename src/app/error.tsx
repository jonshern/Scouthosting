"use client";

// Shown in place of a page that threw (a database hiccup, a bad link, a
// bug). Keeps the site's frame and offers a retry instead of the bare
// "Application error" screen. The digest matches the server log line
// and the super-admin error log entry.

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto max-w-content px-6 py-24 text-center">
      <h1 className="font-display text-4xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-ink-muted">
        That didn&apos;t work. Try again in a moment; if it keeps happening, let your unit&apos;s admin know.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <button type="button" onClick={() => reset()} className="btn-primary">
          Try again
        </button>
        <Link href="/" className="btn-secondary">
          Home
        </Link>
      </div>
      {error.digest ? (
        <p className="mt-6 text-xs text-ink-muted">Reference: {error.digest}</p>
      ) : null}
    </section>
  );
}
