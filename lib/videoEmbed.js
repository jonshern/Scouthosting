// Derive embed URLs + display data from YouTube / Vimeo links.
//
// We accept the common URL shapes:
//   https://www.youtube.com/watch?v=<id>
//   https://youtu.be/<id>
//   https://www.youtube.com/embed/<id>
//   https://vimeo.com/<id>
//   https://player.vimeo.com/video/<id>
//
// Anything else falls through to "external link" — we render the URL
// as a regular outbound <a> rather than embedding random origins.
// This keeps frame-src in CSP narrow.

const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "music.youtube.com"]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

function ytId(u) {
  if (u.host === "youtu.be") return u.pathname.slice(1);
  if (u.pathname === "/watch") return u.searchParams.get("v");
  const m = u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/);
  if (m) return m[1];
  return null;
}

function vimeoId(u) {
  const m = u.pathname.match(/^\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}

const ID_OK = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * Parse a video URL into a structured descriptor:
 *   { kind: "youtube" | "vimeo" | "external", id?, embedUrl?, watchUrl, thumbnailUrl? }
 * Returns null when the URL is unsafe or unparseable.
 */
export function parseVideoUrl(input) {
  if (!input || typeof input !== "string") return null;
  let u;
  try {
    u = new URL(input);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;

  const host = u.host.toLowerCase();
  if (YT_HOSTS.has(host)) {
    const id = ytId(u);
    if (id && ID_OK.test(id)) {
      return {
        kind: "youtube",
        id,
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
        watchUrl: `https://www.youtube.com/watch?v=${id}`,
        thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      };
    }
  }
  if (VIMEO_HOSTS.has(host)) {
    const id = vimeoId(u);
    if (id && ID_OK.test(id)) {
      return {
        kind: "vimeo",
        id,
        embedUrl: `https://player.vimeo.com/video/${id}`,
        watchUrl: `https://vimeo.com/${id}`,
      };
    }
  }
  return { kind: "external", watchUrl: u.toString() };
}
