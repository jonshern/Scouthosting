// GitHub Releases fetcher. Pulls the latest releases from a public
// repo so the footer can render a "What's new" link. Authenticated
// requests are preferred (5,000 req/h via PAT) but unauth works too
// (60 req/h per IP — fine for a once-per-30-minutes cache).
//
// Repo defaults are baked in so the marketing footer doesn't need
// per-org config; an admin can override via env if they fork the
// project for a different repo.

import { unstable_cache } from "next/cache";

export type ReleaseSummary = {
  id: number;
  tagName: string;
  name: string;
  publishedAt: Date;
  body: string;
  htmlUrl: string;
};

const REPO_OWNER = process.env.GITHUB_RELEASES_OWNER ?? "jonshern";
const REPO_NAME = process.env.GITHUB_RELEASES_REPO ?? "Scouthosting";

type GitHubReleaseRow = {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  html_url: string;
};

async function fetchReleasesUncached(): Promise<ReleaseSummary[]> {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases?per_page=10`;
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const res = await fetch(url, { headers, next: { revalidate: 0 } });
  if (!res.ok) return [];
  const rows = (await res.json()) as GitHubReleaseRow[];
  return rows
    .filter((r) => !r.draft && !r.prerelease && r.published_at)
    .map((r) => ({
      id: r.id,
      tagName: r.tag_name,
      name: (r.name ?? r.tag_name).trim(),
      publishedAt: new Date(r.published_at!),
      body: r.body ?? "",
      htmlUrl: r.html_url,
    }))
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, 5);
}

// Cache 30 minutes — releases land infrequently and we don't want
// to chew the unauthenticated 60 req/h budget when the site is
// crawled or a long-lived browser keeps the homepage open.
export const getRecentReleases = unstable_cache(
  fetchReleasesUncached,
  ["github-releases", REPO_OWNER, REPO_NAME],
  { revalidate: 30 * 60, tags: ["github-releases"] },
);

/** Pretty short label for a tag — strips a leading `v` and trims. */
export function shortTag(tag: string): string {
  return tag.replace(/^v/i, "").trim();
}
