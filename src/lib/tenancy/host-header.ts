// Request header middleware sets (to the unit's slug) when it rewrote a
// request on the unit's own subdomain or custom domain.
export const TENANT_HOST_HEADER = "x-compass-tenant-host";

// Paths that should NOT be rewritten under a tenant subdomain.
// /o/ — already org-scoped (avoid double-rewrite).
// /login, /signup, /logout — apex marketing pages; reuse them for tenant sign-in.
// /start — self-serve sign-up for a new unit; the marketing header links it.
// /api/events/ — public event sign-ups (addressed by a global slug) and
//   the event staff invite answer (POST /api/events/staff-rsvp).
// /staff-rsvp — the staff invite page; the link may be built on whichever
//   host the leader sent it from.
// /account — the signed-in user's own pages (the admin avatar links here).
// /contact — questions and feedback to the owner, from any unit's site too.
// /api/public/ — the unit home page's live widgets (events, photos,
//   posts), which name the org in the path.
// /mcp, /.well-known/ — the Claude connector and its OAuth discovery
//   documents (src/lib/mcp); not per-org.
// /api/v1/usage — page views from a troop site's own pages (lib/usage).
export const TENANT_PASSTHROUGH_PREFIXES = ["/o/", "/login", "/logout", "/signup", "/start", "/contact", "/api/events/", "/api/public/", "/api/v1/usage", "/staff-rsvp", "/account", "/mcp", "/.well-known/"];
