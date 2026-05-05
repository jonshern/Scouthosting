import { describe, expect, it } from "vitest";
import {
  buildSitemap,
  eventJsonLd,
  metaTags,
  organizationJsonLd,
  robotsTxt,
} from "./seo";

describe("seo/metaTags", () => {
  it("escapes title and description", () => {
    const out = metaTags({ title: "Hello & <world>", description: 'a "quote"' });
    expect(out).toContain("<title>Hello &amp; &lt;world&gt;</title>");
    expect(out).toContain("a &quot;quote&quot;");
  });

  it("emits canonical when url is set", () => {
    expect(metaTags({ title: "x", url: "https://x.com/" })).toContain(
      'rel="canonical" href="https://x.com/"',
    );
  });

  it("uses summary_large_image when image present", () => {
    expect(metaTags({ title: "x", image: "https://x.com/og.png" })).toContain(
      'twitter:card" content="summary_large_image"',
    );
  });
});

describe("seo/jsonLd", () => {
  it("strips undefined keys from organization payload", () => {
    const out = organizationJsonLd({
      org: { displayName: "Troop 100" },
      url: "https://t100.example",
    });
    expect(out).toContain('"name":"Troop 100"');
    expect(out).not.toContain("undefined");
  });

  it("emits Event schema with start/end ISO", () => {
    const out = eventJsonLd({
      event: {
        title: "Pack Meeting",
        startsAt: new Date("2026-05-05T18:00:00Z"),
        endsAt: new Date("2026-05-05T19:00:00Z"),
      },
      org: { displayName: "Troop 100" },
      url: "https://t100.example/events/x",
    });
    expect(out).toContain('"startDate":"2026-05-05T18:00:00.000Z"');
    expect(out).toContain('"@type":"Event"');
  });
});

describe("seo/buildSitemap", () => {
  it("renders entries with optional fields", () => {
    const out = buildSitemap([
      { loc: "https://x.com/", changefreq: "weekly", priority: 1.0 },
      { loc: "https://x.com/about", lastmod: new Date("2026-05-05T00:00:00Z") },
    ]);
    expect(out).toContain("<loc>https://x.com/</loc>");
    expect(out).toContain("<priority>1</priority>");
    expect(out).toContain("<lastmod>2026-05-05T00:00:00.000Z</lastmod>");
  });
});

describe("seo/robotsTxt", () => {
  it("apex-style emits Allow + Sitemap", () => {
    const out = robotsTxt({ sitemapUrl: "https://x.com/sitemap.xml" });
    expect(out).toContain("Allow: /");
    expect(out).toContain("Sitemap: https://x.com/sitemap.xml");
  });

  it("org-style emits Disallow lines", () => {
    const out = robotsTxt({ disallow: ["/admin", "/login"] });
    expect(out).toContain("Disallow: /admin");
    expect(out).toContain("Disallow: /login");
  });
});
