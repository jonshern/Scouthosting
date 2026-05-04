// Live block: photo feed pulled from the org's public albums.
//
// Three modes:
//   - "latest": newest photos across all public albums (default)
//   - "album":  one specific album (config.albumSlug)
//   - "all":    same as latest but no per-album cap
//
// Layouts: grid (default), masonry, carousel, single-feature.
// Updates as photos are added/removed via /admin/albums.

const LAYOUTS = ["grid", "masonry", "carousel", "feature"];
const MODES = ["latest", "album", "all"];

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export const photosBlock = {
  type: "photos",
  label: "Photo feed",
  description: "Auto-updating gallery from your album photos.",
  defaults: { mode: "latest", limit: 8, layout: "grid", albumSlug: "" },

  normalise(input) {
    return {
      mode: MODES.includes(input.mode) ? input.mode : "latest",
      limit: clampInt(input.limit, 1, 24, 8),
      layout: LAYOUTS.includes(input.layout) ? input.layout : "grid",
      albumSlug: String(input.albumSlug || "").trim().slice(0, 80),
    };
  },

  async fetch({ orgId, config, prisma }) {
    const limit = config.limit || 8;
    const mode = MODES.includes(config.mode) ? config.mode : "latest";

    if (mode === "album" && config.albumSlug) {
      const album = await prisma.album.findUnique({
        where: { orgId_slug: { orgId, slug: config.albumSlug } },
        include: {
          photos: {
            orderBy: { sortOrder: "asc" },
            take: limit,
            select: { id: true, filename: true, caption: true, mimeType: true },
          },
        },
      });
      return { photos: album?.photos || [], album };
    }

    // latest / all — pull from any public album
    const photos = await prisma.photo.findMany({
      where: {
        orgId,
        album: { visibility: "public" },
      },
      orderBy: [{ takenAt: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: { id: true, filename: true, caption: true, mimeType: true },
    });
    return { photos, album: null };
  },

  render({ data, config, escapeHtml }) {
    const photos = data?.photos || [];
    const layout = LAYOUTS.includes(config.layout) ? config.layout : "grid";

    if (!photos.length) {
      return `
    <section class="section cms-block cms-block--photos">
      <div class="wrap">
        <h2>Photo gallery</h2>
        <p class="cms-empty">No photos yet — they'll appear here as albums are added.</p>
      </div>
    </section>`;
    }

    const heading = data?.album?.title || "Photo gallery";

    if (layout === "feature") {
      const [first, ...rest] = photos;
      const restHtml = rest
        .slice(0, 4)
        .map((p) => imgTile(p, escapeHtml))
        .join("");
      return `
    <section class="section cms-block cms-block--photos cms-block--photos-feature">
      <div class="wrap">
        <h2>${escapeHtml(heading)}</h2>
        <div class="cms-photos-feature">
          <a href="/uploads/${escapeHtml(first.filename)}" class="cms-photos-feature__main">
            <img src="/uploads/${escapeHtml(first.filename)}" alt="${escapeHtml(first.caption || "")}" loading="lazy">
          </a>
          ${restHtml ? `<div class="cms-photos-feature__rest">${restHtml}</div>` : ""}
        </div>
      </div>
      ${photoStyles()}
    </section>`;
    }

    if (layout === "carousel") {
      const slides = photos
        .map(
          (p) => `
        <li class="cms-photos-carousel__slide">
          <img src="/uploads/${escapeHtml(p.filename)}" alt="${escapeHtml(p.caption || "")}" loading="lazy">
          ${p.caption ? `<figcaption>${escapeHtml(p.caption)}</figcaption>` : ""}
        </li>`,
        )
        .join("");
      return `
    <section class="section cms-block cms-block--photos cms-block--photos-carousel">
      <div class="wrap">
        <h2>${escapeHtml(heading)}</h2>
        <ul class="cms-photos-carousel">${slides}</ul>
      </div>
      ${photoStyles()}
    </section>`;
    }

    // grid / masonry
    const tiles = photos.map((p) => imgTile(p, escapeHtml)).join("");
    const cls = layout === "masonry" ? "cms-photos-grid cms-photos-grid--masonry" : "cms-photos-grid";
    return `
    <section class="section cms-block cms-block--photos">
      <div class="wrap">
        <h2>${escapeHtml(heading)}</h2>
        <div class="${cls}">${tiles}</div>
      </div>
      ${photoStyles()}
    </section>`;
  },
};

function imgTile(p, escapeHtml) {
  return `
    <a href="/uploads/${escapeHtml(p.filename)}" class="cms-photo-tile">
      <img src="/uploads/${escapeHtml(p.filename)}" alt="${escapeHtml(p.caption || "")}" loading="lazy">
    </a>`;
}

function photoStyles() {
  return `<style>
    .cms-block--photos .wrap { max-width: 1100px; }
    .cms-photos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: .6rem; margin-top: 1rem; }
    .cms-photos-grid--masonry { grid-auto-rows: 180px; grid-auto-flow: dense; }
    .cms-photo-tile { display: block; overflow: hidden; border-radius: 8px; aspect-ratio: 1 / 1; background: var(--ink-100, #f3f4f6); }
    .cms-photo-tile img { width: 100%; height: 100%; object-fit: cover; transition: transform 200ms ease-out; }
    .cms-photo-tile:hover img { transform: scale(1.04); }
    .cms-photos-feature { display: grid; grid-template-columns: 2fr 1fr; gap: .6rem; margin-top: 1rem; }
    .cms-photos-feature__main { display: block; border-radius: 12px; overflow: hidden; }
    .cms-photos-feature__main img { width: 100%; height: 100%; object-fit: cover; aspect-ratio: 4 / 3; }
    .cms-photos-feature__rest { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; }
    .cms-photos-carousel { display: flex; gap: 1rem; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: .5rem; list-style: none; margin: 1rem 0 0; }
    .cms-photos-carousel__slide { flex: 0 0 320px; scroll-snap-align: start; }
    .cms-photos-carousel__slide img { width: 100%; height: 220px; object-fit: cover; border-radius: 10px; display: block; }
    .cms-photos-carousel__slide figcaption { font-size: .85rem; color: var(--ink-500, #6b7280); margin-top: .35rem; }
    @media (max-width: 600px) {
      .cms-photos-feature { grid-template-columns: 1fr; }
    }
  </style>`;
}
