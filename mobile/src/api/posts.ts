// Mobile activity-feed (posts) API client.

import { apiRequest, type ClientOptions } from "./client";

export type PostReactionSummary = {
  likes: number;
  bookmarks: number;
  youLiked: boolean;
  youBookmarked: boolean;
};

export type PostPhoto = {
  filename: string;
  caption: string | null;
};

export type FeedPost = {
  id: string;
  title: string | null;
  body: string;
  pinned: boolean;
  publishedAt: string;
  author: string | null;
  photos: PostPhoto[];
  reactions: PostReactionSummary;
};

export async function fetchPosts(
  client: ClientOptions,
  orgId: string,
): Promise<{ posts: FeedPost[] }> {
  return apiRequest(client, `/orgs/${orgId}/posts`);
}

export async function togglePostReaction(
  client: ClientOptions,
  postId: string,
  kind: "like" | "bookmark",
): Promise<{ postId: string } & PostReactionSummary> {
  return apiRequest(client, `/posts/${postId}/reactions`, {
    method: "POST",
    body: { kind },
  });
}
