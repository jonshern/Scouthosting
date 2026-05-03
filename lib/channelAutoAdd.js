// Channel auto-add rule matcher. Used to compute the dynamic membership
// of a Channel(kind="broadcast") at send time and to render the rule
// summary in admin UIs. Replaces the pre-PR-C4 lib/subgroups.js — the
// match logic is unchanged, just renamed and rehoused.
//
// Rule shape (Channel.autoAddRules JSON):
//   { isYouth?: boolean, patrols?: string[], skills?: string[],
//     interests?: string[], trainings?: string[] }
//
// Inputs to matchAutoAddRules:
//   - rules:    rules object (or {} for "everyone")
//   - members:  Array<Member> with `.skills`, `.interests` already loaded
//   - trainings: optional Map<memberId, Set<courseName-lowercased>> built
//                from non-expired Training rows. If omitted, the
//                trainings filter is treated as always-pass.
// AND across set filters; OR within an array. Empty arrays mean "don't
// filter on this dimension".

function lowerSet(arr) {
  return new Set((arr || []).map((s) => String(s).toLowerCase()));
}

export function matchAutoAddRules(rules, members, currentTrainingsByMember) {
  const r = rules || {};
  const patrols = lowerSet(r.patrols);
  const wantSkills = lowerSet(r.skills);
  const wantInterests = lowerSet(r.interests);
  const wantTrainings = lowerSet(r.trainings);

  return members.filter((m) => {
    if (r.isYouth != null && Boolean(m.isYouth) !== Boolean(r.isYouth)) {
      return false;
    }
    if (patrols.size > 0) {
      if (!m.patrol || !patrols.has(m.patrol.toLowerCase())) return false;
    }
    if (wantSkills.size > 0) {
      const has = (m.skills || []).some((s) => wantSkills.has(s.toLowerCase()));
      if (!has) return false;
    }
    if (wantInterests.size > 0) {
      const has = (m.interests || []).some((s) => wantInterests.has(s.toLowerCase()));
      if (!has) return false;
    }
    if (wantTrainings.size > 0) {
      if (!currentTrainingsByMember) return true; // can't check; skip filter
      const courses = currentTrainingsByMember.get(m.id);
      if (!courses) return false;
      let has = false;
      for (const c of wantTrainings) {
        if (courses.has(c)) {
          has = true;
          break;
        }
      }
      if (!has) return false;
    }
    return true;
  });
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
  return parts.length ? parts.join(" · ") : "everyone";
}
