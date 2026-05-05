// Channel auto-add rule matcher. Used to compute the dynamic
// membership of a Channel(kind="broadcast") at send time and to
// render the rule summary in admin UIs.
//
// Rule shape (Channel.autoAddRules JSON):
//   {
//     audience?: "members" | "parents-of-youth",  // default "members"
//     isYouth?: boolean,
//     patrols?: string[],
//     skills?: string[],
//     interests?: string[],
//     trainings?: string[],
//   }
//
// `audience: "parents-of-youth"` is the Cub-Scout-friendly mode: cubs
// don't have email addresses, so a "Lion Den" broadcast actually
// needs to reach the *parents* of the Lion cubs. The matcher first
// finds youth via the rule filters and then walks Member.parentIds
// to return the parent Members.
//
// AND across set filters; OR within an array. Empty arrays = "don't
// filter on this dimension".

export type AutoAddRules = {
  audience?: "members" | "parents-of-youth";
  isYouth?: boolean;
  patrols?: string[];
  skills?: string[];
  interests?: string[];
  trainings?: string[];
};

export type MatchableMember = {
  id: string;
  isYouth?: boolean | null;
  patrol?: string | null;
  skills?: string[] | null;
  interests?: string[] | null;
  parentIds?: string[] | null;
};

function lowerSet(arr: string[] | null | undefined): Set<string> {
  return new Set((arr || []).map((s) => String(s).toLowerCase()));
}

function passesFilters(
  m: MatchableMember,
  r: AutoAddRules,
  currentTrainingsByMember?: Map<string, Set<string>>,
): boolean {
  if (r.isYouth != null && Boolean(m.isYouth) !== Boolean(r.isYouth)) return false;
  const patrols = lowerSet(r.patrols);
  if (patrols.size > 0) {
    if (!m.patrol || !patrols.has(m.patrol.toLowerCase())) return false;
  }
  const wantSkills = lowerSet(r.skills);
  if (wantSkills.size > 0) {
    const has = (m.skills || []).some((s) => wantSkills.has(s.toLowerCase()));
    if (!has) return false;
  }
  const wantInterests = lowerSet(r.interests);
  if (wantInterests.size > 0) {
    const has = (m.interests || []).some((s) => wantInterests.has(s.toLowerCase()));
    if (!has) return false;
  }
  const wantTrainings = lowerSet(r.trainings);
  if (wantTrainings.size > 0) {
    if (!currentTrainingsByMember) return true; // can't check; skip filter
    const courses = currentTrainingsByMember.get(m.id);
    if (!courses) return false;
    for (const c of wantTrainings) {
      if (courses.has(c)) return true;
    }
    return false;
  }
  return true;
}

export function matchAutoAddRules<M extends MatchableMember>(
  rules: AutoAddRules | null | undefined,
  members: M[],
  currentTrainingsByMember?: Map<string, Set<string>>,
): M[] {
  const r = rules || {};
  const matched = members.filter((m) => passesFilters(m, r, currentTrainingsByMember));

  if (r.audience === "parents-of-youth") {
    const parentIds = new Set<string>();
    for (const youth of matched) {
      for (const pid of youth.parentIds || []) parentIds.add(pid);
    }
    return members.filter((m) => parentIds.has(m.id));
  }
  return matched;
}

export function buildCurrentTrainingsMap(
  trainings: ReadonlyArray<{ memberId: string; courseName: string; expiresAt?: Date | string | null }>,
  { asOf = new Date() }: { asOf?: Date } = {},
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const t of trainings) {
    if (t.expiresAt && new Date(t.expiresAt) <= asOf) continue;
    let set = out.get(t.memberId);
    if (!set) {
      set = new Set();
      out.set(t.memberId, set);
    }
    set.add(String(t.courseName).toLowerCase());
  }
  return out;
}

export function describeAutoAddRules(rules: AutoAddRules | null | undefined): string {
  const r = rules || {};
  const parts: string[] = [];
  if (r.isYouth === true) parts.push("youth");
  else if (r.isYouth === false) parts.push("adults");
  if (r.patrols?.length) parts.push(`patrol: ${r.patrols.join(" / ")}`);
  if (r.skills?.length) parts.push(`skill: ${r.skills.join(" / ")}`);
  if (r.interests?.length) parts.push(`interest: ${r.interests.join(" / ")}`);
  if (r.trainings?.length) parts.push(`training: ${r.trainings.join(" / ")}`);
  const summary = parts.length ? parts.join(" · ") : "everyone";
  return r.audience === "parents-of-youth" ? `parents of (${summary})` : summary;
}
