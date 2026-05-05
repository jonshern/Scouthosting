// Newsletter helpers — compose-from-recent-activity and render-to-HTML.
// Pure-functional with injectable prismaClient + clock.

import type { PrismaClient } from "@prisma/client";
import { renderMarkdownLite } from "@/lib/markdown";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ComposeArgs = {
  orgId: string;
  now?: Date;
  lookbackDays?: number;
  recapDays?: number;
  lookaheadDays?: number;
  postLimit?: number;
  eventLimit?: number;
  pastEventLimit?: number;
  prismaClient: PrismaClient;
};

export async function composeNewsletter(args: ComposeArgs) {
  const {
    orgId,
    now = new Date(),
    lookbackDays = 14,
    recapDays = 14,
    lookaheadDays = 30,
    postLimit = 5,
    eventLimit = 8,
    pastEventLimit = 6,
    prismaClient,
  } = args;
  if (!orgId) throw new Error("composeNewsletter: missing orgId");
  if (!prismaClient) throw new Error("composeNewsletter: missing prismaClient");

  const since = new Date(now.getTime() - lookbackDays * DAY_MS);
  const recapSince = new Date(now.getTime() - recapDays * DAY_MS);
  const until = new Date(now.getTime() + lookaheadDays * DAY_MS);

  const [posts, events, pastEvents, org] = await Promise.all([
    prismaClient.post.findMany({
      where: { orgId, publishedAt: { gte: since, lte: now } },
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      take: postLimit,
      include: {
        author: { select: { displayName: true } },
        photos: {
          take: 1,
          orderBy: { sortOrder: "asc" },
          select: { filename: true, caption: true },
        },
      },
    }),
    prismaClient.event.findMany({
      where: { orgId, startsAt: { gte: now, lte: until } },
      orderBy: { startsAt: "asc" },
      take: eventLimit,
    }),
    prismaClient.event.findMany({
      where: { orgId, startsAt: { gte: recapSince, lt: now } },
      orderBy: { startsAt: "desc" },
      take: pastEventLimit,
    }),
    prismaClient.org.findUnique({
      where: { id: orgId },
      select: { displayName: true },
    }),
  ]);

  const orgName = org?.displayName || "Our unit";
  const dateLabel = now.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return {
    posts,
    events,
    pastEvents,
    suggestedTitle: `${orgName} — ${dateLabel}`,
    suggestedIntro: defaultIntro(orgName, posts.length, events.length, pastEvents.length),
  };
}

function defaultIntro(orgName: string, postCount: number, eventCount: number, pastEventCount = 0): string {
  if (postCount === 0 && eventCount === 0 && pastEventCount === 0) {
    return `Hi everyone — quick check-in from ${orgName}. Reply to this email if there's anything you need from us this week.`;
  }
  const parts: string[] = [];
  if (postCount) parts.push(`${postCount} update${postCount === 1 ? "" : "s"} from the last couple of weeks`);
  if (pastEventCount) parts.push(`${pastEventCount} recent event${pastEventCount === 1 ? "" : "s"} to recap`);
  if (eventCount) parts.push(`${eventCount} event${eventCount === 1 ? "" : "s"} on the calendar`);
  return `Hi everyone — here's what's happening at ${orgName}. ${parts.join(" and ")} below. Reply to this email if you have questions.`;
}

export type NewsletterOrg = {
  displayName: string;
  primaryColor?: string | null;
  accentColor?: string | null;
  logoFilename?: string | null;
  unitNumber?: string | null;
};

export type NewsletterRow = {
  title: string;
  intro: string | null;
  publishedAt?: Date | string | null;
};

export type NewsletterPost = {
  id: string;
  title?: string | null;
  body?: string | null;
  publishedAt?: Date | string | null;
  author?: { displayName?: string | null } | null;
};

export type NewsletterEvent = {
  id: string;
  title: string;
  startsAt: Date | string;
  location?: string | null;
};

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatPublishedAt(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatEventDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function excerpt(body: string | null | undefined, max: number): string {
  const flat = String(body || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

function plain(md: string | null | undefined): string {
  return String(md || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>]/g, "")
    .trim();
}

export function renderNewsletterHtml(args: {
  org: NewsletterOrg;
  newsletter: NewsletterRow;
  posts: NewsletterPost[];
  events: NewsletterEvent[];
  baseUrl: string;
}): { html: string; text: string } {
  const { org, newsletter, posts, events, baseUrl } = args;
  const orgName = org.displayName;
  const safeBaseUrl = String(baseUrl || "").replace(/\/$/, "");
  const primary = org.primaryColor || "#0f172a";
  const accent = org.accentColor || "#1d4ed8";
  const logoUrl = org.logoFilename
    ? `${safeBaseUrl}/uploads/${encodeURIComponent(org.logoFilename)}`
    : null;

  const brandHtml = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(orgName)}" style="height:36px;width:auto;display:block;border-radius:4px">`
    : `<span style="display:inline-block;width:36px;height:36px;border-radius:50%;background:#fff;color:${escapeHtml(primary)};font-family:Newsreader,Georgia,serif;font-style:italic;font-weight:500;font-size:16px;line-height:36px;text-align:center;letter-spacing:-0.02em">${escapeHtml(org.unitNumber || "·")}</span>`;

  const headerHtml = `
    <div style="background:${escapeHtml(primary)};margin:-32px -36px 28px;padding:18px 28px;border-radius:10px 10px 0 0;display:flex;align-items:center;gap:14px;border-bottom:4px solid ${escapeHtml(accent)}">
      ${brandHtml}
      <div style="flex:1">
        <div style="font-family:Newsreader,Georgia,serif;font-size:18px;color:#fff;letter-spacing:-0.012em">${escapeHtml(orgName)}</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.78);letter-spacing:0.08em;text-transform:uppercase;margin-top:2px">Field Notes</div>
      </div>
    </div>
    <h1 style="font-family:Newsreader,Georgia,serif;font-size:28px;font-weight:500;letter-spacing:-0.015em;color:#0f172a;margin:0 0 4px">${escapeHtml(newsletter.title)}</h1>
    <p style="font-size:12px;color:#64748b;margin:0 0 24px;letter-spacing:0.04em;text-transform:uppercase">${escapeHtml(formatPublishedAt(newsletter.publishedAt || new Date()))}</p>
  `;

  const introBody = renderMarkdownLite(newsletter.intro || "");
  const introHtml = `<div style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 28px">${introBody}</div>`;

  const postsHtml = posts.length
    ? `
    <h2 style="font-family:Newsreader,Georgia,serif;font-size:20px;font-weight:500;color:#0f172a;margin:0 0 16px;padding-top:24px;border-top:1px solid #e2e8f0">Recent posts</h2>
    <ul style="list-style:none;padding:0;margin:0 0 28px">
      ${posts
        .map(
          (p) => `
        <li style="margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid #eef1f5">
          <a href="${escapeHtml(safeBaseUrl)}/posts/${escapeHtml(p.id)}" style="color:${escapeHtml(primary)};text-decoration:none;font-weight:600;font-size:16px">${escapeHtml(p.title || "(untitled)")}</a>
          <p style="font-size:13px;color:#64748b;margin:4px 0 0">${escapeHtml(formatPublishedAt(p.publishedAt || new Date()))}${p.author?.displayName ? ` · ${escapeHtml(p.author.displayName)}` : ""}</p>
          <p style="font-size:14px;color:#334155;line-height:1.5;margin:8px 0 0">${escapeHtml(excerpt(p.body, 220))}</p>
        </li>`,
        )
        .join("")}
    </ul>`
    : "";

  const pivot = newsletter.publishedAt ? new Date(newsletter.publishedAt) : new Date();
  const weekEnd = new Date(pivot.getTime() + 7 * DAY_MS);
  const past = events.filter((e) => new Date(e.startsAt) < pivot);
  const upcomingAll = events.filter((e) => new Date(e.startsAt) >= pivot);
  const thisWeek = upcomingAll.filter((e) => new Date(e.startsAt) <= weekEnd);
  const later = upcomingAll.filter((e) => new Date(e.startsAt) > weekEnd);

  const renderEventLi = (e: NewsletterEvent) => `
        <li style="margin-bottom:14px;display:flex;gap:14px;align-items:flex-start">
          <span style="display:inline-block;min-width:64px;font-family:Newsreader,Georgia,serif;font-size:14px;font-style:italic;color:${escapeHtml(primary)}">${escapeHtml(formatEventDate(e.startsAt))}</span>
          <span style="flex:1">
            <a href="${escapeHtml(safeBaseUrl)}/events/${escapeHtml(e.id)}" style="color:${escapeHtml(primary)};text-decoration:none;font-weight:600">${escapeHtml(e.title)}</a>
            ${e.location ? `<br><span style="font-size:13px;color:#64748b">${escapeHtml(e.location)}</span>` : ""}
          </span>
        </li>`;

  const recapHtml = past.length
    ? `
    <h2 style="font-family:Newsreader,Georgia,serif;font-size:20px;font-weight:500;color:#0f172a;margin:0 0 16px;padding-top:24px;border-top:1px solid #e2e8f0">What we did</h2>
    <ul style="list-style:none;padding:0;margin:0 0 28px">
      ${past.map(renderEventLi).join("")}
    </ul>`
    : "";

  const eventsHtml = upcomingAll.length
    ? `
    <h2 style="font-family:Newsreader,Georgia,serif;font-size:20px;font-weight:500;color:#0f172a;margin:0 0 16px;padding-top:24px;border-top:1px solid #e2e8f0">On the calendar</h2>
    ${
      thisWeek.length
        ? `<h3 style="font-family:'Inter Tight',Inter,sans-serif;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:0 0 8px">This week</h3>
           <ul style="list-style:none;padding:0;margin:0 0 18px">${thisWeek.map(renderEventLi).join("")}</ul>`
        : ""
    }
    ${
      later.length
        ? `<h3 style="font-family:'Inter Tight',Inter,sans-serif;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:0 0 8px">Later this month</h3>
           <ul style="list-style:none;padding:0;margin:0 0 28px">${later.map(renderEventLi).join("")}</ul>`
        : ""
    }`
    : "";

  const footerHtml = `
    <p style="font-size:12px;color:#64748b;line-height:1.5;margin-top:36px;padding-top:18px;border-top:1px solid #e2e8f0">
      You're receiving this because you're a member of ${escapeHtml(orgName)}.<br>
      Hosted with <a href="https://compass.app" style="color:${escapeHtml(primary)};text-decoration:underline">Compass</a> — independent, not affiliated with Scouting America or BSA.
    </p>`;

  const html = `<!doctype html><html><body style="font-family:'Inter Tight',Inter,system-ui,sans-serif;background:#f7f8fa;margin:0;padding:24px"><div style="max-width:600px;margin:0 auto;background:#fff;padding:32px 36px;border:1px solid #e2e8f0;border-radius:10px">
    ${headerHtml}
    ${introHtml}
    ${postsHtml}
    ${recapHtml}
    ${eventsHtml}
    ${footerHtml}
  </div></body></html>`;

  const textParts: string[] = [
    newsletter.title,
    `(${orgName})`,
    "",
    plain(newsletter.intro || ""),
    "",
  ];
  if (posts.length) {
    textParts.push("RECENT POSTS", "");
    for (const p of posts) {
      textParts.push(`* ${p.title || "(untitled)"} — ${formatPublishedAt(p.publishedAt || new Date())}`);
      textParts.push(`  ${safeBaseUrl}/posts/${p.id}`);
      textParts.push(`  ${excerpt(p.body, 200)}`);
      textParts.push("");
    }
  }
  if (past.length) {
    textParts.push("WHAT WE DID", "");
    for (const e of past) {
      textParts.push(`* ${formatEventDate(e.startsAt)} — ${e.title}${e.location ? ` (${e.location})` : ""}`);
      textParts.push(`  ${safeBaseUrl}/events/${e.id}`);
      textParts.push("");
    }
  }
  if (upcomingAll.length) {
    textParts.push("ON THE CALENDAR", "");
    if (thisWeek.length) {
      textParts.push("-- This week --");
      for (const e of thisWeek) {
        textParts.push(`* ${formatEventDate(e.startsAt)} — ${e.title}${e.location ? ` (${e.location})` : ""}`);
        textParts.push(`  ${safeBaseUrl}/events/${e.id}`);
      }
      textParts.push("");
    }
    if (later.length) {
      textParts.push("-- Later this month --");
      for (const e of later) {
        textParts.push(`* ${formatEventDate(e.startsAt)} — ${e.title}${e.location ? ` (${e.location})` : ""}`);
        textParts.push(`  ${safeBaseUrl}/events/${e.id}`);
      }
      textParts.push("");
    }
  }
  textParts.push("—");
  textParts.push(`You're receiving this because you're a member of ${orgName}.`);

  return { html, text: textParts.join("\n") };
}

export const _internal = {
  defaultIntro,
  excerpt,
  plain,
  formatPublishedAt,
  formatEventDate,
  escapeHtml,
};
