// The saved copy that lets Compass open with no signal.
//
// Every successful GET to /api/v1 is saved on the phone. When a later GET can't reach the server
// at all (airplane mode, Tailscale off, the Mac asleep), apiRequest returns the saved answer instead
// and marks the app offline, and the OfflineBanner says what time that copy is from. Writes (RSVPs,
// posts, uploads) are never faked: they fail as before and the screen shows its usual error.
//
// Only "couldn't reach the server" falls back. A 401, 403 or 404 is the server's real answer and is
// passed through, so a revoked sign-in still signs out. The copy is wiped on sign-out.

export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type SavedAnswer = { body: unknown; savedAt: number };
export type OfflineStatus = { offline: boolean; savedAt: number | null };

const PREFIX = "compass.offline.";
const INDEX = `${PREFIX}index`;
/** Biggest single answer kept (characters of JSON). Bigger ones (a huge chat history) aren't saved. */
export const MAX_ENTRY = 400_000;
/** How many answers are kept; the oldest go first. */
export const MAX_ENTRIES = 200;

export function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    async getItem(k) { return m.has(k) ? m.get(k)! : null; },
    async setItem(k, v) { m.set(k, v); },
    async removeItem(k) { m.delete(k); },
  };
}

function defaultStore(): KeyValueStore {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@react-native-async-storage/async-storage");
    return (mod.default ?? mod) as KeyValueStore;
  } catch {
    return memoryStore();
  }
}

let store: KeyValueStore | null = null;
const getStore = () => (store ??= defaultStore());
/** For tests. */
export function setOfflineStore(s: KeyValueStore) { store = s; }

let status: OfflineStatus = { offline: false, savedAt: null };
const listeners = new Set<(s: OfflineStatus) => void>();
export function offlineStatus(): OfflineStatus { return status; }
export function onOfflineChange(fn: (s: OfflineStatus) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
function setStatus(next: OfflineStatus) {
  if (next.offline === status.offline && next.savedAt === status.savedAt) return;
  status = next;
  for (const fn of listeners) fn(status);
}
/** A request reached the server. */
export function markOnline() { setStatus({ offline: false, savedAt: null }); }
/** A request fell back to a copy saved at `savedAt` (or found none). Shows the oldest copy in use. */
export function markOffline(savedAt: number | null) {
  const oldest = status.offline && status.savedAt !== null && savedAt !== null ? Math.min(status.savedAt, savedAt) : savedAt ?? status.savedAt;
  setStatus({ offline: true, savedAt: oldest });
}

/** What the banner says (components/OfflineBanner.tsx). */
export function offlineMessage(s: OfflineStatus, now = new Date()): string | null {
  if (!s.offline) return null;
  if (s.savedAt === null) return "Offline. Nothing saved for this yet.";
  const at = new Date(s.savedAt);
  const sameDay = at.toDateString() === now.toDateString();
  const time = at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const when = sameDay ? time : `${at.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
  return `Offline. Showing what was saved at ${when}.`;
}

/** fetch() threw: no answer from the server at all, as opposed to an error status. */
export function isUnreachable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: string }).name;
  if (name === "AbortError") return false; // the screen cancelled it
  return name === "TypeError" || /network|fetch|internet|offline|timed out/i.test(String((err as { message?: string }).message));
}

async function readIndex(s: KeyValueStore): Promise<Record<string, number>> {
  try {
    const raw = await s.getItem(INDEX);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export async function saveAnswer(url: string, body: unknown, now = Date.now()): Promise<void> {
  const s = getStore();
  try {
    const json = JSON.stringify({ body, savedAt: now } satisfies SavedAnswer);
    if (json.length > MAX_ENTRY) return;
    await s.setItem(PREFIX + url, json);
    const index = await readIndex(s);
    index[url] = now;
    const keys = Object.keys(index).sort((a, b) => index[a]! - index[b]!);
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) {
      delete index[old];
      await s.removeItem(PREFIX + old);
    }
    await s.setItem(INDEX, JSON.stringify(index));
  } catch {
    // A full disk or a broken store only costs the offline copy.
  }
}

export async function savedAnswer(url: string): Promise<SavedAnswer | null> {
  try {
    const raw = await getStore().getItem(PREFIX + url);
    return raw ? (JSON.parse(raw) as SavedAnswer) : null;
  } catch {
    return null;
  }
}

/** Sign-out: nothing from this account stays on the phone. */
export async function clearSaved(): Promise<void> {
  const s = getStore();
  const index = await readIndex(s);
  for (const url of Object.keys(index)) await s.removeItem(PREFIX + url).catch(() => {});
  await s.removeItem(INDEX).catch(() => {});
  markOnline();
}
