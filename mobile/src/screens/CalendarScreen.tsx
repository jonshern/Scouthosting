// Calendar screen — fetches the org's upcoming events from
// /api/v1/orgs/:orgId/events and renders them grouped by month with
// category-coloured cards. Filter chips drive a client-side narrowing
// (All / My RSVPs / Outings / Meetings) without re-fetching.
//
// Pull-to-refresh re-fetches the same window. Tapping a row pushes
// onto the EventDetail screen (existing route).

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { fontFamilies, palette, radius, spacing } from "../theme/tokens";
import { useAuth } from "../state/AuthContext";
import {
  fetchEvents,
  type CalendarEvent,
  type EventRsvp,
} from "../api/events";
import type { CalendarStackParamList } from "../navigation/types";

const FILTERS = ["All", "Going", "Outings", "Meetings"] as const;
type Filter = (typeof FILTERS)[number];

type CalendarNav = NativeStackNavigationProp<CalendarStackParamList, "CalendarRoot">;

const MONTH_SHORT = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

// Map the server's semantic colour key to a concrete tokens.palette value.
function paletteFor(key: string): string {
  switch (key) {
    case "accent":     return palette.accent;
    case "sky":        return palette.sky;
    case "ember":      return palette.ember;
    case "raspberry":  return palette.raspberry;
    case "butter":     return palette.butter;
    case "plum":       return palette.plum;
    case "teal":       return palette.teal;
    case "primary":
    default:           return palette.primary;
  }
}

function isOuting(category: string | null): boolean {
  if (!category) return false;
  const k = category.toLowerCase().replace(/[\s_]+/g, "-");
  return [
    "campout",
    "trip",
    "highadventure",
    "service",
    "ceremony",
    "court-of-honor",
    "pinewood",
    "blueandgold",
  ].includes(k);
}

function isMeeting(category: string | null): boolean {
  if (!category) return false;
  const k = category.toLowerCase().replace(/[\s_]+/g, "-");
  return ["meeting", "training"].includes(k);
}

function applyFilter(events: CalendarEvent[], filter: Filter): CalendarEvent[] {
  switch (filter) {
    case "All":      return events;
    case "Going":    return events.filter((e) => e.myRsvp === "yes");
    case "Outings":  return events.filter((e) => isOuting(e.category));
    case "Meetings": return events.filter((e) => isMeeting(e.category));
  }
}

function rsvpBadge(status: EventRsvp | null): { label: string; bg: string; fg: string } | null {
  if (status === "yes") return { label: "Going", bg: palette.accent, fg: palette.ink };
  if (status === "maybe") return { label: "Maybe", bg: palette.butter, fg: palette.ink };
  if (status === "no") return { label: "No", bg: palette.lineSoft, fg: palette.inkMuted };
  return null;
}

export default function CalendarScreen() {
  const auth = useAuth();
  const navigation = useNavigation<CalendarNav>();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [filter, setFilter] = useState<Filter>("All");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!auth.session) return;
    setError(null);
    try {
      const res = await fetchEvents(
        { orgSlug: auth.session.orgSlug, token: auth.session.token },
        auth.session.orgId,
      );
      setEvents(res.events);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't load events.");
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

  const visible = applyFilter(events, filter);

  // Group by month for visual rhythm.
  const groups: Array<{ month: string; items: CalendarEvent[] }> = [];
  for (const e of visible) {
    const d = new Date(e.startsAt);
    const month = `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.items.push(e);
    else groups.push({ month, items: [e] });
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Calendar</Text>
          {events.length > 0 && (
            <Text style={styles.subtitle}>{events.length} upcoming</Text>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {FILTERS.map((f) => {
            const active = filter === f;
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[
                  styles.filterChip,
                  active && { backgroundColor: palette.primary, borderColor: palette.primary },
                ]}
              >
                <Text style={[styles.filterText, active && { color: "#fff" }]}>{f}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading && events.length === 0 ? (
          <View style={styles.empty}><ActivityIndicator color={palette.primary} /></View>
        ) : error ? (
          <View style={styles.empty}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retry} onPress={load}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : groups.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {filter === "All" ? "No upcoming events." : `No events match "${filter}".`}
            </Text>
          </View>
        ) : (
          groups.map((g) => (
            <View key={g.month} style={{ marginBottom: spacing.lg }}>
              <Text style={styles.groupLabel}>{g.month}</Text>
              {g.items.map((e, i) => {
                const d = new Date(e.startsAt);
                const dateLabel = `${d.toLocaleString("en-US", { weekday: "short" })} · ${d.toLocaleString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}`;
                const accentColor = paletteFor(e.color);
                const badge = rsvpBadge(e.myRsvp);
                return (
                  <Pressable
                    key={e.id}
                    onPress={() => navigation.navigate("EventDetail", { eventId: e.id })}
                    style={[
                      styles.eventRow,
                      i < g.items.length - 1 && {
                        borderBottomColor: palette.lineSoft,
                        borderBottomWidth: 1,
                      },
                    ]}
                  >
                    <View style={[styles.dateBlock, { backgroundColor: accentColor }]}>
                      <Text style={styles.dateMonth}>{MONTH_SHORT[d.getMonth()]}</Text>
                      <Text style={styles.dateDay}>{d.getDate()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.eventTitle}>{e.title}</Text>
                      <Text style={styles.eventSub}>
                        {dateLabel}{e.location ? ` · ${e.location}` : ""}
                      </Text>
                      <View style={styles.eventMetaRow}>
                        {e.categoryLabel && (
                          <View style={[styles.catTag, { backgroundColor: accentColor }]}>
                            <Text style={styles.catTagText}>{e.categoryLabel}</Text>
                          </View>
                        )}
                        <Text style={styles.eventMeta}>
                          {e.rsvpYesCount} going{e.capacity ? ` / ${e.capacity}` : ""}
                        </Text>
                      </View>
                    </View>
                    {badge && (
                      <View style={[styles.rsvpBadge, { backgroundColor: badge.bg }]}>
                        <Text style={[styles.rsvpBadgeText, { color: badge.fg }]}>{badge.label}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
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
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: 32,
    color: palette.ink,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    fontWeight: "600",
    color: palette.inkMuted,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
  },
  filterText: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    fontWeight: "700",
    color: palette.inkSoft,
  },
  list: {
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.md,
    minHeight: "100%",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyText: {
    fontFamily: fontFamilies.ui,
    color: palette.inkMuted,
    fontSize: 14,
  },
  errorText: {
    fontFamily: fontFamilies.ui,
    color: palette.danger,
    fontSize: 14,
  },
  retry: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: palette.primary,
  },
  retryText: {
    fontFamily: fontFamilies.ui,
    color: palette.primary,
    fontWeight: "600",
  },
  groupLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: "700",
    color: palette.inkMuted,
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  eventRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  dateBlock: {
    width: 56,
    height: 56,
    borderRadius: radius.input,
    alignItems: "center",
    justifyContent: "center",
  },
  dateMonth: {
    fontFamily: fontFamilies.ui,
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  dateDay: {
    fontFamily: fontFamilies.display,
    color: "#fff",
    fontSize: 22,
    letterSpacing: -0.4,
  },
  eventTitle: {
    fontFamily: fontFamilies.ui,
    fontSize: 15,
    fontWeight: "700",
    color: palette.ink,
  },
  eventSub: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkSoft,
    marginTop: 2,
  },
  eventMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  catTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  catTagText: {
    fontFamily: fontFamilies.ui,
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.4,
  },
  eventMeta: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
  },
  rsvpBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  rsvpBadgeText: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
});
