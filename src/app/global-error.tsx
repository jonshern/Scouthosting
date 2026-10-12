"use client";

// Last resort when the root layout itself fails to render. It replaces
// the whole document, so it carries its own <html> and plain styles.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "6rem 1.5rem", color: "#1f2937" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 600 }}>Compass is having trouble</h1>
        <p style={{ marginTop: "0.5rem", color: "#6b7280" }}>Please try again in a minute.</p>
        <button
          type="button"
          onClick={() => reset()}
          style={{ marginTop: "2rem", padding: "0.6rem 1.2rem", borderRadius: "0.5rem", border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}
        >
          Try again
        </button>
        {error.digest ? <p style={{ marginTop: "1.5rem", fontSize: "0.75rem", color: "#9ca3af" }}>Reference: {error.digest}</p> : null}
      </body>
    </html>
  );
}
