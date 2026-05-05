// SEO helpers — pure builders for meta tags, structured data, sitemap
// entries. Used by both the apex marketing site and per-org public
// pages so the discovery story is consistent.
//
// Notes for Next.js: most page-level <head> data is now expressed via
// `export const metadata` on the page module; these helpers stay
// useful for JSON-LD structured data (no first-class API in Next),
// for the dynamic sitemap.xml and robots.txt route handlers, and for
// any legacy code paths still emitting <head> strings.

function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

function escapeXml(s: unknown): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export type MetaTagsArgs = {
  title?: string;
  description?: string;
  url?: string;
  image?: string;
  type?: string;
  siteName?: string;
  twitter?: string;
};

export function metaTags({
  title,
  description,
  url,
  image,
  type = "website",
  siteName = "Compass",
  twitter = "@compass_app",
}: MetaTagsArgs): string {
  const t = escapeHtml(title || "");
  const d = escapeHtml(description || "");
  const u = escapeHtml(url || "");
  const lines: string[] = [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}">`,
  ];
  if (url) lines.push(`<link rel="canonical" href="${u}">`);
  lines.push(`<meta property="og:title" content="${t}">`);
  lines.push(`<meta property="og:description" content="${d}">`);
  lines.push(`<meta property="og:type" content="${escapeHtml(type)}">`);
  if (url) lines.push(`<meta property="og:url" content="${u}">`);
  if (siteName) lines.push(`<meta property="og:site_name" content="${escapeHtml(siteName)}">`);
  if (image) {
    lines.push(`<meta property="og:image" content="${escapeHtml(image)}">`);
    lines.push(`<meta property="og:image:alt" content="${t}">`);
  }
  lines.push(
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
  );
  if (twitter) lines.push(`<meta name="twitter:site" content="${escapeHtml(twitter)}">`);
  lines.push(`<meta name="twitter:title" content="${t}">`);
  lines.push(`<meta name="twitter:description" content="${d}">`);
  if (image) lines.push(`<meta name="twitter:image" content="${escapeHtml(image)}">`);
  return lines.join("\n");
}

export type OrgLikeForSeo = {
  displayName: string;
  tagline?: string | null;
  city?: string | null;
  state?: string | null;
  founded?: string | null;
  charterOrg?: string | null;
};

export function organizationJsonLd({ org, url }: { org: OrgLikeForSeo; url: string }): string {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: org.displayName,
    url,
    description: org.tagline || undefined,
    address:
      org.city && org.state
        ? {
            "@type": "PostalAddress",
            addressLocality: org.city,
            addressRegion: org.state,
          }
        : undefined,
    foundingDate: org.founded || undefined,
    parentOrganization: org.charterOrg
      ? { "@type": "Organization", name: org.charterOrg }
      : undefined,
  };
  return jsonLdScript(data);
}

export type EventLikeForSeo = {
  title: string;
  description?: string | null;
  startsAt: Date | string;
  endsAt?: Date | string | null;
  location?: string | null;
  locationAddress?: string | null;
};

export function eventJsonLd({
  event,
  org,
  url,
}: {
  event: EventLikeForSeo;
  org: OrgLikeForSeo;
  url: string;
}): string {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.description || undefined,
    startDate: event.startsAt instanceof Date ? event.startsAt.toISOString() : event.startsAt,
    endDate: event.endsAt
      ? event.endsAt instanceof Date
        ? event.endsAt.toISOString()
        : event.endsAt
      : undefined,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: event.locationAddress
      ? {
          "@type": "Place",
          name: event.location || event.locationAddress,
          address: event.locationAddress,
        }
      : event.location
      ? { "@type": "Place", name: event.location }
      : undefined,
    organizer: {
      "@type": "Organization",
      name: org.displayName,
      url,
    },
    url,
  };
  return jsonLdScript(data);
}

export type SitemapEntry = {
  loc: string;
  lastmod?: Date | string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
};

export function buildSitemap(entries: SitemapEntry[]): string {
  const head =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
  const tail = "</urlset>";
  const body = entries
    .map((e) => {
      const lastmod = e.lastmod instanceof Date ? e.lastmod.toISOString() : e.lastmod;
      return [
        "  <url>",
        `    <loc>${escapeXml(e.loc)}</loc>`,
        lastmod ? `    <lastmod>${escapeXml(lastmod)}</lastmod>` : null,
        e.changefreq ? `    <changefreq>${escapeXml(e.changefreq)}</changefreq>` : null,
        e.priority != null ? `    <priority>${escapeXml(String(e.priority))}</priority>` : null,
        "  </url>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
  return `${head}\n${body}\n${tail}\n`;
}

export function robotsTxt({
  sitemapUrl,
  disallow = [],
}: {
  sitemapUrl?: string;
  disallow?: string[];
}): string {
  const lines = ["User-agent: *"];
  if (disallow.length === 0) {
    lines.push("Allow: /");
  } else {
    for (const path of disallow) lines.push(`Disallow: ${path}`);
  }
  if (sitemapUrl) lines.push(`Sitemap: ${sitemapUrl}`);
  return lines.join("\n") + "\n";
}

function jsonLdScript(data: Record<string, unknown>): string {
  // Strip undefined keys — structured-data validators reject those.
  const cleaned = JSON.parse(JSON.stringify(data));
  return `<script type="application/ld+json">${JSON.stringify(cleaned)}</script>`;
}
