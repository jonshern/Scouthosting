// Unit tests for lib/newsletter.js. Both helpers accept injected deps
// (Prisma override on composer, no DB on the renderer) so the tests
// never touch a real database.

import { describe, it, expect } from "vitest";
import { composeNewsletter, renderNewsletterHtml, _internal } from "../lib/newsletter.js";

const ORG = {
  id: "org1",
  displayName: "Sample Troop 12",
  slug: "troop12",
};
const NOW = new Date("2026-04-30T12:00:00Z");

function fakePrisma({ posts = [], events = [], orgs = [ORG] } = {}) {
  return {
    post: {
      findMany: async ({ where, take, orderBy, include }) => {
        let out = posts.filter((p) => {
          if (p.orgId !== where.orgId) return false;
          if (where.publishedAt?.gte && new Date(p.publishedAt) < where.publishedAt.gte) return false;
          if (where.publishedAt?.lte && new Date(p.publishedAt) > where.publishedAt.lte) return false;
          return true;
        });
        // Mirror the orderBy: pinned desc, publishedAt desc.
        out.sort((a, b) => {
          if ((b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
          return new Date(b.publishedAt) - new Date(a.publishedAt);
        });
        return out.slice(0, take ?? out.length);
      },
    },
    event: {
      findMany: async ({ where, take, orderBy }) => {
        let out = events.filter((e) => {
          if (e.orgId !== where.orgId) return false;
          if (where.startsAt?.gte && new Date(e.startsAt) < where.startsAt.gte) return false;
          if (where.startsAt?.lte && new Date(e.startsAt) > where.startsAt.lte) return false;
          return true;
        });
        out.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
        return out.slice(0, take ?? out.length);
      },
    },
    org: {
      findUnique: async ({ where }) => orgs.find((o) => o.id === where.id) || null,
    },
  };
}

describe("composeNewsletter", () => {
  it("requires orgId + prismaClient", async () => {
    await expect(composeNewsletter({})).rejects.toThrow(/missing orgId/);
    await expect(composeNewsletter({ orgId: "x" })).rejects.toThrow(/missing prismaClient/);
  });

  it("returns suggested title with the org name + today's date", async () => {
    const prisma = fakePrisma();
    const r = await composeNewsletter({
      orgId: "org1",
      now: NOW,
      prismaClient: prisma,
    });
    expect(r.suggestedTitle).toContain("Sample Troop 12");
    expect(r.suggestedTitle).toContain("April 30, 2026");
  });

  it("only pulls posts from the lookback window", async () => {
    const old = new Date("2026-04-01T12:00:00Z"); // 29 days ago — outside default 14
    const recent = new Date("2026-04-25T12:00:00Z"); // 5 days ago — inside
    const future = new Date("2026-05-05T12:00:00Z"); // future — outside (lte: now)
    const prisma = fakePrisma({
      posts: [
        { id: "old", orgId: "org1", title: "Old", publishedAt: old, pinned: false },
        { id: "recent", orgId: "org1", title: "Recent", publishedAt: recent, pinned: false },
        { id: "future", orgId: "org1", title: "Future", publishedAt: future, pinned: false },
      ],
    });
    const r = await composeNewsletter({ orgId: "org1", now: NOW, prismaClient: prisma });
    expect(r.posts.map((p) => p.id)).toEqual(["recent"]);
  });

  it("only pulls events from the lookahead window", async () => {
    const past = new Date("2026-04-25T12:00:00Z"); // past — outside (gte: now)
    const soon = new Date("2026-05-04T12:00:00Z"); // 4 days out — inside
    const farOff = new Date("2026-06-30T12:00:00Z"); // 61 days — outside default 30
    const prisma = fakePrisma({
      events: [
        { id: "past", orgId: "org1", title: "Past", startsAt: past },
        { id: "soon", orgId: "org1", title: "Soon", startsAt: soon },
        { id: "farOff", orgId: "org1", title: "Far off", startsAt: farOff },
      ],
    });
    const r = await composeNewsletter({ orgId: "org1", now: NOW, prismaClient: prisma });
    expect(r.events.map((e) => e.id)).toEqual(["soon"]);
  });

  it("respects the postLimit + eventLimit caps", async () => {
    const prisma = fakePrisma({
      posts: Array.from({ length: 10 }, (_, i) => ({
        id: `p${i}`,
        orgId: "org1",
        title: `Post ${i}`,
        publishedAt: new Date(NOW.getTime() - (i + 1) * 24 * 60 * 60 * 1000),
        pinned: false,
      })),
      events: Array.from({ length: 12 }, (_, i) => ({
        id: `e${i}`,
        orgId: "org1",
        title: `Event ${i}`,
        startsAt: new Date(NOW.getTime() + (i + 1) * 24 * 60 * 60 * 1000),
      })),
    });
    const r = await composeNewsletter({
      orgId: "org1",
      now: NOW,
      postLimit: 3,
      eventLimit: 4,
      prismaClient: prisma,
    });
    expect(r.posts.length).toBe(3);
    expect(r.events.length).toBe(4);
  });

  it("returns a friendly default intro when nothing's recent", async () => {
    const prisma = fakePrisma();
    const r = await composeNewsletter({ orgId: "org1", now: NOW, prismaClient: prisma });
    expect(r.suggestedIntro).toContain("Sample Troop 12");
    expect(r.suggestedIntro).toMatch(/quick check-in/i);
  });

  it("intro changes wording when there's content vs. when there isn't", async () => {
    const prisma = fakePrisma({
      posts: [{ id: "p1", orgId: "org1", title: "Hi", publishedAt: NOW, pinned: false }],
    });
    const r = await composeNewsletter({ orgId: "org1", now: NOW, prismaClient: prisma });
    expect(r.suggestedIntro).toMatch(/here's what's happening/i);
    expect(r.suggestedIntro).toMatch(/1 update/i);
  });
});

describe("renderNewsletterHtml", () => {
  const newsletter = {
    title: "Troop 12 Weekly · May 4",
    intro: "Hi everyone — quick note about Friday's campout.",
    publishedAt: new Date("2026-05-04T12:00:00Z"),
  };
  const baseUrl = "https://troop12.compass.app";

  it("renders the title and intro markdown", () => {
    const out = renderNewsletterHtml({
      org: ORG,
      newsletter,
      posts: [],
      events: [],
      baseUrl,
    });
    expect(out.html).toContain("Troop 12 Weekly · May 4");
    expect(out.html).toContain("Hi everyone");
    expect(out.text).toContain("Troop 12 Weekly · May 4");
  });

  it("includes a Recent posts section with permalinks", () => {
    const posts = [
      {
        id: "p1",
        title: "Spring Campout recap",
        body: "We had a great weekend at Birch Lake. Here are the highlights...",
        publishedAt: new Date("2026-05-01T12:00:00Z"),
        author: { displayName: "Mr. Avery" },
      },
    ];
    const out = renderNewsletterHtml({ org: ORG, newsletter, posts, events: [], baseUrl });
    expect(out.html).toContain("Recent posts");
    expect(out.html).toContain("Spring Campout recap");
    expect(out.html).toContain(`${baseUrl}/posts/p1`);
    expect(out.html).toContain("Mr. Avery");
    expect(out.text).toContain("RECENT POSTS");
    expect(out.text).toContain(`${baseUrl}/posts/p1`);
  });

  it("includes an On-the-calendar section with event permalinks", () => {
    const events = [
      {
        id: "e1",
        title: "Boundary Waters Trek",
        location: "Ely, MN",
        startsAt: new Date("2026-05-09T11:00:00Z"),
      },
    ];
    const out = renderNewsletterHtml({ org: ORG, newsletter, posts: [], events, baseUrl });
    expect(out.html).toContain("On the calendar");
    expect(out.html).toContain("Boundary Waters Trek");
    expect(out.html).toContain("Ely, MN");
    expect(out.html).toContain(`${baseUrl}/events/e1`);
    expect(out.text).toContain("ON THE CALENDAR");
  });

  it("escapes HTML metacharacters in user-supplied content", () => {
    const evilNewsletter = {
      ...newsletter,
      title: "<script>alert(1)</script>",
      intro: "Plain text with <b>html</b>",
    };
    const out = renderNewsletterHtml({
      org: ORG,
      newsletter: evilNewsletter,
      posts: [
        {
          id: "p1",
          title: "Tag <em> abuse",
          body: "Hostile <body>",
          publishedAt: new Date("2026-05-01T00:00:00Z"),
        },
      ],
      events: [],
      baseUrl,
    });
    expect(out.html).not.toContain("<script>alert(1)</script>");
    expect(out.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out.html).toContain("Tag &lt;em&gt; abuse");
  });

  it("renders a footer with the unsubscribe-context disclaimer", () => {
    const out = renderNewsletterHtml({ org: ORG, newsletter, posts: [], events: [], baseUrl });
    expect(out.html).toMatch(/You're receiving this because you're a member of Sample Troop 12/);
    expect(out.html).toMatch(/Hosted with .*Compass/);
  });

  it("handles a trailing slash on baseUrl by normalizing it away", () => {
    const out = renderNewsletterHtml({
      org: ORG,
      newsletter,
      posts: [
        {
          id: "p1",
          title: "Hi",
          body: "Hi.",
          publishedAt: new Date("2026-05-01T00:00:00Z"),
        },
      ],
      events: [],
      baseUrl: "https://troop12.compass.app/",
    });
    expect(out.html).toContain("https://troop12.compass.app/posts/p1");
    expect(out.html).not.toContain("compass.app//posts/p1");
  });
});

describe("excerpt (internal)", () => {
  it("strips markdown bullets, links, and emphasis", () => {
    const md = "Hi. **Bold** and [a link](https://x.com) and `code` and # headers.";
    const out = _internal.excerpt(md, 200);
    expect(out).toBe("Hi. Bold and a link and code and headers.");
  });

  it("trims to the requested length without breaking mid-word", () => {
    const md = "the quick brown fox jumps over the lazy dog";
    expect(_internal.excerpt(md, 18)).toBe("the quick brown…");
  });

  it("returns the raw string when shorter than max", () => {
    expect(_internal.excerpt("short", 50)).toBe("short");
  });
});
