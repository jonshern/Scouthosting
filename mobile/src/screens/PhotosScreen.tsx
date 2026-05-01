// Photos screen — fetches /api/v1/orgs/:orgId/photos and renders the
// org's albums as scrollable groups with up to 6 thumbnails each.
// Tap a tile to open the full-size image; tap "+N" to deep-link to
// the album on the public site (which has the full gallery).

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../state/AuthContext";
import { fetchAlbums, type AlbumPreview } from "../api/photos";
import { fontFamilies, palette, radius, spacing } from "../theme/tokens";

function uploadsUrl(orgSlug: string, filename: string): string {
  return `https://${orgSlug}.compass.app/uploads/${encodeURIComponent(filename)}`;
}

function albumPath(orgSlug: string, albumId: string): string {
  return `https://${orgSlug}.compass.app/photos/${albumId}`;
}

export default function PhotosScreen() {
  const auth = useAuth();
  const [albums, setAlbums] = useState<AlbumPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!auth.session) return;
    setError(null);
    try {
      const res = await fetchAlbums(
        { orgSlug: auth.session.orgSlug, token: auth.session.token },
        auth.session.orgId,
      );
      setAlbums(res.albums);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't load photos.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [auth.session]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const orgSlug = auth.session?.orgSlug || "";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Photos</Text>
          <Text style={styles.albumCount}>
            {albums.length} album{albums.length === 1 ? "" : "s"}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading && albums.length === 0 ? (
          <View style={styles.center}><ActivityIndicator color={palette.primary} /></View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retry} onPress={load}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : albums.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>No albums yet. Ask a leader to upload.</Text>
          </View>
        ) : (
          albums.map((a) => (
            <View key={a.id} style={{ marginBottom: spacing.xxl }}>
              <Text style={styles.groupTitle}>{a.title}</Text>
              <Text style={styles.groupSub}>
                {a.totalPhotos} photo{a.totalPhotos === 1 ? "" : "s"}
                {a.takenAt ? ` · ${new Date(a.takenAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
                {a.visibility === "members" ? " · members only" : ""}
              </Text>
              <View style={styles.grid}>
                {a.preview.length === 0 ? (
                  <Text style={styles.muted}>No photos in this album yet.</Text>
                ) : (
                  a.preview.map((p, j) => {
                    const isLast = j === a.preview.length - 1;
                    const remaining = a.totalPhotos - a.preview.length;
                    const showOverlay = isLast && remaining > 0;
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => {
                          if (showOverlay) {
                            Linking.openURL(albumPath(orgSlug, a.id));
                          } else {
                            Linking.openURL(uploadsUrl(orgSlug, p.filename));
                          }
                        }}
                        style={styles.tile}
                      >
                        <Image
                          source={{ uri: uploadsUrl(orgSlug, p.filename) }}
                          style={StyleSheet.absoluteFillObject}
                          resizeMode="cover"
                        />
                        {showOverlay && (
                          <View style={styles.moreOverlay}>
                            <Text style={styles.moreText}>+{remaining}</Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })
                )}
              </View>
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
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
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: 32,
    color: palette.ink,
    letterSpacing: -0.6,
  },
  albumCount: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    fontWeight: "600",
    color: palette.inkMuted,
  },
  list: { paddingHorizontal: spacing.screen, paddingTop: spacing.md, minHeight: "100%" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyText: { fontFamily: fontFamilies.ui, color: palette.inkMuted, fontSize: 14 },
  errorText: { fontFamily: fontFamilies.ui, color: palette.danger, fontSize: 14 },
  retry: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: palette.primary,
  },
  retryText: { fontFamily: fontFamilies.ui, color: palette.primary, fontWeight: "600" },
  groupTitle: {
    fontFamily: fontFamilies.display,
    fontSize: 22,
    color: palette.ink,
    letterSpacing: -0.3,
  },
  groupSub: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    marginTop: 2,
    marginBottom: 10,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  tile: {
    width: "32.5%",
    aspectRatio: 1,
    overflow: "hidden",
    borderRadius: radius.cardSm,
    backgroundColor: palette.line,
    position: "relative",
  },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(13,19,13,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: {
    fontFamily: fontFamilies.ui,
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
  },
  muted: { fontFamily: fontFamilies.ui, fontSize: 13, color: palette.inkMuted },
});
