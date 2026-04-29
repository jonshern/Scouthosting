// Scoutbook deep-link helpers. Scoutbook is the official BSA advancement
// system; we don't store advancement data, but we surface a per-Scout
// deep link from member profiles, the Eagle list, and other dashboards
// so leaders can jump straight from Scouthosting into the matching
// Scoutbook record.
//
// The URL format is the public profile path. It still requires the
// viewer to be signed in to Scoutbook, but once authenticated the link
// resolves to the right Scout — without it, you land on the dashboard
// and have to search.

const PROFILE_BASE =
  "https://scoutbook.scouting.org/mobile/dashboard/admin/scoutprofile.asp";

const FALLBACK = "https://scoutbook.scouting.org/";

/**
 * Build a deep link for a given Scoutbook user ID. Returns the fallback
 * dashboard URL if the id is missing — callers can render the link
 * unconditionally without a null guard.
 */
export function scoutbookUrl(scoutbookUserId) {
  if (!scoutbookUserId) return FALLBACK;
  const id = String(scoutbookUserId).trim();
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return FALLBACK;
  return `${PROFILE_BASE}?ScoutUserID=${encodeURIComponent(id)}`;
}

export function hasScoutbookId(scoutbookUserId) {
  return Boolean(
    scoutbookUserId && /^[A-Za-z0-9_-]{1,40}$/.test(String(scoutbookUserId).trim()),
  );
}
