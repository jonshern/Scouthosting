// /super-admin — the owner console: the apex-only surface where the
// platform owner manages every unit and account across Compass,
// Waypoint and Lantern. Every route under this segment requires a User
// with isSuperAdmin=true, which only `npm run owner:grant` sets.

import { OwnerNav } from "@/components/owner/OwnerNav";
import { requireOwnerPage } from "@/lib/owner/guard";

export const metadata = { title: { default: "Owner console", template: "%s — Owner console" } };

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  await requireOwnerPage();

  return (
    <div className="flex min-h-screen flex-col bg-bg md:flex-row">
      <aside className="bg-ink px-3 py-5 text-white md:sticky md:top-0 md:h-screen md:w-[248px] md:shrink-0 md:overflow-y-auto">
        <div className="flex items-center gap-2.5 px-2 pb-5">
          <span className="flex gap-[3px]" aria-hidden>
            <span className="h-[22px] w-2 rounded-[3px] bg-white" />
            <span className="h-[22px] w-2 rounded-[3px] bg-accent" />
            <span className="h-[22px] w-2 rounded-[3px] bg-muted" />
          </span>
          <div className="leading-tight">
            <h1 className="text-[15px] font-semibold tracking-normal">Owner console</h1>
            <div className="text-xs text-on-ink-muted">Compass · Waypoint · Lantern</div>
          </div>
        </div>
        <OwnerNav />
      </aside>
      <div className="min-w-0 flex-1 px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-[1200px]">{children}</div>
      </div>
    </div>
  );
}
