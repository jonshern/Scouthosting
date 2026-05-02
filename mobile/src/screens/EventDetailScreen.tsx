// Event detail — restructured to the mobile-calendar-v2.jsx layout.
// Replaces the colored full-bleed hero with a clean top bar + a
// category-tinted event card (left-border accent stripe, eyebrow,
// serif title, date line, chip strip with cost / permission slip /
// duration), a separate description section, and a count-inline RSVP
// trio (Going · N / Maybe · N / Can't · N) where the user's current
// pick is filled. Data flow + optimistic update logic unchanged.

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { Icon } from "../theme/atoms";
import { fontFamilies, palette, radius, spacing } from "../theme/tokens";
import { useAuth } from "../state/AuthContext";
import {
  fetchEvent,
  setEventRsvp,
  type EventDetail,
  type EventRsvp,
} from "../api/events";
import type { HomeStackParamList } from "../navigation/types";

type Route = RouteProp<HomeStackParamList, "EventDetail">;
type Nav = NativeStackNavigationProp<HomeStackParamList, "EventDetail">;

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

function formatDateLine(start: Date, end: Date | null, allDay: boolean): string {
  const dateOpts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  };
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };
  const startDate = start.toLocaleDateString("en-US", dateOpts);
  if (allDay) {
    if (!end) return startDate;
    const endDate = end.toLocaleDateString("en-US", dateOpts);
    return startDate === endDate ? startDate : `${startDate} → ${endDate}`;
  }
  const startTime = start.toLocaleTimeString("en-US", timeOpts);
  if (!end) return `${startDate}, ${startTime}`;
  const endDate = end.toLocaleDateString("en-US", dateOpts);
  const endTime = end.toLocaleTimeString("en-US", timeOpts);
  if (startDate === endDate) return `${startDate}, ${startTime} → ${endTime}`;
  return `${startDate}, ${startTime} → ${endDate}, ${endTime}`;
}

function durationLabel(start: Date, end: Date | null, allDay: boolean): string | null {
  if (!end) return null;
  const ms = end.getTime() - start.getTime();
  const days = Math.round(ms / (24 * 3600 * 1000));
  if (allDay && days >= 1) {
    return days === 1 ? "1 day" : `${days} days`;
  }
  if (ms >= 18 * 3600 * 1000) {
    const nights = Math.max(1, Math.round(ms / (24 * 3600 * 1000)));
    return `${nights} night${nights === 1 ? "" : "s"}`;
  }
  const hours = Math.round(ms / (3600 * 1000));
  if (hours >= 1) return `${hours}h`;
  return null;
}

export default function EventDetailScreen() {
  const auth = useAuth();
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const eventId = route.params?.eventId;

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<EventRsvp | null>(null);

  const load = useCallback(async () => {
    if (!auth.session || !eventId) return;
    setError(null);
    try {
      const res = await fetchEvent(
        { orgSlug: auth.session.orgSlug, token: auth.session.token },
        eventId,
      );
      setEvent(res.event);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't load this event.");
    } finally {
      setLoading(false);
    }
  }, [auth.session, eventId]);

  useEffect(() => { load(); }, [load]);

  const onRsvp = useCallback(
    async (response: EventRsvp) => {
      if (!auth.session || !event) return;
      setSubmitting(response);
      const prevRsvp = event.myRsvp?.response || null;
      setEvent((cur) => {
        if (!cur) return cur;
        const counts = { ...cur.rsvps };
        if (prevRsvp) counts[prevRsvp] = Math.max(0, counts[prevRsvp] - 1);
        counts[response] = (counts[response] || 0) + 1;
        return {
          ...cur,
          rsvps: counts,
          myRsvp: { response, guests: cur.myRsvp?.guests || 0, notes: cur.myRsvp?.notes || null },
        };
      });
      try {
        await setEventRsvp(
          { orgSlug: auth.session.orgSlug, token: auth.session.token },
          event.id,
          response,
        );
      } catch (e: unknown) {
        setEvent((cur) => {
          if (!cur) return cur;
          const counts = { ...cur.rsvps };
          counts[response] = Math.max(0, counts[response] - 1);
          if (prevRsvp) counts[prevRsvp] = (counts[prevRsvp] || 0) + 1;
          return {
            ...cur,
            rsvps: counts,
            myRsvp: prevRsvp
              ? { response: prevRsvp, guests: 0, notes: null }
              : null,
          };
        });
        setError(e instanceof Error ? e.message : "Couldn't save your RSVP.");
      } finally {
        setSubmitting(null);
      }
    },
    [auth.session, event],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}><ActivityIndicator color={palette.primary} /></View>
      </SafeAreaView>
    );
  }
  if (error || !event) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.topBar}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="chevronLeft" size={20} color={palette.accent} strokeWidth={2.2} />
          </Pressable>
          <Text style={styles.topBarTitle}>Event</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.center}>
          <Text style={styles.error}>{error || "Couldn't load this event."}</Text>
          <Pressable style={styles.retry} onPress={load}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const accent = paletteFor(event.color);
  const start = new Date(event.startsAt);
  const end = event.endsAt ? new Date(event.endsAt) : null;
  const dateLine = formatDateLine(start, end, event.allDay);
  const dur = durationLabel(start, end, event.allDay);

  type Chip = { label: string };
  const chips: Chip[] = [];
  if (event.cost && event.cost > 0) chips.push({ label: `$${event.cost}/scout` });
  if (event.capacity) chips.push({ label: `${event.rsvps.yes}/${event.capacity} going` });
  if (dur) chips.push({ label: dur });

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="chevronLeft" size={20} color={palette.accent} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.topBarTitle}>Event</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <View style={styles.cardWrap}>
          <View style={[styles.card, { borderColor: accent }]}>
            <View style={[styles.cardHeader, { backgroundColor: `${accent}14`, borderBottomColor: `${accent}44` }]}>
              <Icon name="calendar" size={14} color={accent} strokeWidth={2} />
              <Text style={[styles.cardEyebrow, { color: accent }]}>
                {(event.categoryLabel || "Event").toUpperCase()}
              </Text>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{event.title}</Text>
              <Text style={styles.cardDate}>{dateLine}</Text>
              {(event.location || event.locationAddress) ? (
                <Text style={styles.cardLocation}>
                  📍 {event.location || ""}
                  {event.locationAddress
                    ? `${event.location ? " · " : ""}${event.locationAddress}`
                    : ""}
                </Text>
              ) : null}

              {chips.length > 0 ? (
                <View style={styles.chipRow}>
                  {chips.map((c, i) => (
                    <View key={i} style={styles.chip}>
                      <Text style={styles.chipText}>{c.label}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.rsvpRow}>
                {(["yes", "maybe", "no"] as const).map((c) => {
                  const active = event.myRsvp?.response === c;
                  const tint =
                    c === "yes"
                      ? palette.success
                      : c === "maybe"
                        ? palette.ember
                        : palette.inkMuted;
                  const label = c === "yes" ? "Going" : c === "maybe" ? "Maybe" : "Can't";
                  const count = event.rsvps[c] || 0;
                  return (
                    <Pressable
                      key={c}
                      disabled={submitting !== null}
                      onPress={() => onRsvp(c)}
                      style={[
                        styles.rsvpBtn,
                        active && { backgroundColor: tint, borderColor: tint },
                        submitting !== null && { opacity: 0.6 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.rsvpBtnLabel,
                          active && styles.rsvpBtnLabelActive,
                        ]}
                      >
                        {label}
                      </Text>
                      <Text
                        style={[
                          styles.rsvpBtnSep,
                          active && styles.rsvpBtnSepActive,
                        ]}
                      >
                        ·
                      </Text>
                      <Text
                        style={[
                          styles.rsvpBtnCount,
                          active && styles.rsvpBtnCountActive,
                        ]}
                      >
                        {count}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </View>

        {event.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DETAILS</Text>
            <Text style={styles.bodyText}>{event.description}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>YOUR RSVP</Text>
          <Text style={styles.rsvpHint}>
            {event.myRsvp?.response === "yes"
              ? "You're going. We'll send a reminder the day before."
              : event.myRsvp?.response === "maybe"
                ? "You said maybe. Tap Going once you're sure — leaders are watching headcount."
                : event.myRsvp?.response === "no"
                  ? "You said you can't make it. Thanks for letting us know."
                  : "Tap Going / Maybe / Can't above to RSVP."}
          </Text>
          <Text style={styles.rsvpSummary}>
            {event.rsvps.yes} going · {event.rsvps.maybe} maybe · {event.rsvps.no} can't make it
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    backgroundColor: palette.surface,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    fontWeight: "600",
    color: palette.ink,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  error: { fontFamily: fontFamilies.ui, color: palette.danger, fontSize: 14 },
  retry: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: palette.primary,
  },
  retryText: { fontFamily: fontFamilies.ui, color: palette.primary, fontWeight: "600" },

  cardWrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  card: {
    backgroundColor: palette.surface,
    borderWidth: 2,
    borderRadius: radius.cardLg,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  cardEyebrow: {
    fontFamily: fontFamilies.ui,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  cardBody: {
    padding: spacing.lg,
  },
  cardTitle: {
    fontFamily: fontFamilies.display,
    fontSize: 24,
    color: palette.ink,
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  cardDate: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.inkSoft,
    marginTop: 6,
  },
  cardLocation: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkMuted,
    marginTop: 4,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: spacing.md,
  },
  chip: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: palette.bg,
    borderRadius: 6,
    alignItems: "center",
  },
  chipText: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkSoft,
    fontWeight: "500",
  },
  rsvpRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: spacing.md,
  },
  rsvpBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.bg,
  },
  rsvpBtnLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    fontWeight: "600",
    color: palette.inkSoft,
  },
  rsvpBtnLabelActive: { color: "#fff" },
  rsvpBtnSep: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkMuted,
    opacity: 0.7,
  },
  rsvpBtnSepActive: { color: "rgba(255,255,255,0.7)" },
  rsvpBtnCount: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    fontWeight: "600",
    color: palette.inkSoft,
  },
  rsvpBtnCountActive: { color: "#fff" },

  section: {
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
  },
  sectionLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: "700",
    color: palette.inkMuted,
    letterSpacing: 1.4,
    marginBottom: spacing.sm,
  },
  bodyText: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    lineHeight: 22,
    color: palette.ink,
  },
  rsvpHint: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    lineHeight: 19,
    color: palette.inkSoft,
    marginBottom: 6,
  },
  rsvpSummary: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkMuted,
  },
});
