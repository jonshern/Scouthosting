// SEO helpers — pure builders for meta tags, structured data, sitemap
// entries. Used by both the apex marketing site and per-org public
// pages so the discovery story is consistent.
//
// Inputs are plain DTOs; outputs are either HTML strings (meta tags
// inserted into <head>) or structured objects (sitemap entries) for
// the route handler to serialise.

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/**
 * Build the standard <head> meta block: title, description,
 * canonical, Open Graph, Twitter card. Pass `image` to surface a
 * preview thumbnail (an absolute URL — relative paths confuse
 * Facebook).
 */
export function metaTags({
  title,
  description,
  url,
  image,
  type = "website",
  siteName = "Compass",
  twitter = "@compass_app",
}) {
  const t = escapeHtml(title || "");
  const d = escapeHtml(description || "");
  const u = escapeHtml(url || "");
  const lines = [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}">`,
  ];
  if (url) lines.push(`<link rel="canonical" href="${u}">`);
  // Open Graph (Facebook, LinkedIn, Slack, iMessage, etc.)
  lines.push(`<meta property="og:title" content="${t}">`);
  lines.push(`<meta property="og:description" content="${d}">`);
  lines.push(`<meta property="og:type" content="${escapeHtml(type)}">`);
  if (url) lines.push(`<meta property="og:url" content="${u}">`);
  if (siteName) lines.push(`<meta property="og:site_name" content="${escapeHtml(siteName)}">`);
  if (image) {
    lines.push(`<meta property="og:image" content="${escapeHtml(image)}">`);
    lines.push(`<meta property="og:image:alt" content="${t}">`);
  }
  // Twitter card
  lines.push(`<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`);
  if (twitter) lines.push(`<meta name="twitter:site" content="${escapeHtml(twitter)}">`);
  lines.push(`<meta name="twitter:title" content="${t}">`);
  lines.push(`<meta name="twitter:description" content="${d}">`);
  if (image) lines.push(`<meta name="twitter:image" content="${escapeHtml(image)}">`);
  return lines.join("\n");
}

/**
 * JSON-LD Organization (or sub-type) for an org's public homepage.
 * Helps Google understand "this is a Scout unit, here's where it
 * meets, here's how to contact." Embedded in a <script type="application/ld+json">.
 */
export function organizationJsonLd({ org, url }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: org.displayName,
    url,
    description: org.tagline || undefined,
    address: org.city && org.state ? {
      "@type": "PostalAddress",
      addressLocality: org.city,
      addressRegion: org.state,
    } : undefined,
    foundingDate: org.founded || undefined,
    parentOrganization: org.charterOrg ? {
      "@type": "Organization",
      name: org.charterOrg,
    } : undefined,
  };
  return jsonLdScript(data);
}

/**
 * JSON-LD Event schema for a single event. Google indexes these and
 * surfaces them in the "Events" carousel for local searches.
 */
export function eventJsonLd({ event, org, url }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.description || undefined,
    startDate: event.startsAt instanceof Date ? event.startsAt.toISOString() : event.startsAt,
    endDate: event.endsAt
      ? event.endsAt instanceof Date ? event.endsAt.toISOString() : event.endsAt
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

/**
 * Build a sitemap.xml document from a list of { loc, lastmod,
 * changefreq, priority } entries. URL-encodes the loc and serialises
 * lastmod as ISO 8601.
 */
export function buildSitemap(entries) {
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

/**
 * Build a robots.txt body. Apex sites allow everything and point at
 * sitemap.xml; org sites disallow /admin and /login (cosmetic — those
 * paths are auth-gated server-side anyway, but keeps them out of the
 * crawl frontier).
 */
export function robotsTxt({ sitemapUrl, disallow = [] }) {
  const lines = ["User-agent: *"];
  if (disallow.length === 0) {
    lines.push("Allow: /");
  } else {
    for (const path of disallow) lines.push(`Disallow: ${path}`);
  }
  if (sitemapUrl) lines.push(`Sitemap: ${sitemapUrl}`);
  return lines.join("\n") + "\n";
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function jsonLdScript(data) {
  // Strip undefined keys so we don't emit `"description": undefined` —
  // structured-data validators reject those.
  const cleaned = JSON.parse(JSON.stringify(data));
  return `<script type="application/ld+json">${JSON.stringify(cleaned)}</script>`;
}
