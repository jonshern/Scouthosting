// Strip across the top of every page on the demo deployment, so nobody
// mistakes the sample troop for a real one.

import Link from "next/link";

export function DemoBanner() {
  return (
    <div role="note" className="bg-amber-soft px-4 py-2 text-center text-[13px] leading-snug text-amber">
      <strong className="font-semibold">Demo.</strong> Troop 42 and everyone in it are made up. Emails and texts land in
      the{" "}
      <Link href="/demo/outbox" className="font-medium underline underline-offset-2">
        outbox
      </Link>{" "}
      instead of being sent, and the data resets every night.{" "}
      <Link href="/demo" className="font-medium underline underline-offset-2">
        Switch account
      </Link>
    </div>
  );
}
