// Derive embed URLs + display data from YouTube / Vimeo links.
// Anything else falls through to "external link" — keeps frame-src
// in CSP narrow.

const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "music.youtube.com",
]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);
const ID_OK = /^[A-Za-z0-9_-]{1,40}$/;

function ytId(u: URL): string | null {
  if (u.host === "youtu.be") return u.pathname.slice(1) || null;
  if (u.pathname === "/watch") return u.searchParams.get("v");
  const m = u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/);
  return m ? m[1] : null;
}

function vimeoId(u: URL): string | null {
  const m = u.pathname.match(/^\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}

export type VideoDescriptor =
  | { kind: "youtube"; id: string; embedUrl: string; watchUrl: string; thumbnailUrl: string }
  | { kind: "vimeo"; id: string; embedUrl: string; watchUrl: string }
  | { kind: "external"; watchUrl: string };

export function parseVideoUrl(input: string | null | undefined): VideoDescriptor | null {
  if (!input || typeof input !== "string") return null;
  let u: URL;
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
