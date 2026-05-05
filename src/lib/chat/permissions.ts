// Channel post-policy enforcement.
//
// Channels carry a `postPolicy` field controlling who's allowed to
// send a message. This module is the single decision point — every
// code path that creates a Message must go through canPostToChannel().
//
// Adult leaders and org admins always pass. Suspended / archived
// channels always block. The policies decide who else can post:
//
//   "everyone" — any org member
//   "members"  — only ChannelMember rows (default)
//   "section"  — only members whose Member.patrol matches the
//                channel's patrolName (e.g. Wolf Den parents in the
//                Wolf Den channel)
//   "leaders"  — only adult leaders + admins (announcement-only)
//
// Inputs are plain DTOs so the function stays DB-free and unit-testable.

export const POST_POLICIES = ["everyone", "members", "section", "leaders"] as const;
export type PostPolicy = (typeof POST_POLICIES)[number];

export const POST_POLICY_LABELS: Record<PostPolicy, string> = {
  everyone: "Everyone in the unit can post",
  members: "Only channel members can post",
  section: "Only patrol/den members can post",
  leaders: "Only adult leaders can post (announcements)",
};

export type ChannelDto = {
  id?: string;
  postPolicy?: PostPolicy | string | null;
  patrolName?: string | null;
  isSuspended?: boolean | null;
  archivedAt?: Date | string | null;
} | null | undefined;

export type ChatActor = {
  role?: string | null;
  isLeader?: boolean;
  scopes?: Set<string> | { has?: (key: string) => boolean };
  channelMembership?: { role?: "owner" | "member" | string } | null;
  member?: { patrol?: string | null } | null;
};

export type CanPostResult = { ok: true } | { ok: false; reason: string };

export function canPostToChannel(channel: ChannelDto, actor: ChatActor): CanPostResult {
  if (!channel) return { ok: false, reason: "channel-missing" };
  if (channel.archivedAt) return { ok: false, reason: "archived" };
  if (channel.isSuspended) return { ok: false, reason: "suspended" };

  const isAdmin = actor.role === "admin";
  const hasUnitLeaderScope = actor.scopes?.has?.("unit-leader") === true;
  const isLeader =
    isAdmin || actor.role === "leader" || actor.isLeader === true || hasUnitLeaderScope;

  if (isLeader) return { ok: true };

  const isChannelOwner = actor.channelMembership?.role === "owner";
  const policy = (channel.postPolicy || "members") as PostPolicy;

  if (policy === "leaders") {
    if (isChannelOwner) return { ok: true };
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
      // Non-patrol channel set to "section" is misconfigured — fall
      // back to members semantics so we don't open it up by accident.
      if (actor.channelMembership) return { ok: true };
      return { ok: false, reason: "not-in-channel" };
    }
    if (actor.member?.patrol === channel.patrolName) return { ok: true };
    return { ok: false, reason: "not-in-section" };
  }

  return { ok: false, reason: "unknown-policy" };
}

export function normalisePostPolicy(value: string | null | undefined): PostPolicy {
  if (value == null || value === "") return "members";
  if (!(POST_POLICIES as readonly string[]).includes(value)) {
    throw new Error(`Unknown postPolicy: ${value}`);
  }
  return value as PostPolicy;
}
