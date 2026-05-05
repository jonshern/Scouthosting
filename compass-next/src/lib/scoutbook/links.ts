// Scoutbook deep-link helpers. Scoutbook is the official BSA advancement
// system; we don't store advancement data, but we surface a per-Scout
// deep link so leaders can jump straight from Compass into the matching
// Scoutbook record.

const PROFILE_BASE =
  "https://scoutbook.scouting.org/mobile/dashboard/admin/scoutprofile.asp";
const FALLBACK = "https://scoutbook.scouting.org/";
const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

export function scoutbookUrl(scoutbookUserId: string | null | undefined): string {
  if (!scoutbookUserId) return FALLBACK;
  const id = String(scoutbookUserId).trim();
  if (!ID_PATTERN.test(id)) return FALLBACK;
  return `${PROFILE_BASE}?ScoutUserID=${encodeURIComponent(id)}`;
}

export function hasScoutbookId(scoutbookUserId: string | null | undefined): boolean {
  return Boolean(scoutbookUserId && ID_PATTERN.test(String(scoutbookUserId).trim()));
}
