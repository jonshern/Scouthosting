// Activity feed — recent posts from the unit, with optimistic
// like/bookmark toggles.

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../state/AuthContext";
import {
  fetchPosts,
  togglePostReaction,
  type FeedPost,
  type PostReactionSummary,
} from "../api/posts";
import { fontFamilies, palette, radius, spacing } from "../theme/tokens";

function uploadsUrl(orgSlug: string, filename: string): string {
  // Apex domain mirrors the server config; the mobile app is
  // pre-configured to talk to <slug>.compass.app.
  // We re-use the same hostForOrg via the auth session base URL is the
  // simplest path — but for image rendering we just need the absolute
  // URL. Fall back to a relative one if anything's missing.
  return `https://${orgSlug}.compass.app/uploads/${encodeURIComponent(filename)}`;
}

export default function ActivityScreen() {
  const auth = useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!auth.session) return;
    setError(null);
    try {
      const res = await fetchPosts(
        { orgSlug: auth.session.orgSlug, token: auth.session.token },
        auth.session.orgId,
      );
      setPosts(res.posts);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't load activity.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [auth.session]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  // Optimistic toggle: flip the local count + youLiked first, then
  // hit the API. Roll back on error.
  const onToggle = useCallback(
    async (post: FeedPost, kind: "like" | "bookmark") => {
      if (!auth.session) return;
      const prev = post.reactions;
      const next = optimistic(prev, kind);
      setPosts((cur) => cur.map((p) => (p.id === post.id ? { ...p, reactions: next } : p)));
      try {
        const result = await togglePostReaction(
          { orgSlug: auth.session.orgSlug, token: auth.session.token },
          post.id,
          kind,
        );
        // The server returns the canonical roll-up; trust it over the
        // optimistic state.
        setPosts((cur) =>
          cur.map((p) =>
            p.id === post.id ? { ...p, reactions: stripPostId(result) } : p,
          ),
        );
      } catch {
        // Revert on failure.
        setPosts((cur) => cur.map((p) => (p.id === post.id ? { ...p, reactions: prev } : p)));
      }
    },
    [auth.session],
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Activity</Text>
        <Text style={styles.sub}>What's happening in the unit.</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading && posts.length === 0 ? (
          <View style={styles.center}><ActivityIndicator color={palette.primary} /></View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
            <Pressable style={styles.retry} onPress={load}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : posts.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.empty}>No posts yet.</Text>
          </View>
        ) : (
          posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              orgSlug={auth.session?.orgSlug || ""}
              onToggle={onToggle}
            />
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function PostCard({
  post,
  orgSlug,
  onToggle,
}: {
  post: FeedPost;
  orgSlug: string;
  onToggle: (post: FeedPost, kind: "like" | "bookmark") => void;
}) {
  const date = new Date(post.publishedAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const r = post.reactions;
  return (
    <View style={styles.card}>
      {post.pinned && (
        <View style={styles.pinBadge}>
          <Text style={styles.pinBadgeText}>PINNED</Text>
        </View>
      )}
      {post.title && <Text style={styles.cardTitle}>{post.title}</Text>}
      <Text style={styles.cardBody}>{post.body}</Text>
      {post.photos.length > 0 && (
        <View style={styles.photoGrid}>
          {post.photos.slice(0, 4).map((ph) => (
            <Image
              key={ph.filename}
              source={{ uri: uploadsUrl(orgSlug, ph.filename) }}
              style={styles.photo}
              resizeMode="cover"
            />
          ))}
        </View>
      )}
      <View style={styles.cardActions}>
        <Pressable
          onPress={() => onToggle(post, "like")}
          style={[styles.reactionBtn, r.youLiked && styles.reactionBtnOn]}
        >
          <Text style={styles.reactionBtnText}>👏 {r.likes || ""}</Text>
        </Pressable>
        <Pressable
          onPress={() => onToggle(post, "bookmark")}
          style={[styles.reactionBtn, r.youBookmarked && styles.reactionBtnOn]}
        >
          <Text style={styles.reactionBtnText}>{r.youBookmarked ? "🔖 Saved" : "🏷️ Save"}</Text>
        </Pressable>
        <Text style={styles.cardMeta}>
          {date}{post.author ? ` · ${post.author}` : ""}
        </Text>
      </View>
    </View>
  );
}

function optimistic(current: PostReactionSummary, kind: "like" | "bookmark"): PostReactionSummary {
  if (kind === "like") {
    const youLiked = !current.youLiked;
    return {
      ...current,
      youLiked,
      likes: Math.max(0, current.likes + (youLiked ? 1 : -1)),
    };
  }
  const youBookmarked = !current.youBookmarked;
  return {
    ...current,
    youBookmarked,
    bookmarks: Math.max(0, current.bookmarks + (youBookmarked ? 1 : -1)),
  };
}

function stripPostId<T extends { postId?: string }>(obj: T): Omit<T, "postId"> & PostReactionSummary {
  const { postId: _ignore, ...rest } = obj;
  return rest as Omit<T, "postId"> & PostReactionSummary;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  header: {
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
  },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: 32,
    color: palette.ink,
    letterSpacing: -0.6,
  },
  sub: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkMuted,
    fontWeight: "600",
    letterSpacing: 0.4,
    marginTop: 2,
  },
  list: {
    padding: spacing.screen,
    minHeight: "100%",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  empty: { fontFamily: fontFamilies.ui, color: palette.inkMuted, fontSize: 14 },
  error: { fontFamily: fontFamilies.ui, color: palette.danger, fontSize: 14 },
  retry: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: palette.primary,
  },
  retryText: { fontFamily: fontFamilies.ui, color: palette.primary, fontWeight: "600" },
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.cardLg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    position: "relative",
  },
  pinBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: palette.accent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pinBadgeText: {
    fontFamily: fontFamilies.ui,
    fontSize: 9,
    fontWeight: "700",
    color: palette.ink,
    letterSpacing: 0.6,
  },
  cardTitle: {
    fontFamily: fontFamilies.display,
    fontSize: 22,
    color: palette.ink,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  cardBody: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    lineHeight: 20,
    color: palette.ink,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 12,
  },
  photo: {
    flex: 1,
    minWidth: "48%",
    aspectRatio: 1,
    borderRadius: radius.input,
    backgroundColor: palette.line,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: spacing.md,
    flexWrap: "wrap",
  },
  reactionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: palette.line,
    backgroundColor: palette.bg,
  },
  reactionBtnOn: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  reactionBtnText: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.ink,
    fontWeight: "600",
  },
  cardMeta: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    marginLeft: "auto",
  },
});
