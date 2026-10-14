// "How is this scout doing?" as data: current rank, what's left for
// the next one, merit badges earned and in progress, and where the
// scout stands on the Eagle-required list. Pure: the caller loads the
// rows (lib/mcp/scout-data.ts), so the unit tests cover the rules.
//
// Sources, strongest first:
//   - Scoutbook sync (ScoutbookProfile / ScoutbookMeritBadge)
//   - court of honor awards ("First Aid merit badge", "Star rank")
//   - troop requirement progress (RequirementProgress): a rank or badge
//     whose every requirement is signed off counts as earned
//   - the family's Lantern trail (JourneyProgress): a checked step, or a
//     whole rank or badge checked as complete
//
// Status words: signed_off is official; checked is the family's own
// record in Lantern; both count as complete. done means the scout says
// it's done and it waits on a leader or counselor to sign off.

import {
  EAGLE_CHOICE_GROUPS,
  RANK_ORDER,
  badgeKeyForName,
  itemIndex,
  itemName,
  rankKeyForName,
  type Catalog,
  type CatalogItem,
} from "./catalog";

export type Status = "not_started" | "in_progress" | "done" | "signed_off" | "checked";

const complete = (s: Status | undefined) => s === "signed_off" || s === "checked";

export type LanternInput = {
  /** Ranks, badges and custom items on the trail, in order. */
  path: string[];
  /** The family's own items ("custom:<id>"), same shape as catalog items. */
  custom: Record<string, CatalogItem>;
  /** Checked keys (a requirement id, or a whole item) → day checked, or null. */
  checks: Map<string, string | null>;
} | null;

export type ProgressRow = { requirementId: string; status: string; signedOffAt: Date | null; updatedAt: Date };
export type ScoutbookInput = {
  rank: string | null;
  rankAchievedAt: Date | null;
  meritBadges: { badgeName: string; status: string; completedAt: Date | null }[];
} | null;
export type AwardInput = { award: string; category: string | null; at: Date | null };

export type ItemProgress = {
  key: string;
  name: string;
  /** Requirements needed in total ("do 4 of 6" counts as 4). */
  total: number;
  /** Complete: signed off by the troop, or checked in Lantern. */
  completed: number;
  /** Done by the scout, waiting for a sign-off. */
  waiting: number;
  inProgress: number;
  percent: number;
  complete: boolean;
  left: { id: string; text: string; status: Status }[];
};

export type EarnedBadge = {
  key: string;
  name: string;
  eagle: boolean;
  earnedAt: Date | null;
  source: "scoutbook" | "court_of_honor" | "requirements" | "lantern";
};

export type JourneySummary = {
  catalogLoaded: boolean;
  rank: { key: string; name: string; since: Date | null; source: string } | null;
  nextRank: (ItemProgress & { badgeRule?: { needTotal: number; needEagle: number; haveTotal: number; haveEagle: number } }) | null;
  badgesEarned: EarnedBadge[];
  badgesInProgress: (ItemProgress & { eagle: boolean })[];
  eagle: {
    groups: { label: string; options: string[]; earnedWith: string | null; inProgress: string[] }[];
    earned: number;
    total: number;
  } | null;
  /** The Lantern trail, in order, when the family keeps one. */
  trail: { items: { key: string; name: string; complete: boolean; percent: number }[]; next: string | null } | null;
  /** Progress rows the catalog doesn't know (typo'd ids, an older edition). */
  unknownRequirementIds: string[];
};

/** Badge counts the summary-level ranks need (Star, Life, Eagle). */
const BADGE_RULES: Record<string, { total: number; eagle: number | "all" }> = {
  "rank:star": { total: 6, eagle: 4 },
  "rank:life": { total: 11, eagle: 7 },
  "rank:eagle": { total: 21, eagle: "all" },
};

const OPTION_SUFFIX = /-opt([A-Za-z0-9]+)$/;
const isRequirementNumber = (n: string) => /^[0-9][0-9A-Za-z.]*(?:-[0-9A-Za-z.]+)*$/.test(n);

/** Progress of one rank or badge, honouring "do N of these" and option groups. */
export function itemProgress(item: CatalogItem, statusOf: (id: string) => Status | undefined): ItemProgress {
  let total = 0;
  let completed = 0;
  let doneOrSigned = 0;
  let inProgress = 0;
  const left: ItemProgress["left"] = [];

  const st = (id: string): Status => statusOf(id) ?? "not_started";

  for (const r of item.reqs) {
    if (!r.subs.length) {
      if (!isRequirementNumber(r.n)) continue;
      const id = `${item.key}#${r.n}`;
      const s = st(id);
      total += 1;
      if (complete(s)) completed += 1;
      if (complete(s) || s === "done") doneOrSigned += 1;
      if (s === "in_progress") inProgress += 1;
      if (!complete(s)) left.push({ id, text: r.t, status: s });
      continue;
    }

    // Options ("do option A or option B"): the best option group counts.
    const groups = new Map<string, typeof r.subs>();
    for (const sub of r.subs) {
      const opt = OPTION_SUFFIX.exec(sub.id)?.[1] ?? "";
      groups.set(opt, [...(groups.get(opt) ?? []), sub]);
    }
    const common = groups.get("") ?? [];
    groups.delete("");
    const candidates = groups.size ? [...groups.values()].map((g) => [...common, ...g]) : [common];

    let best: { needed: number; signed: number; doneOrSigned: number; inProg: number; subs: typeof r.subs } | null = null;
    for (const subs of candidates) {
      const needed = Math.min(r.choose ?? subs.length, subs.length);
      const statuses = subs.map((s) => st(`${item.key}#${s.id}`));
      const signed = statuses.filter((s) => complete(s)).length;
      const ds = statuses.filter((s) => complete(s) || s === "done").length;
      const inProg = statuses.filter((s) => s === "in_progress").length;
      const score = Math.min(signed, needed) * 2 + Math.min(ds, needed);
      const bestScore = best ? Math.min(best.signed, best.needed) * 2 + Math.min(best.doneOrSigned, best.needed) : -1;
      if (score > bestScore) best = { needed, signed, doneOrSigned: ds, inProg, subs };
    }
    if (!best) continue;
    total += best.needed;
    completed += Math.min(best.signed, best.needed);
    doneOrSigned += Math.min(best.doneOrSigned, best.needed);
    inProgress += Math.min(best.inProg, Math.max(0, best.needed - Math.min(best.doneOrSigned, best.needed)));
    if (best.signed < best.needed) {
      for (const sub of best.subs) {
        const id = `${item.key}#${sub.id}`;
        const s = st(id);
        if (!complete(s)) left.push({ id, text: r.choose ? `${sub.t} (any ${r.choose} of requirement ${r.n})` : sub.t, status: s });
      }
    }
  }

  return {
    key: item.key,
    name: item.name,
    total,
    completed,
    waiting: doneOrSigned - completed,
    inProgress,
    percent: total ? Math.round((completed / total) * 100) : 0,
    complete: total > 0 && completed >= total,
    left,
  };
}

const rankIndex = (key: string) => (RANK_ORDER as readonly string[]).indexOf(key);

const latest = (dates: (Date | null | undefined)[]) => {
  const t = dates.filter((d): d is Date => !!d).map((d) => d.getTime());
  return t.length ? new Date(Math.max(...t)) : null;
};
const day = (s: string | null | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00Z`) : null);

export function summarizeJourney(input: {
  catalog: Catalog | null;
  progress: ProgressRow[];
  scoutbook: ScoutbookInput;
  awards: AwardInput[];
  lantern?: LanternInput;
}): JourneySummary {
  const { catalog } = input;
  const lantern = input.lantern ?? null;
  const idx = itemIndex(catalog);
  for (const c of Object.values(lantern?.custom ?? {})) if (!idx.has(c.key)) idx.set(c.key, c);

  const troopStatus = new Map(input.progress.map((p) => [p.requirementId, p.status as Status]));
  const statusOf = (id: string): Status | undefined => {
    const t = troopStatus.get(id);
    if (t === "signed_off") return t;
    if (lantern?.checks.has(id)) return "checked";
    return t;
  };
  /** When a requirement became complete, from either record. */
  const completedAt = (id: string) =>
    latest([input.progress.find((p) => p.requirementId === id && p.status === "signed_off")?.signedOffAt, day(lantern?.checks.get(id))]);
  const itemCheckedInLantern = (key: string) => !!lantern?.checks.has(key);

  // --- Rank ------------------------------------------------------------
  const rankCandidates: { key: string; since: Date | null; source: string }[] = [];
  if (input.scoutbook?.rank) {
    const k = rankKeyForName(input.scoutbook.rank);
    if (k) rankCandidates.push({ key: k, since: input.scoutbook.rankAchievedAt, source: "scoutbook" });
  }
  for (const a of input.awards) {
    if (!(a.category === "Rank" || /\brank\b/i.test(a.award))) continue;
    const k = rankKeyForName(a.award);
    if (k) rankCandidates.push({ key: k, since: a.at, source: "court_of_honor" });
  }
  for (const key of RANK_ORDER) {
    if (itemCheckedInLantern(key)) {
      rankCandidates.push({ key, since: day(lantern!.checks.get(key)), source: "lantern" });
      continue;
    }
    const r = idx.get(key);
    if (r && itemProgress(r, statusOf).complete) {
      const ids = [...troopStatus.keys(), ...(lantern?.checks.keys() ?? [])].filter((id) => id.startsWith(`${key}#`));
      rankCandidates.push({ key, since: latest(ids.map(completedAt)), source: "requirements" });
    }
  }
  rankCandidates.sort((a, b) => rankIndex(b.key) - rankIndex(a.key));
  const top = rankCandidates[0] ?? null;
  const rank = top ? { key: top.key, name: itemName(top.key, idx), since: top.since, source: top.source } : null;

  // --- Badges ------------------------------------------------------------
  const earned = new Map<string, EarnedBadge>();
  const eagleFlag = (key: string) => !!idx.get(key)?.eagle;
  for (const mb of input.scoutbook?.meritBadges ?? []) {
    if (mb.status !== "completed" && !mb.completedAt) continue;
    const key = badgeKeyForName(mb.badgeName, catalog);
    earned.set(key, { key, name: itemName(key, idx), eagle: eagleFlag(key), earnedAt: mb.completedAt, source: "scoutbook" });
  }
  for (const a of input.awards) {
    if (!(a.category === "Merit Badge" || /merit badge/i.test(a.award))) continue;
    const key = badgeKeyForName(a.award, catalog);
    if (!earned.has(key)) earned.set(key, { key, name: itemName(key, idx), eagle: eagleFlag(key), earnedAt: a.at, source: "court_of_honor" });
  }
  for (const [key, on] of lantern?.checks ?? []) {
    if (key.startsWith("badge:") && !key.includes("#") && !earned.has(key)) {
      earned.set(key, { key, name: itemName(key, idx), eagle: eagleFlag(key), earnedAt: day(on), source: "lantern" });
    }
  }

  const touchedBadges = new Set(
    [...troopStatus.keys(), ...(lantern?.checks.keys() ?? []), ...(lantern?.path ?? [])]
      .filter((id) => id.startsWith("badge:"))
      .map((id) => id.split("#")[0]),
  );
  const inProgress: JourneySummary["badgesInProgress"] = [];
  const unknown: string[] = [];
  for (const key of touchedBadges) {
    if (earned.has(key)) continue;
    const ids = [...troopStatus.keys(), ...(lantern?.checks.keys() ?? [])].filter((id) => id.startsWith(`${key}#`));
    const item = idx.get(key);
    if (!item) {
      if (catalog) unknown.push(...ids);
      if (!ids.length) continue;
      inProgress.push({
        key,
        name: itemName(key, idx),
        eagle: false,
        total: 0,
        completed: ids.filter((id) => complete(statusOf(id))).length,
        waiting: ids.filter((id) => statusOf(id) === "done").length,
        inProgress: ids.filter((id) => statusOf(id) === "in_progress").length,
        percent: 0,
        complete: false,
        left: [],
      });
      continue;
    }
    const p = itemProgress(item, statusOf);
    if (p.complete) {
      earned.set(key, { key, name: item.name, eagle: !!item.eagle, earnedAt: latest(ids.map(completedAt)), source: "requirements" });
    } else if (ids.length) {
      inProgress.push({ ...p, eagle: !!item.eagle });
    }
  }
  // Scoutbook "started" badges with no Compass progress yet.
  for (const mb of input.scoutbook?.meritBadges ?? []) {
    const key = badgeKeyForName(mb.badgeName, catalog);
    if (earned.has(key) || inProgress.some((b) => b.key === key)) continue;
    if (mb.status !== "completed" && !mb.completedAt) {
      inProgress.push({ key, name: itemName(key, idx), eagle: eagleFlag(key), total: 0, completed: 0, waiting: 0, inProgress: 0, percent: 0, complete: false, left: [] });
    }
  }
  inProgress.sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
  const badgesEarned = [...earned.values()].sort((a, b) => a.name.localeCompare(b.name));

  // --- Eagle-required ------------------------------------------------------
  let eagle: JourneySummary["eagle"] = null;
  if (catalog) {
    const required = catalog.badges.filter((b) => b.eagle && !b.retired).map((b) => b.key);
    const grouped = new Set(EAGLE_CHOICE_GROUPS.flat());
    const groups = [
      ...required.filter((k) => !grouped.has(k)).map((k) => [k]),
      ...EAGLE_CHOICE_GROUPS.map((g) => g.filter((k) => required.includes(k))).filter((g) => g.length),
    ];
    const out = groups.map((g) => {
      const names = g.map((k) => itemName(k, idx));
      const hit = g.find((k) => earned.has(k));
      return {
        label: names.join(" or "),
        options: names,
        earnedWith: hit ? itemName(hit, idx) : null,
        inProgress: g.filter((k) => inProgress.some((b) => b.key === k)).map((k) => itemName(k, idx)),
      };
    });
    eagle = { groups: out, earned: out.filter((g) => g.earnedWith).length, total: out.length };
  }

  // --- Next rank -------------------------------------------------------------
  let nextRank: JourneySummary["nextRank"] = null;
  const nextKey = rank ? RANK_ORDER[rankIndex(rank.key) + 1] : RANK_ORDER[0];
  if (nextKey) {
    const item = idx.get(nextKey);
    const base: ItemProgress = item
      ? itemProgress(item, statusOf)
      : { key: nextKey, name: itemName(nextKey, idx), total: 0, completed: 0, waiting: 0, inProgress: 0, percent: 0, complete: false, left: [] };
    const rule = BADGE_RULES[nextKey];
    nextRank = rule
      ? {
          ...base,
          badgeRule: {
            needTotal: rule.total,
            needEagle: rule.eagle === "all" ? (eagle?.total ?? 0) : rule.eagle,
            haveTotal: badgesEarned.length,
            haveEagle: rule.eagle === "all" ? (eagle?.earned ?? 0) : badgesEarned.filter((b) => b.eagle).length,
          },
        }
      : base;
  }

  // --- Lantern trail ---------------------------------------------------------
  let trail: JourneySummary["trail"] = null;
  if (lantern && lantern.path.length) {
    const items = lantern.path.map((key) => {
      const item = idx.get(key);
      const p = item ? itemProgress(item, statusOf) : null;
      const done =
        itemCheckedInLantern(key) ||
        earned.has(key) ||
        (key.startsWith("rank:") && !!rank && rankIndex(key) <= rankIndex(rank.key)) ||
        !!p?.complete;
      return { key, name: itemName(key, idx), complete: done, percent: done ? 100 : (p?.percent ?? 0) };
    });
    trail = { items, next: items.find((i) => !i.complete)?.name ?? null };
  }

  return {
    catalogLoaded: !!catalog,
    rank,
    nextRank,
    badgesEarned,
    badgesInProgress: inProgress,
    eagle,
    trail,
    unknownRequirementIds: unknown,
  };
}

const fmtDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** A short plain-English summary, for "how is Emmett doing?". */
export function describeJourney(name: string, s: JourneySummary): string {
  const lines: string[] = [];
  if (s.rank) {
    const since = fmtDate(s.rank.since);
    lines.push(`${name}'s rank is ${s.rank.name}${since ? ` (since ${since})` : ""}${s.rank.source === "lantern" ? ", as checked off in Lantern" : ""}.`);
  } else {
    lines.push(`Compass has no rank on record for ${name} yet.`);
  }

  const n = s.nextRank;
  if (n) {
    if (n.total) {
      const parts = [`${n.completed} of ${n.total} requirements complete`];
      if (n.waiting) parts.push(`${n.waiting} done and waiting for a sign-off`);
      if (n.inProgress) parts.push(`${n.inProgress} in progress`);
      lines.push(`Toward ${n.name}: ${parts.join(", ")}.`);
    } else {
      lines.push(`Next rank: ${n.name}.`);
    }
    if (n.badgeRule) {
      const r = n.badgeRule;
      lines.push(`${n.name} needs ${r.needTotal} merit badges (${r.needEagle} Eagle-required); ${name} has ${r.haveTotal} (${r.haveEagle} Eagle-required).`);
    }
  }

  lines.push(
    s.badgesEarned.length
      ? `Merit badges earned (${s.badgesEarned.length}): ${s.badgesEarned.map((b) => b.name).join(", ")}.`
      : "No merit badges earned yet.",
  );
  if (s.badgesInProgress.length) {
    lines.push(
      `Working on: ${s.badgesInProgress
        .map((b) => {
          if (b.total) return `${b.name} (${b.percent}%${b.waiting ? `, ${b.waiting} waiting for sign-off` : ""})`;
          const bits = [b.completed && `${b.completed} done`, b.waiting && `${b.waiting} waiting for sign-off`, b.inProgress && `${b.inProgress} in progress`].filter(Boolean);
          return bits.length ? `${b.name} (${bits.join(", ")})` : b.name;
        })
        .join(", ")}.`,
    );
  }
  if (s.eagle) {
    const left = s.eagle.groups.filter((g) => !g.earnedWith).map((g) => g.label);
    lines.push(`Eagle-required: ${s.eagle.earned} of ${s.eagle.total} done${left.length ? `; still to go: ${left.join(", ")}` : ""}.`);
  }
  if (s.trail) {
    const done = s.trail.items.filter((i) => i.complete).length;
    lines.push(`Lantern trail: ${done} of ${s.trail.items.length} steps complete${s.trail.next ? `; next up: ${s.trail.next}` : ""}.`);
  }
  if (!s.catalogLoaded) {
    lines.push("(The requirement catalog isn't loaded on this server, so requirement names and what's left can't be shown.)");
  }
  return lines.join("\n");
}
