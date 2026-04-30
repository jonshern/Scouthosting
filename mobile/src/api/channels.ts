// Thin wrappers around the channel + message endpoints. Each function
// is a one-liner over apiRequest; defining them as named exports keeps
// the screens readable and makes mocking easy in tests.

import { apiRequest, type ClientOptions } from "./client";
import type {
  ChannelsListResponse,
  ChannelDetailResponse,
  MessagesPageResponse,
  SendMessageResponse,
} from "./types";

export function listChannels(opts: ClientOptions, orgId: string): Promise<ChannelsListResponse> {
  return apiRequest<ChannelsListResponse>(opts, "/channels", { query: { orgId } });
}

export function getChannel(opts: ClientOptions, channelId: string): Promise<ChannelDetailResponse> {
  return apiRequest<ChannelDetailResponse>(opts, `/channels/${channelId}`);
}

export function getMessagesPage(
  opts: ClientOptions,
  channelId: string,
  before?: string,
): Promise<MessagesPageResponse> {
  return apiRequest<MessagesPageResponse>(opts, `/channels/${channelId}/messages`, {
    query: { before },
  });
}

export function sendMessage(
  opts: ClientOptions,
  channelId: string,
  body: string,
): Promise<SendMessageResponse> {
  return apiRequest<SendMessageResponse>(opts, `/channels/${channelId}/messages`, {
    method: "POST",
    body: { body },
  });
}
