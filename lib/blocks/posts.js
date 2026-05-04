// Live block: latest activity-feed posts.
//
// Pulls the most recent N public posts and renders them in a compact
// or excerpt layout. Auto-updates as posts are added in /admin/posts.

const LAYOUTS = ["compact", "excerpt"];

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function snippet(body, max = 180) {
  if (!body) return "";
  const flat = String(body).replace(/[#*`>_\[\]\(\)]/g, "").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

export const postsBlock = {
  type: "posts",
  label: "Latest posts",
  description: "Recent activity-feed posts; auto-updates as you publish.",
  defaults: { limit: 4, layout: "excerpt" },

  normalise(input) {
    return {
      limit: clampInt(input.limit, 1, 12, 4),
      layout: LAYOUTS.includes(input.layout) ? input.layout : "excerpt",
    };
  },

  async fetch({ orgId, config, prisma }) {
    const posts = await prisma.post.findMany({
      where: {
        orgId,
        visibility: "public",
        publishedAt: { lte: new Date() },
      },
      orderBy: { publishedAt: "desc" },
      take: config.limit || 4,
      select: {
        id: true,
        title: true,
        body: true,
        publishedAt: true,
        photos: {
          orderBy: { sortOrder: "asc" },
          take: 1,
          select: { filename: true },
        },
      },
    });
    return { posts };
  },

  render({ data, config, escapeHtml }) {
    const posts = data?.posts || [];
    const layout = LAYOUTS.includes(config.layout) ? config.layout : "excerpt";

    if (!posts.length) {
      return `
    <section class="section cms-block cms-block--posts">
      <div class="wrap">
        <h2>Latest from the troop</h2>
        <p class="cms-empty">No posts yet — check back after the next adventure.</p>
      </div>
    </section>`;
    }

    const fmt = (d) =>
      new Date(d).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

    const items = posts
      .map((p) => {
        const cover = p.photos?.[0]?.filename;
        const date = fmt(p.publishedAt);
        if (layout === "compact") {
          return `
        <li class="cms-post-row">
          <a href="/posts/${escapeHtml(p.id)}" class="cms-post-row__title">${escapeHtml(p.title)}</a>
          <span class="cms-post-row__date">${escapeHtml(date)}</span>
        </li>`;
        }
        // excerpt
        return `
        <article class="cms-post-card">
          ${
            cover
              ? `<a href="/posts/${escapeHtml(p.id)}" class="cms-post-card__cover">
              <img src="/uploads/${escapeHtml(cover)}" alt="" loading="lazy">
            </a>`
              : ""
          }
          <div class="cms-post-card__body">
            <div class="cms-post-card__date">${escapeHtml(date)}</div>
            <h3 class="cms-post-card__title"><a href="/posts/${escapeHtml(p.id)}">${escapeHtml(p.title)}</a></h3>
            <p class="cms-post-card__snippet">${escapeHtml(snippet(p.body))}</p>
          </div>
        </article>`;
      })
      .join("");

    if (layout === "compact") {
      return `
    <section class="section cms-block cms-block--posts cms-block--posts-compact">
      <div class="wrap">
        <h2>Latest from the troop</h2>
        <ul class="cms-post-list">${items}</ul>
        <p class="cms-block__more"><a href="/posts">All posts →</a></p>
      </div>
      ${postsStyles()}
    </section>`;
    }

    return `
    <section class="section cms-block cms-block--posts cms-block--posts-excerpt">
      <div class="wrap">
        <h2>Latest from the troop</h2>
        <div class="cms-post-cards">${items}</div>
        <p class="cms-block__more"><a href="/posts">All posts →</a></p>
      </div>
      ${postsStyles()}
    </section>`;
  },
};

function postsStyles() {
  return `<style>
    .cms-block--posts .wrap { max-width: 1000px; }
    .cms-post-list { list-style: none; padding: 0; margin: 1rem 0 0; }
    .cms-post-row { display: flex; justify-content: space-between; align-items: baseline; padding: .65rem 0; border-top: 1px solid var(--line, #e5e7eb); gap: 1rem; }
    .cms-post-row:first-child { border-top: 0; }
    .cms-post-row__title { color: var(--primary, #1d6b39); text-decoration: none; font-weight: 500; }
    .cms-post-row__title:hover { text-decoration: underline; }
    .cms-post-row__date { color: var(--ink-500, #6b7280); font-size: .85rem; white-space: nowrap; }
    .cms-post-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.25rem; margin-top: 1rem; }
    .cms-post-card { background: var(--surface, #fff); border: 1px solid var(--line, #e5e7eb); border-radius: 12px; overflow: hidden; }
    .cms-post-card__cover img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; }
    .cms-post-card__body { padding: 1rem 1.1rem 1.2rem; }
    .cms-post-card__date { font-size: .75rem; color: var(--ink-500, #6b7280); text-transform: uppercase; letter-spacing: .05em; }
    .cms-post-card__title { margin: .35rem 0 .5rem; font-size: 1.15rem; }
    .cms-post-card__title a { color: var(--ink-900, #111); text-decoration: none; }
    .cms-post-card__title a:hover { text-decoration: underline; }
    .cms-post-card__snippet { color: var(--ink-700, #374151); font-size: .92rem; line-height: 1.5; margin: 0; }
  </style>`;
}
