// Compact "What's new" strip rendered at the bottom of the
// marketing footer + admin shell. Lists the most recent 3 releases
// with their tag, date, and title. Tapping a row jumps to the
// release on github.com (which has the full release notes).

import Link from "next/link";
import { getRecentReleases, shortTag } from "@/lib/github/releases";

function relativeWhen(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const day = 86_400_000;
  if (diffMs < day) return "today";
  if (diffMs < 2 * day) return "yesterday";
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`;
  if (diffMs < 30 * day) return `${Math.floor(diffMs / (7 * day))}w ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export async function ReleasesStrip({
  variant = "footer",
}: {
  variant?: "footer" | "admin";
}) {
  const releases = await getRecentReleases();
  if (releases.length === 0) return null;

  const containerClass =
    variant === "admin"
      ? "border-t border-line bg-surface-alt/50 py-3 px-8"
      : "border-t border-line bg-surface-alt/60 py-4 px-6";

  return (
    <div className={containerClass}>
      <div className={variant === "admin" ? "mx-auto max-w-[1400px]" : "mx-auto max-w-content"}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <span className="font-display italic text-sm text-accent">
              § What&rsquo;s new
            </span>{" "}
            <span className="text-xs text-slate-muted">
              · pulled from GitHub releases, refreshed every 30 minutes
            </span>
          </div>
          <Link
            href={`https://github.com/${process.env.GITHUB_RELEASES_OWNER ?? "jonshern"}/${
              process.env.GITHUB_RELEASES_REPO ?? "Scouthosting"
            }/releases`}
            className="text-xs text-slate-soft hover:text-ink"
          >
            All releases →
          </Link>
        </div>
        <ul className="mt-2 divide-y divide-line-soft">
          {releases.slice(0, 3).map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-baseline gap-3 py-2 text-sm"
            >
              <Link
                href={r.htmlUrl}
                className="font-mono text-xs rounded border border-line bg-white px-2 py-0.5 text-slate-soft hover:border-accent hover:text-ink"
              >
                {shortTag(r.tagName)}
              </Link>
              <Link
                href={r.htmlUrl}
                className="flex-1 min-w-[200px] text-ink hover:text-accent"
              >
                {r.name}
              </Link>
              <span className="text-xs text-slate-muted">{relativeWhen(r.publishedAt)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
