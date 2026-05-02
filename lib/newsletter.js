// Newsletter helpers — compose-from-recent-activity and render-to-HTML.
//
// Pure-functional with injectable prismaClient + clock so the unit tests
// never touch a real DB. The composer picks the recent posts + upcoming
// events that fall inside the configured windows; the renderer turns a
// Newsletter row into the HTML + plain-text the leader can preview before
// sending.
//
// The newsletter is *editorial*: the leader writes the intro, then the
// system folds in the activity. Auto-compose returns *suggestions*, not a
// committed draft — the leader is free to drop posts, reorder, or rewrite
// the intro before saving.

import { renderMarkdown } from "./markdown.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Compose                                                             */
/* ------------------------------------------------------------------ */

/**
 * Pull the recent posts + recent past events + upcoming events that
 * should pre-fill a new newsletter draft. Membership-gated content
 * (private posts) is *not* filtered out here — the composer decides
 * what to include.
 *
 * @param {Object}   args
 * @param {string}   args.orgId
 * @param {Date}     [args.now]              Pinned wall clock for tests.
 * @param {number}   [args.lookbackDays=14]  How far back to pull posts.
 * @param {number}   [args.recapDays=14]     How far back to pull past events ("what we did").
 * @param {number}   [args.lookaheadDays=30] How far ahead to pull events.
 * @param {number}   [args.postLimit=5]      Cap on posts returned.
 * @param {number}   [args.eventLimit=8]     Cap on upcoming events returned.
 * @param {number}   [args.pastEventLimit=6] Cap on past events returned.
 * @param {Object}   [args.prismaClient]     Override for tests.
 * @returns {Promise<{
 *   posts: Array,
 *   events: Array,
 *   pastEvents: Array,
 *   suggestedIntro: string,
 *   suggestedTitle: string,
 * }>}
 */
export async function composeNewsletter({
  orgId,
  now = new Date(),
  lookbackDays = 14,
  recapDays = 14,
  lookaheadDays = 30,
  postLimit = 5,
  eventLimit = 8,
  pastEventLimit = 6,
  prismaClient,
} = {}) {
  if (!orgId) throw new Error("composeNewsletter: missing orgId");
  if (!prismaClient) throw new Error("composeNewsletter: missing prismaClient");

  const since = new Date(now.getTime() - lookbackDays * DAY_MS);
  const recapSince = new Date(now.getTime() - recapDays * DAY_MS);
  const until = new Date(now.getTime() + lookaheadDays * DAY_MS);

  const [posts, events, pastEvents, org] = await Promise.all([
    prismaClient.post.findMany({
      where: {
        orgId,
        publishedAt: { gte: since, lte: now },
      },
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
      where: {
        orgId,
        startsAt: { gte: now, lte: until },
      },
      orderBy: { startsAt: "asc" },
      take: eventLimit,
    }),
    prismaClient.event.findMany({
      where: {
        orgId,
        startsAt: { gte: recapSince, lt: now },
      },
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

function defaultIntro(orgName, postCount, eventCount, pastEventCount = 0) {
  if (postCount === 0 && eventCount === 0 && pastEventCount === 0) {
    return `Hi everyone — quick check-in from ${orgName}. Reply to this email if there's anything you need from us this week.`;
  }
  const parts = [];
  if (postCount) parts.push(`${postCount} update${postCount === 1 ? "" : "s"} from the last couple of weeks`);
  if (pastEventCount) parts.push(`${pastEventCount} recent event${pastEventCount === 1 ? "" : "s"} to recap`);
  if (eventCount) parts.push(`${eventCount} event${eventCount === 1 ? "" : "s"} on the calendar`);
  return `Hi everyone — here's what's happening at ${orgName}. ${parts.join(" and ")} below. Reply to this email if you have questions.`;
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

/**
 * Turn a Newsletter row plus its included posts/events into the HTML +
 * plain-text variants. baseUrl is the org's public URL ("https://troop12.compass.app");
 * permalinks for posts and events are derived from it.
 *
 * Pure-functional — never touches the DB. The caller is responsible for
 * resolving included posts/events from `newsletter.includedPostIds` /
 * `includedEventIds` before calling.
 *
 * @returns {{ html: string, text: string }}
 */
export function renderNewsletterHtml({
  org,
  newsletter,
  posts,
  events,
  baseUrl,
}) {
  const orgName = org.displayName;
  const safeBaseUrl = String(baseUrl || "").replace(/\/$/, "");
  const primary = org.primaryColor || "#0e3320";
  const accent = org.accentColor || "#c8e94a";
  const logoUrl = org.logoFilename
    ? `${safeBaseUrl}/uploads/${encodeURIComponent(org.logoFilename)}`
    : null;

  // Per-org branded header: primary-coloured band with the unit's
  // logo (or unit-number badge) on the left, the unit name as the
  // wordmark, and an accent-coloured rule under it.
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
    <h1 style="font-family:Newsreader,Georgia,serif;font-size:28px;font-weight:500;letter-spacing:-0.015em;color:#0d130d;margin:0 0 4px">${escapeHtml(newsletter.title)}</h1>
    <p style="font-size:12px;color:#5a6258;margin:0 0 24px;letter-spacing:0.04em;text-transform:uppercase">${escapeHtml(formatPublishedAt(newsletter.publishedAt || new Date()))}</p>
  `;

  // Markdown-render the intro, then unwrap the outermost <p> if there's
  // exactly one paragraph so it sits flush with the rest of the layout.
  const introBody = renderMarkdown(newsletter.intro || "");
  const introHtml = `<div style="font-size:15px;line-height:1.6;color:#2a352a;margin:0 0 28px">${introBody}</div>`;

  const postsHtml = posts.length
    ? `
    <h2 style="font-family:Newsreader,Georgia,serif;font-size:20px;font-weight:500;color:#0d130d;margin:0 0 16px;padding-top:24px;border-top:1px solid #d4c8a8">Recent posts</h2>
    <ul style="list-style:none;padding:0;margin:0 0 28px">
      ${posts
        .map(
          (p) => `
        <li style="margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid #e6dcc0">
          <a href="${escapeHtml(safeBaseUrl)}/posts/${escapeHtml(p.id)}" style="color:${escapeHtml(primary)};text-decoration:none;font-weight:600;font-size:16px">${escapeHtml(p.title || "(untitled)")}</a>
          <p style="font-size:13px;color:#5a6258;margin:4px 0 0">${escapeHtml(formatPublishedAt(p.publishedAt))}${p.author?.displayName ? ` · ${escapeHtml(p.author.displayName)}` : ""}</p>
          <p style="font-size:14px;color:#2a352a;line-height:1.5;margin:8px 0 0">${escapeHtml(excerpt(p.body, 220))}</p>
        </li>`,
        )
        .join("")}
    </ul>`
    : "";

  // Split events into past ("recap") + upcoming, then split upcoming
  // into "this week" (next 7 days) and "later" so the digest reads as
  // a rollup. The renderer picks the wall-clock from `newsletter.publishedAt`
  // (or now) so a saved draft preview matches send-time bucketing.
  const pivot = newsletter.publishedAt ? new Date(newsletter.publishedAt) : new Date();
  const weekEnd = new Date(pivot.getTime() + 7 * 24 * 60 * 60 * 1000);
  const past = events.filter((e) => new Date(e.startsAt) < pivot);
  const upcomingAll = events.filter((e) => new Date(e.startsAt) >= pivot);
  const thisWeek = upcomingAll.filter((e) => new Date(e.startsAt) <= weekEnd);
  const later = upcomingAll.filter((e) => new Date(e.startsAt) > weekEnd);

  const renderEventLi = (e) => `
        <li style="margin-bottom:14px;display:flex;gap:14px;align-items:flex-start">
          <span style="display:inline-block;min-width:64px;font-family:Newsreader,Georgia,serif;font-size:14px;font-style:italic;color:${escapeHtml(primary)}">${escapeHtml(formatEventDate(e.startsAt))}</span>
          <span style="flex:1">
            <a href="${escapeHtml(safeBaseUrl)}/events/${escapeHtml(e.id)}" style="color:${escapeHtml(primary)};text-decoration:none;font-weight:600">${escapeHtml(e.title)}</a>
            ${e.location ? `<br><span style="font-size:13px;color:#5a6258">${escapeHtml(e.location)}</span>` : ""}
          </span>
        </li>`;

  const recapHtml = past.length
    ? `
    <h2 style="font-family:Newsreader,Georgia,serif;font-size:20px;font-weight:500;color:#0d130d;margin:0 0 16px;padding-top:24px;border-top:1px solid #d4c8a8">What we did</h2>
    <ul style="list-style:none;padding:0;margin:0 0 28px">
      ${past.map(renderEventLi).join("")}
    </ul>`
    : "";

  const eventsHtml = upcomingAll.length
    ? `
    <h2 style="font-family:Newsreader,Georgia,serif;font-size:20px;font-weight:500;color:#0d130d;margin:0 0 16px;padding-top:24px;border-top:1px solid #d4c8a8">On the calendar</h2>
    ${
      thisWeek.length
        ? `<h3 style="font-family:'Inter Tight',Inter,sans-serif;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#5a6258;margin:0 0 8px">This week</h3>
           <ul style="list-style:none;padding:0;margin:0 0 18px">${thisWeek.map(renderEventLi).join("")}</ul>`
        : ""
    }
    ${
      later.length
        ? `<h3 style="font-family:'Inter Tight',Inter,sans-serif;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#5a6258;margin:0 0 8px">Later this month</h3>
           <ul style="list-style:none;padding:0;margin:0 0 28px">${later.map(renderEventLi).join("")}</ul>`
        : ""
    }`
    : "";

  const footerHtml = `
    <p style="font-size:12px;color:#5a6258;line-height:1.5;margin-top:36px;padding-top:18px;border-top:1px solid #d4c8a8">
      You're receiving this because you're a member of ${escapeHtml(orgName)}.<br>
      Hosted with <a href="https://compass.app" style="color:${escapeHtml(primary)};text-decoration:underline">Compass</a> — independent, not affiliated with Scouting America or BSA.
    </p>`;

  const html = `<!doctype html><html><body style="font-family:'Inter Tight',Inter,system-ui,sans-serif;background:#f4ecdc;margin:0;padding:24px"><div style="max-width:600px;margin:0 auto;background:#fff;padding:32px 36px;border:1px solid #d4c8a8;border-radius:10px">
    ${headerHtml}
    ${introHtml}
    ${postsHtml}
    ${recapHtml}
    ${eventsHtml}
    ${footerHtml}
  </div></body></html>`;

  // Plain-text variant
  const textParts = [
    newsletter.title,
    `(${orgName})`,
    "",
    plain(newsletter.intro || ""),
    "",
  ];
  if (posts.length) {
    textParts.push("RECENT POSTS");
    textParts.push("");
    for (const p of posts) {
      textParts.push(`* ${p.title || "(untitled)"} — ${formatPublishedAt(p.publishedAt)}`);
      textParts.push(`  ${safeBaseUrl}/posts/${p.id}`);
      textParts.push(`  ${excerpt(p.body, 200)}`);
      textParts.push("");
    }
  }
  if (past.length) {
    textParts.push("WHAT WE DID");
    textParts.push("");
    for (const e of past) {
      textParts.push(`* ${formatEventDate(e.startsAt)} — ${e.title}${e.location ? ` (${e.location})` : ""}`);
      textParts.push(`  ${safeBaseUrl}/events/${e.id}`);
      textParts.push("");
    }
  }
  if (upcomingAll.length) {
    textParts.push("ON THE CALENDAR");
    textParts.push("");
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
  const text = textParts.join("\n");

  return { html, text };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatPublishedAt(d) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatEventDate(d) {
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function excerpt(body, max) {
  const flat = String(body || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

function plain(md) {
  return String(md || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>]/g, "")
    .trim();
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export const _internal = {
  defaultIntro,
  excerpt,
  plain,
  formatPublishedAt,
  formatEventDate,
  escapeHtml,
};
