// Event detail — fetches GET /api/v1/events/:id and lets the viewer
// set their own RSVP (yes / no / maybe). Multi-scout RSVPs (one
// parent → multiple kids on one screen) are deferred until the
// User ↔ Member family-linking API ships; for v1 we use the
// per-user RSVP shape the rest of the system already supports.

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
      // Optimistic: update the displayed RSVP + bump counts before the
      // API call.
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
        // Roll back the count change on failure.
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
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={palette.primary} /></View>
      </SafeAreaView>
    );
  }
  if (error || !event) {
    return (
      <SafeAreaView style={styles.safe}>
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
  const facts: { label: string; value: string }[] = [
    {
      label: "When",
      value: end
        ? `${start.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} —\n${end.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
        : start.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    },
  ];
  if (event.locationAddress || event.location) {
    facts.push({
      label: "Where",
      value: event.locationAddress
        ? `${event.location || ""}${event.location ? "\n" : ""}${event.locationAddress}`
        : event.location || "",
    });
  }
  if (event.cost) {
    facts.push({ label: "Cost", value: `$${event.cost} per scout` });
  }
  if (event.capacity) {
    facts.push({ label: "Capacity", value: `${event.rsvps.yes} of ${event.capacity} scouts going` });
  } else if (event.rsvps.yes > 0) {
    facts.push({ label: "Going", value: `${event.rsvps.yes} scout${event.rsvps.yes === 1 ? "" : "s"}` });
  }

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <View style={[styles.heroWrap, { backgroundColor: accent }]}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Icon name="chevronLeft" size={20} color={palette.ink} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.heroText}>
            {event.categoryLabel && (
              <Text style={styles.heroEyebrow}>{event.categoryLabel.toUpperCase()}</Text>
            )}
            <Text style={styles.heroTitle}>{event.title}</Text>
          </View>
        </View>

        <View style={styles.facts}>
          {facts.map((row, i) => (
            <View
              key={row.label}
              style={[
                styles.factRow,
                i > 0 && { borderTopWidth: 1, borderTopColor: palette.lineSoft },
              ]}
            >
              <Text style={styles.factLabel}>{row.label.toUpperCase()}</Text>
              <Text style={styles.factValue}>{row.value}</Text>
            </View>
          ))}
        </View>

        {event.description && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DETAILS</Text>
            <Text style={styles.bodyText}>{event.description}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>YOUR RSVP</Text>
          <View style={styles.choiceRow}>
            {(["yes", "maybe", "no"] as const).map((c) => {
              const active = event.myRsvp?.response === c;
              const tint =
                c === "yes" ? palette.success : c === "maybe" ? palette.ember : palette.danger;
              return (
                <Pressable
                  key={c}
                  disabled={submitting !== null}
                  onPress={() => onRsvp(c)}
                  style={[
                    styles.choice,
                    active && { backgroundColor: tint, borderColor: tint },
                    submitting !== null && { opacity: 0.6 },
                  ]}
                >
                  <Text style={[styles.choiceText, active && { color: "#fff" }]}>
                    {c === "yes" ? "Going" : c === "maybe" ? "Maybe" : "Can't make it"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
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
  heroWrap: {
    paddingTop: 56,
    paddingBottom: 32,
    paddingHorizontal: spacing.screen,
    minHeight: 220,
  },
  backButton: {
    position: "absolute",
    top: 56,
    left: spacing.screen,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroText: { marginTop: 36 },
  heroEyebrow: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.85)",
    letterSpacing: 1.6,
  },
  heroTitle: {
    fontFamily: fontFamilies.display,
    fontSize: 28,
    color: "#fff",
    letterSpacing: -0.4,
    marginTop: 4,
  },
  facts: {
    backgroundColor: palette.surface,
    marginHorizontal: spacing.screen,
    marginTop: -16,
    marginBottom: spacing.md,
    borderRadius: radius.cardLg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: palette.line,
  },
  factRow: { paddingVertical: spacing.md },
  factLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 10,
    fontWeight: "700",
    color: palette.inkMuted,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  factValue: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    color: palette.ink,
    lineHeight: 20,
  },
  section: {
    marginHorizontal: spacing.screen,
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
  choiceRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  choice: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.cardLg,
    borderWidth: 1.5,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    alignItems: "center",
  },
  choiceText: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    fontWeight: "700",
    color: palette.ink,
  },
  rsvpSummary: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkMuted,
    marginTop: spacing.md,
  },
});
