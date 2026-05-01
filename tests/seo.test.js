// SEO helper tests. The contract is "produce valid HTML / XML / JSON
// that crawlers and structured-data validators accept" — these tests
// pin the shape so a regression here doesn't quietly delist a unit
// from search.

import { describe, it, expect } from "vitest";
import {
  metaTags,
  organizationJsonLd,
  eventJsonLd,
  buildSitemap,
  robotsTxt,
} from "../lib/seo.js";

describe("metaTags", () => {
  it("emits title + description + canonical + OG + Twitter", () => {
    const out = metaTags({
      title: "Troop 12",
      description: "A Scout unit in Anytown",
      url: "https://troop12.compass.app/",
      image: "https://troop12.compass.app/cover.jpg",
    });
    expect(out).toMatch(/<title>Troop 12<\/title>/);
    expect(out).toMatch(/<meta name="description" content="A Scout unit in Anytown">/);
    expect(out).toMatch(/<link rel="canonical" href="https:\/\/troop12\.compass\.app\/">/);
    expect(out).toMatch(/<meta property="og:title" content="Troop 12">/);
    expect(out).toMatch(/<meta property="og:image" content="https:\/\/troop12\.compass\.app\/cover\.jpg">/);
    expect(out).toMatch(/<meta name="twitter:card" content="summary_large_image">/);
  });

  it("falls back to summary card when no image is provided", () => {
    const out = metaTags({ title: "X", description: "Y", url: "https://x" });
    expect(out).toMatch(/<meta name="twitter:card" content="summary">/);
    expect(out).not.toMatch(/og:image/);
  });

  it("escapes HTML in title + description (XSS through unit names)", () => {
    const out = metaTags({
      title: 'Troop "12" <script>alert(1)</script>',
      description: "Test",
    });
    expect(out).not.toMatch(/<script>alert\(1\)<\/script>/);
    expect(out).toMatch(/Troop &quot;12&quot;/);
  });
});

describe("organizationJsonLd", () => {
  it("emits a schema.org Organization with address + parent", () => {
    const html = organizationJsonLd({
      org: {
        displayName: "Troop 12",
        tagline: "Anytown's troop",
        city: "Anytown",
        state: "ST",
        founded: "1972",
        charterOrg: "St. Mark's",
      },
      url: "https://troop12.compass.app/",
    });
    expect(html).toMatch(/^<script type="application\/ld\+json">/);
    const m = html.match(/<script[^>]*>(.*)<\/script>/);
    const data = JSON.parse(m[1]);
    expect(data["@type"]).toBe("Organization");
    expect(data.name).toBe("Troop 12");
    expect(data.address.addressLocality).toBe("Anytown");
    expect(data.parentOrganization.name).toBe("St. Mark's");
  });

  it("strips undefined fields so validators don't choke", () => {
    const html = organizationJsonLd({
      org: { displayName: "Troop 12" },
      url: "https://troop12.compass.app/",
    });
    const data = JSON.parse(html.match(/<script[^>]*>(.*)<\/script>/)[1]);
    expect(data.address).toBeUndefined();
    expect(data.parentOrganization).toBeUndefined();
  });
});

describe("eventJsonLd", () => {
  it("emits a schema.org Event with start/end dates and location", () => {
    const html = eventJsonLd({
      event: {
        title: "Spring Camporee",
        description: "Annual",
        startsAt: new Date("2026-05-15T14:00:00Z"),
        endsAt: new Date("2026-05-17T15:00:00Z"),
        location: "Tomahawk Scout Reservation",
        locationAddress: "1234 Tomahawk Rd, WI",
      },
      org: { displayName: "Troop 12" },
      url: "https://troop12.compass.app/events/abc",
    });
    const data = JSON.parse(html.match(/<script[^>]*>(.*)<\/script>/)[1]);
    expect(data["@type"]).toBe("Event");
    expect(data.startDate).toBe("2026-05-15T14:00:00.000Z");
    expect(data.location.address).toBe("1234 Tomahawk Rd, WI");
    expect(data.organizer.name).toBe("Troop 12");
  });

  it("emits offline attendance mode (Compass events are in-person by default)", () => {
    const html = eventJsonLd({
      event: { title: "X", startsAt: new Date() },
      org: { displayName: "Troop 12" },
      url: "https://x",
    });
    const data = JSON.parse(html.match(/<script[^>]*>(.*)<\/script>/)[1]);
    expect(data.eventAttendanceMode).toBe("https://schema.org/OfflineEventAttendanceMode");
  });
});

describe("buildSitemap", () => {
  it("emits a valid urlset with one entry per input", () => {
    const xml = buildSitemap([
      { loc: "https://troop12.compass.app/", changefreq: "weekly", priority: 1 },
      {
        loc: "https://troop12.compass.app/events/abc",
        lastmod: new Date("2026-04-30T12:00:00Z"),
        changefreq: "weekly",
      },
    ]);
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(xml).toMatch(/<urlset/);
    expect(xml).toMatch(/<loc>https:\/\/troop12\.compass\.app\/<\/loc>/);
    expect(xml).toMatch(/<lastmod>2026-04-30T12:00:00\.000Z<\/lastmod>/);
    expect(xml).toMatch(/<\/urlset>/);
  });

  it("escapes XML special characters in URLs (& becomes &amp;)", () => {
    const xml = buildSitemap([{ loc: "https://x.com/?a=1&b=2" }]);
    expect(xml).toMatch(/<loc>https:\/\/x\.com\/\?a=1&amp;b=2<\/loc>/);
  });
});

describe("robotsTxt", () => {
  it("apex variant allows everything + points at sitemap", () => {
    const out = robotsTxt({ sitemapUrl: "https://compass.app/sitemap.xml" });
    expect(out).toMatch(/^User-agent: \*\nAllow: \/\nSitemap: https:\/\/compass\.app\/sitemap\.xml\n$/);
  });

  it("org variant disallows /admin and /login", () => {
    const out = robotsTxt({
      disallow: ["/admin", "/login"],
      sitemapUrl: "https://troop12.compass.app/sitemap.xml",
    });
    expect(out).toMatch(/Disallow: \/admin/);
    expect(out).toMatch(/Disallow: \/login/);
    expect(out).not.toMatch(/Allow: \//);
  });
});
