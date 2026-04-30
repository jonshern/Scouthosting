// Server response shapes — mirror server/api.js' serializers. Keep these
// in sync as the API evolves.

export type ChannelKind = "patrol" | "troop" | "parents" | "leaders" | "event" | "custom";

export type ChannelDto = {
  id: string;
  orgId: string;
  kind: ChannelKind;
  name: string;
  patrolName: string | null;
  eventId: string | null;
  isSuspended: boolean;
  suspendedReason: string | null;
  archivedAt: string | null;
  isLeaderOnly: boolean;
  canPost: boolean;
  youAreModerator: boolean;
  updatedAt: string;
};

export type MessageAuthorDto = {
  id: string;
  displayName: string;
};

export type ReactionBucket = {
  emoji: string;
  count: number;
  youReacted: boolean;
};

export type PollOptionDto = {
  id: string;
  label: string;
  count: number;
  youVoted: boolean;
};

export type PollAttachment = {
  kind: "poll";
  question: string;
  options: PollOptionDto[];
  closesAt: string | null;
  allowMulti: boolean;
};

export type MessageAttachment = PollAttachment | null;

export type MessageDto = {
  id: string;
  channelId: string;
  body: string | null;
  deleted: boolean;
  pinned: boolean;
  createdAt: string;
  editedAt: string | null;
  author: MessageAuthorDto | null;
  attachment: MessageAttachment;
  reactions: ReactionBucket[];
};

export type MeDto = {
  user: { id: string; email: string; displayName: string };
  memberships: Array<{
    orgId: string;
    orgName: string;
    orgSlug: string;
    role: string;
  }>;
};

export type ChannelsListResponse = { channels: ChannelDto[] };
export type ChannelDetailResponse = {
  channel: ChannelDto;
  messages: MessageDto[];
  hasMore: boolean;
};
export type MessagesPageResponse = { messages: MessageDto[]; hasMore: boolean };
export type SendMessageResponse = { message: MessageDto };
