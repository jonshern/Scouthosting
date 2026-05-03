// Channel auto-add rule matcher. Used to compute the dynamic membership
// of a Channel(kind="broadcast") at send time and to render the rule
// summary in admin UIs. Replaces the pre-PR-C4 lib/subgroups.js.
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
// don't have email addresses, so a "Lion Den" broadcast actually needs
// to reach the *parents* of the Lion cubs. The matcher first finds
// youth via the rule filters and then walks Member.parentIds to return
// the parent Members. The "members" default keeps current behavior:
// match the rules and return them directly.
//
// Inputs to matchAutoAddRules:
//   - rules:    rules object (or {} for "everyone")
//   - members:  Array<Member> with `.skills`, `.interests`, `.parentIds`
//               already loaded. Pass the FULL org member list — the
//               parents-of-youth path needs to look up parents in here.
//   - trainings: optional Map<memberId, Set<courseName-lowercased>>
//                built from non-expired Training rows. If omitted, the
//                trainings filter is treated as always-pass.
// AND across set filters; OR within an array. Empty arrays mean "don't
// filter on this dimension".

function lowerSet(arr) {
  return new Set((arr || []).map((s) => String(s).toLowerCase()));
}

function passesFilters(m, r, currentTrainingsByMember) {
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

export function matchAutoAddRules(rules, members, currentTrainingsByMember) {
  const r = rules || {};
  const matched = members.filter((m) => passesFilters(m, r, currentTrainingsByMember));

  if (r.audience === "parents-of-youth") {
    // matched is the youth set; walk parentIds to collect the adults
    // they belong to. Dedupe; keep the original member-list ordering
    // for stable broadcast preview lists.
    const parentIds = new Set();
    for (const youth of matched) {
      for (const pid of youth.parentIds || []) parentIds.add(pid);
    }
    return members.filter((m) => parentIds.has(m.id));
  }

  return matched;
}

/**
 * Build a Map<memberId, Set<courseName-lowercased>> of currently-valid
 * training rows. A row is valid if expiresAt is null OR > asOf.
 */
export function buildCurrentTrainingsMap(trainings, { asOf = new Date() } = {}) {
  const out = new Map();
  for (const t of trainings) {
    if (t.expiresAt && new Date(t.expiresAt) <= asOf) continue;
    const k = t.memberId;
    let set = out.get(k);
    if (!set) {
      set = new Set();
      out.set(k, set);
    }
    set.add(String(t.courseName).toLowerCase());
  }
  return out;
}

export function describeAutoAddRules(rules) {
  const r = rules || {};
  const parts = [];
  if (r.isYouth === true) parts.push("youth");
  else if (r.isYouth === false) parts.push("adults");
  if (r.patrols?.length) parts.push(`patrol: ${r.patrols.join(" / ")}`);
  if (r.skills?.length) parts.push(`skill: ${r.skills.join(" / ")}`);
  if (r.interests?.length) parts.push(`interest: ${r.interests.join(" / ")}`);
  if (r.trainings?.length) parts.push(`training: ${r.trainings.join(" / ")}`);
  const summary = parts.length ? parts.join(" · ") : "everyone";
  return r.audience === "parents-of-youth" ? `parents of (${summary})` : summary;
}
