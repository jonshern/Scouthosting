// Channel post-policy enforcement.
//
// Channels carry a `postPolicy` field controlling who's allowed to
// send a message. This module is the single decision point — any code
// path that creates a Message goes through canPostToChannel().
//
// Adult leaders and org admins always pass. Suspended / archived
// channels always block. The policies decide who else can post:
//
//   "everyone" — any org member can post (broadcast-style; useful for
//                a "general" troop channel where Scouts can chime in)
//   "members"  — only ChannelMember rows can post (default)
//   "section"  — only members whose Member.patrol matches the
//                channel's patrolName can post (e.g. Wolf Den parents
//                in the Wolf Den channel; the Tiger Den parent can't)
//   "leaders"  — only adult leaders + admins can post (announcement-
//                only; useful for an "announcements" channel that
//                everyone reads but only leaders push to)
//
// Inputs are plain DTOs so the function stays testable without a DB.

export const POST_POLICIES = Object.freeze([
  "everyone",
  "members",
  "section",
  "leaders",
]);

export const POST_POLICY_LABELS = Object.freeze({
  everyone: "Everyone in the unit can post",
  members: "Only channel members can post",
  section: "Only patrol/den members can post",
  leaders: "Only adult leaders can post (announcements)",
});

/**
 * Is the supplied actor allowed to post to this channel?
 *
 * @param {object} channel — { id, postPolicy, patrolName, isSuspended, archivedAt }
 * @param {object} actor — { role, isLeader, channelMembership, member }
 *   role: org membership role ("admin" | "leader" | "scout" | "parent" | etc.)
 *   isLeader: convenience for role ∈ {admin, leader}
 *   channelMembership: ChannelMember row for this user, or null
 *   member: directory Member linked to this user (with .patrol), or null
 * @returns { ok: boolean, reason?: string }
 */
export function canPostToChannel(channel, actor) {
  if (!channel) return { ok: false, reason: "channel-missing" };
  if (channel.archivedAt) return { ok: false, reason: "archived" };
  if (channel.isSuspended) return { ok: false, reason: "suspended" };

  const isAdmin = actor.role === "admin";
  const isLeader = isAdmin || actor.role === "leader" || actor.isLeader === true;

  // Leaders and admins always pass. The post-policy gates who else.
  if (isLeader) return { ok: true };

  const policy = channel.postPolicy || "members";

  if (policy === "leaders") {
    return { ok: false, reason: "leaders-only" };
  }
  if (policy === "everyone") {
    return { ok: true };
  }
  if (policy === "members") {
    if (actor.channelMembership) return { ok: true };
    return { ok: false, reason: "not-in-channel" };
  }
  if (policy === "section") {
    if (!channel.patrolName) {
      // A non-patrol channel set to "section" is misconfigured — fall
      // back to members semantics so we don't accidentally open it up.
      if (actor.channelMembership) return { ok: true };
      return { ok: false, reason: "not-in-channel" };
    }
    if (actor.member?.patrol === channel.patrolName) return { ok: true };
    return { ok: false, reason: "not-in-section" };
  }

  return { ok: false, reason: "unknown-policy" };
}

/**
 * Validate a post-policy string before persisting. Returns the value
 * as-is if it's known, or "members" as a safe default. Throws if the
 * caller supplied a value but it's outside the whitelist — admin-form
 * handlers want loud failure on tampered input.
 */
export function normalisePostPolicy(value) {
  if (value == null || value === "") return "members";
  if (!POST_POLICIES.includes(value)) {
    throw new Error(`Unknown postPolicy: ${value}`);
  }
  return value;
}
