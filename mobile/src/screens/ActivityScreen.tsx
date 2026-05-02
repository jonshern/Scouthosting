// Activity feed — restructured to the mobile-feed.jsx layout from the
// design handoff. Each post is a card with a typed chip, author row
// (avatar/role/when), an optional photo collage, and a reactions bar
// with overlapping reaction avatars. Filter pills run across the top;
// pinned posts are flagged with a leader-amber badge.

import React, { useCallback, useEffect, useMemo, useState } from "react";
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

import { Avatar, Icon } from "../theme/atoms";
import { useAuth } from "../state/AuthContext";
import {
  fetchPosts,
  togglePostReaction,
  type FeedPost,
  type PostReactionSummary,
} from "../api/posts";
import { fontFamilies, palette, radius, spacing } from "../theme/tokens";

type PostKind = "photo" | "event" | "achievement" | "news" | "poll" | "milestone" | "reminder";

const FILTERS: ReadonlyArray<{ label: string; match: (p: FeedPost, kind: PostKind) => boolean }> = [
  { label: "All", match: () => true },
  { label: "Photos", match: (_, kind) => kind === "photo" },
  { label: "Events", match: (_, kind) => kind === "event" || kind === "reminder" },
  { label: "News", match: (_, kind) => kind === "news" || kind === "milestone" || kind === "achievement" },
];

const KIND_META: Record<PostKind, { label: string; color: string }> = {
  photo: { label: "Photos", color: palette.teal },
  event: { label: "Event", color: palette.accent },
  achievement: { label: "Achievement", color: palette.ember },
  news: { label: "News", color: palette.plum },
  poll: { label: "Poll", color: palette.raspberry },
  milestone: { label: "Milestone", color: palette.butter },
  reminder: { label: "Reminder", color: palette.ember },
};

function uploadsUrl(orgSlug: string, filename: string): string {
  return `https://${orgSlug}.compass.app/uploads/${encodeURIComponent(filename)}`;
}

// Best-effort post-kind classification from the FeedPost shape (the
// server doesn't ship a kind column yet, so we infer from photos +
// pinned + a couple of title keywords).
function classify(post: FeedPost): PostKind {
  if (post.pinned) return "reminder";
  if (post.photos.length > 0) return "photo";
  const t = (post.title || "").toLowerCase();
  if (/(eagle|first class|earned|advancement|rank)/.test(t)) return "achievement";
  if (/(meeting|campout|coh|court of honor|outing|service)/.test(t)) return "event";
  return "news";
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 14) return `${day}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function authorInitials(name: string | null): string {
  return (name || "T")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "T";
}

// Stable-ish avatar tint per author so the reactions stack stays
// consistent between renders.
function authorTint(name: string | null): string {
  const palettes = [palette.plum, palette.teal, palette.accent, palette.ember, palette.raspberry, palette.butter];
  const key = (name || "").length;
  return palettes[key % palettes.length] ?? palette.primary;
}

export default function ActivityScreen() {
  const auth = useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("All");

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
        setPosts((cur) =>
          cur.map((p) => (p.id === post.id ? { ...p, reactions: stripPostId(result) } : p)),
        );
      } catch {
        setPosts((cur) => cur.map((p) => (p.id === post.id ? { ...p, reactions: prev } : p)));
      }
    },
    [auth.session],
  );

  const filtered = useMemo(() => {
    const f = FILTERS.find((x) => x.label === activeFilter) || FILTERS[0]!;
    return posts.filter((p) => f.match(p, classify(p)));
  }, [posts, activeFilter]);

  const orgName = auth.session?.orgName || auth.session?.orgSlug || "";
  const initials = (auth.session?.displayName || auth.session?.email || "U")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "U";

  const hasPinned = filtered.some((p) => p.pinned);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            {orgName ? <Text style={styles.eyebrow}>{orgName}</Text> : null}
            <Text style={styles.title}>Feed</Text>
          </View>
          <View style={styles.headerActions}>
            <View style={styles.iconBtn}>
              <Icon name="bell" size={16} color={palette.ink} strokeWidth={2} />
            </View>
            <Avatar initials={initials} size={36} bg={palette.accent} />
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTERS.map((f) => {
            const active = activeFilter === f.label;
            return (
              <Pressable
                key={f.label}
                onPress={() => setActiveFilter(f.label)}
                style={[styles.filterPill, active && styles.filterPillActive]}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading && posts.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
            <Pressable style={styles.retry} onPress={load}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.empty}>
              {activeFilter === "All" ? "No posts yet." : `Nothing matches "${activeFilter}".`}
            </Text>
          </View>
        ) : (
          <>
            {hasPinned ? (
              <View style={styles.pinnedRow}>
                <Icon name="pin" size={12} color={palette.ember} />
                <Text style={styles.pinnedLabel}>PINNED BY LEADERS</Text>
              </View>
            ) : null}
            {filtered.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                kind={classify(p)}
                orgSlug={auth.session?.orgSlug || ""}
                onToggle={onToggle}
              />
            ))}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function PostCard({
  post,
  kind,
  orgSlug,
  onToggle,
}: {
  post: FeedPost;
  kind: PostKind;
  orgSlug: string;
  onToggle: (post: FeedPost, kind: "like" | "bookmark") => void;
}) {
  const meta = KIND_META[kind];
  const r = post.reactions;
  const tint = authorTint(post.author);
  const initials = authorInitials(post.author);
  const when = relativeTime(post.publishedAt);

  return (
    <View style={styles.card}>
      <View style={styles.authorRow}>
        <Avatar initials={initials} size={36} bg={tint} />
        <View style={{ flex: 1 }}>
          <View style={styles.authorNameLine}>
            <Text style={styles.authorName}>{post.author || "Troop"}</Text>
            {post.pinned ? <Icon name="pin" size={11} color={palette.ember} /> : null}
          </View>
          <Text style={styles.authorMeta}>
            {post.pinned ? `Pinned · ${when}` : when}
          </Text>
        </View>
      </View>

      <View style={[styles.typeChip, { backgroundColor: `${meta.color}22` }]}>
        <View style={[styles.typeDot, { backgroundColor: meta.color }]} />
        <Text style={[styles.typeChipText, { color: meta.color }]}>
          {meta.label.toUpperCase()}
        </Text>
      </View>

      {post.title ? <Text style={styles.cardTitle}>{post.title}</Text> : null}
      {post.body ? <Text style={styles.cardBody}>{post.body}</Text> : null}

      {post.photos.length > 0 ? (
        <PhotoCollage
          photos={post.photos.map((ph) => uploadsUrl(orgSlug, ph.filename))}
        />
      ) : null}

      <View style={styles.reactBar}>
        <View style={styles.reactStack}>
          {buildReactionStack(r).map((re, i) => (
            <View
              key={i}
              style={[
                styles.reactDot,
                { backgroundColor: re.bg, marginLeft: i ? -6 : 0, zIndex: 10 - i },
              ]}
            >
              <Text style={styles.reactDotIcon}>{re.icon}</Text>
            </View>
          ))}
          <Text style={styles.reactCount}>{r.likes + r.bookmarks}</Text>
        </View>
        <View style={styles.reactActions}>
          <Pressable
            onPress={() => onToggle(post, "like")}
            style={styles.reactActionBtn}
          >
            <Text
              style={[
                styles.reactActionText,
                r.youLiked && { color: palette.accent },
              ]}
            >
              {r.youLiked ? "♥ Liked" : "♡ Like"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onToggle(post, "bookmark")}
            style={styles.reactActionBtn}
          >
            <Text
              style={[
                styles.reactActionText,
                r.youBookmarked && { color: palette.accent },
              ]}
            >
              {r.youBookmarked ? "🔖 Saved" : "🏷 Save"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// 1 photo: full bleed; 2: side-by-side; 3+: 1 large + 2 stacked, with
// a "+N" overlay on the fourth tile.
function PhotoCollage({ photos }: { photos: string[] }) {
  const tiles = photos.slice(0, 4);
  const more = Math.max(0, photos.length - 4);
  if (tiles.length === 0) return null;
  if (tiles.length === 1) {
    return (
      <View style={styles.collageWrap}>
        <Image source={{ uri: tiles[0]! }} style={[styles.collageHero, { aspectRatio: 4 / 3 }]} resizeMode="cover" />
      </View>
    );
  }
  if (tiles.length === 2) {
    return (
      <View style={[styles.collageWrap, styles.collageRow]}>
        {tiles.map((u, i) => (
          <Image key={i} source={{ uri: u }} style={styles.collageHalf} resizeMode="cover" />
        ))}
      </View>
    );
  }
  // 3 or 4 tiles — left big, right column with two smaller tiles.
  return (
    <View style={[styles.collageWrap, styles.collageRow]}>
      <Image source={{ uri: tiles[0]! }} style={styles.collageBig} resizeMode="cover" />
      <View style={styles.collageColumn}>
        <Image source={{ uri: tiles[1]! }} style={styles.collageStacked} resizeMode="cover" />
        <View style={{ position: "relative", flex: 1 }}>
          <Image source={{ uri: tiles[2] || tiles[1]! }} style={styles.collageStacked} resizeMode="cover" />
          {more > 0 ? (
            <View style={styles.collageMore}>
              <Text style={styles.collageMoreText}>+{more}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function buildReactionStack(r: PostReactionSummary): Array<{ icon: string; bg: string }> {
  const out: Array<{ icon: string; bg: string }> = [];
  if (r.likes > 0) out.push({ icon: "♥", bg: palette.raspberry });
  if (r.bookmarks > 0) out.push({ icon: "🔖", bg: palette.accent });
  if (out.length === 0) out.push({ icon: "·", bg: palette.lineSoft });
  return out;
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
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  eyebrow: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: "700",
    color: palette.inkMuted,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: 32,
    color: palette.ink,
    letterSpacing: -0.6,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: "center",
    justifyContent: "center",
  },
  filterRow: {
    flexDirection: "row",
    gap: 6,
    paddingRight: spacing.md,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
  },
  filterPillActive: {
    backgroundColor: palette.ink,
    borderColor: palette.ink,
  },
  filterText: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    fontWeight: "600",
    color: palette.inkSoft,
  },
  filterTextActive: { color: "#fff" },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
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
  pinnedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 4,
    paddingBottom: 6,
  },
  pinnedLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 10,
    fontWeight: "700",
    color: palette.ember,
    letterSpacing: 1,
  },
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.cardLg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  authorNameLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  authorName: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    fontWeight: "600",
    color: palette.ink,
  },
  authorMeta: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    marginTop: 1,
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  typeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  typeChipText: {
    fontFamily: fontFamilies.ui,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  cardTitle: {
    fontFamily: fontFamilies.display,
    fontSize: 19,
    color: palette.ink,
    letterSpacing: -0.2,
    lineHeight: 24,
    marginTop: 8,
    marginBottom: 6,
  },
  cardBody: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    lineHeight: 20,
    color: palette.inkSoft,
    marginTop: 4,
  },
  collageWrap: {
    marginTop: 10,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: palette.lineSoft,
  },
  collageRow: { flexDirection: "row", gap: 3 },
  collageHero: { width: "100%", height: undefined },
  collageHalf: { flex: 1, aspectRatio: 1 },
  collageBig: { flex: 1, aspectRatio: 1 },
  collageColumn: { flex: 1, gap: 3 },
  collageStacked: { flex: 1, aspectRatio: 1 },
  collageMore: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15,23,42,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  collageMoreText: {
    color: "#fff",
    fontFamily: fontFamilies.display,
    fontSize: 22,
    fontWeight: "500",
  },
  reactBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: palette.lineSoft,
  },
  reactStack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  reactDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: palette.surface,
  },
  reactDotIcon: {
    color: "#fff",
    fontSize: 11,
    fontFamily: fontFamilies.ui,
    fontWeight: "700",
  },
  reactCount: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkSoft,
    fontWeight: "500",
    marginLeft: 4,
  },
  reactActions: {
    flexDirection: "row",
    gap: 4,
  },
  reactActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  reactActionText: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    fontWeight: "600",
    color: palette.inkSoft,
  },
});
