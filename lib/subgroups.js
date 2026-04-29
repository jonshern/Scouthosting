// Match members against a Subgroup's rules. AND across set filters,
// OR within an array. Empty arrays mean "don't filter on this dimension".
//
// Inputs:
//   - subgroup: { isYouth, patrols, skills, interests, trainings }
//   - members:  Array<Member> with `.skills`, `.interests` already loaded
//   - trainings: optional Map<memberId, Set<courseName-lowercased>> built from
//                non-expired Training rows. If omitted, the trainings filter
//                is treated as always-pass.

function lowerSet(arr) {
  return new Set((arr || []).map((s) => String(s).toLowerCase()));
}

export function matchSubgroup(subgroup, members, currentTrainingsByMember) {
  const patrols = lowerSet(subgroup.patrols);
  const wantSkills = lowerSet(subgroup.skills);
  const wantInterests = lowerSet(subgroup.interests);
  const wantTrainings = lowerSet(subgroup.trainings);

  return members.filter((m) => {
    if (subgroup.isYouth != null && Boolean(m.isYouth) !== Boolean(subgroup.isYouth)) {
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

export function describeSubgroup(s) {
  const parts = [];
  if (s.isYouth === true) parts.push("youth");
  else if (s.isYouth === false) parts.push("adults");
  if (s.patrols?.length) parts.push(`patrol: ${s.patrols.join(" / ")}`);
  if (s.skills?.length) parts.push(`skill: ${s.skills.join(" / ")}`);
  if (s.interests?.length) parts.push(`interest: ${s.interests.join(" / ")}`);
  if (s.trainings?.length) parts.push(`training: ${s.trainings.join(" / ")}`);
  return parts.length ? parts.join(" · ") : "everyone";
}
