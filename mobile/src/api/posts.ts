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

/** GET /api/v1/orgs/<id>/posts as the server sends it. */
type FeedPostWire = Omit<FeedPost, "author" | "photos" | "reactions"> & {
  author: { id: string; displayName: string } | string | null;
  photos?: PostPhoto[];
  reactions?: PostReactionSummary;
};

const NO_REACTIONS: PostReactionSummary = { likes: 0, bookmarks: 0, youLiked: false, youBookmarked: false };

export function toFeedPost(p: FeedPostWire): FeedPost {
  return {
    ...p,
    author: typeof p.author === "string" ? p.author : p.author?.displayName ?? null,
    photos: p.photos ?? [],
    reactions: p.reactions ?? NO_REACTIONS,
  };
}

export async function fetchPosts(
  client: ClientOptions,
  orgId: string,
): Promise<{ posts: FeedPost[] }> {
  const res = await apiRequest<{ posts: FeedPostWire[] }>(client, `/orgs/${orgId}/posts`);
  return { posts: res.posts.map(toFeedPost) };
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
