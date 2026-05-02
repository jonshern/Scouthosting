// Calendar screen — restructured to the mobile-calendar-v2.jsx layout
// from the design handoff. The screen now has a Month / Agenda
// segmented control. In Month mode we render an Outlook-style 6-row
// month grid with category-coloured event dots per day, prev/next
// navigation, and a "Saturday, Mar 21" detail strip below for the
// selected date. In Agenda mode we keep the per-month grouped list
// (the previous default), with the same RSVP-aware filter chips.
//
// All data still comes from /api/v1/orgs/:orgId/events with no extra
// fetch — the month grid just buckets the same events list by day.

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { fetchEvents, type CalendarEvent, type EventRsvp } from "../api/events";
import type { CalendarStackParamList } from "../navigation/types";

const FILTERS = ["All", "Going", "Outings", "Meetings"] as const;
type Filter = (typeof FILTERS)[number];

const VIEWS = ["Month", "Agenda"] as const;
type ViewMode = (typeof VIEWS)[number];

type CalendarNav = NativeStackNavigationProp<CalendarStackParamList, "CalendarRoot">;

const MONTH_SHORT = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

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
    "campout", "trip", "highadventure", "service",
    "ceremony", "court-of-honor", "pinewood", "blueandgold",
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
  if (status === "yes") return { label: "Going", bg: palette.success, fg: "#fff" };
  if (status === "maybe") return { label: "Maybe", bg: palette.butter, fg: palette.ink };
  if (status === "no") return { label: "No", bg: palette.lineSoft, fg: palette.inkMuted };
  return null;
}

// Returns ISO YYYY-MM-DD for keying events into the month grid.
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function CalendarScreen() {
  const auth = useAuth();
  const navigation = useNavigation<CalendarNav>();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [filter, setFilter] = useState<Filter>("All");
  const [view, setView] = useState<ViewMode>("Month");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState<{ year: number; month: number }>({
    year: today.getFullYear(),
    month: today.getMonth(),
  });
  const [selectedKey, setSelectedKey] = useState<string>(dayKey(today));

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

  // Bucket events by day key for fast month-grid lookup.
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of visible) {
      const key = dayKey(new Date(e.startsAt));
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    }
    return map;
  }, [visible]);

  const selectedEvents = byDay.get(selectedKey) || [];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Calendar</Text>
          {events.length > 0 ? (
            <Text style={styles.subtitle}>{events.length} upcoming</Text>
          ) : null}
        </View>

        <ViewSwitch active={view} onChange={setView} />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTERS.map((f) => {
            const active = filter === f;
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{f}</Text>
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
        ) : visible.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {filter === "All" ? "No upcoming events." : `No events match "${filter}".`}
            </Text>
          </View>
        ) : view === "Month" ? (
          <MonthView
            year={cursor.year}
            month={cursor.month}
            today={today}
            byDay={byDay}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            onPrev={() => {
              const next = new Date(cursor.year, cursor.month - 1, 1);
              setCursor({ year: next.getFullYear(), month: next.getMonth() });
            }}
            onNext={() => {
              const next = new Date(cursor.year, cursor.month + 1, 1);
              setCursor({ year: next.getFullYear(), month: next.getMonth() });
            }}
            onToday={() => {
              setCursor({ year: today.getFullYear(), month: today.getMonth() });
              setSelectedKey(dayKey(today));
            }}
            selectedEvents={selectedEvents}
            onOpenEvent={(id) => navigation.navigate("EventDetail", { eventId: id })}
          />
        ) : (
          <AgendaView
            events={visible}
            onOpenEvent={(id) => navigation.navigate("EventDetail", { eventId: id })}
          />
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ViewSwitch({
  active,
  onChange,
}: {
  active: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  return (
    <View style={styles.viewSwitch}>
      {VIEWS.map((v) => {
        const isActive = active === v;
        return (
          <Pressable
            key={v}
            onPress={() => onChange(v)}
            style={[styles.viewSwitchOpt, isActive && styles.viewSwitchOptActive]}
          >
            <Text style={[styles.viewSwitchText, isActive && styles.viewSwitchTextActive]}>{v}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MonthView({
  year,
  month,
  today,
  byDay,
  selectedKey,
  onSelect,
  onPrev,
  onNext,
  onToday,
  selectedEvents,
  onOpenEvent,
}: {
  year: number;
  month: number;
  today: Date;
  byDay: Map<string, CalendarEvent[]>;
  selectedKey: string;
  onSelect: (key: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  selectedEvents: CalendarEvent[];
  onOpenEvent: (id: string) => void;
}) {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  type Cell = { day: number; mute: boolean; key: string; year: number; month: number };
  const cells: Cell[] = [];
  // Leading days from previous month
  for (let i = firstDow - 1; i >= 0; i--) {
    const d = prevDays - i;
    const m = month === 0 ? 11 : month - 1;
    const y = month === 0 ? year - 1 : year;
    cells.push({ day: d, mute: true, key: `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, year: y, month: m });
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, mute: false, key: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, year, month });
  }
  // Trailing — pad to 42 (6 rows × 7)
  let nd = 1;
  while (cells.length < 42) {
    const m = month === 11 ? 0 : month + 1;
    const y = month === 11 ? year + 1 : year;
    cells.push({ day: nd, mute: true, key: `${y}-${String(m + 1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`, year: y, month: m });
    nd++;
  }

  const todayKey = dayKey(today);

  return (
    <>
      <View style={styles.monthNav}>
        <View style={styles.monthLabelRow}>
          <Text style={styles.monthName}>{MONTH_LONG[month]}</Text>
          <Text style={styles.monthYear}>{year}</Text>
        </View>
        <View style={styles.monthNavBtns}>
          <Pressable onPress={onPrev} style={styles.monthNavBtn}>
            <Text style={styles.monthNavGlyph}>‹</Text>
          </Pressable>
          <Pressable onPress={onToday} style={styles.todayBtn}>
            <Text style={styles.todayText}>Today</Text>
          </Pressable>
          <Pressable onPress={onNext} style={styles.monthNavBtn}>
            <Text style={styles.monthNavGlyph}>›</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.dowRow}>
        {DOW.map((d, i) => (
          <Text key={i} style={styles.dowText}>{d}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((c, i) => {
          const isToday = !c.mute && c.key === todayKey;
          const isSelected = c.key === selectedKey;
          const dayEvents = byDay.get(c.key) || [];
          return (
            <Pressable
              key={i}
              onPress={() => onSelect(c.key)}
              style={styles.gridCell}
            >
              <View
                style={[
                  styles.dayCircle,
                  isToday && !isSelected ? styles.dayCircleToday : null,
                  isSelected ? styles.dayCircleSelected : null,
                ]}
              >
                <Text
                  style={[
                    styles.dayNumber,
                    c.mute && styles.dayNumberMute,
                    isToday && !isSelected ? styles.dayNumberToday : null,
                    isSelected ? styles.dayNumberSelected : null,
                  ]}
                >
                  {c.day}
                </Text>
              </View>
              {dayEvents.length > 0 ? (
                <View style={styles.dotRow}>
                  {dayEvents.slice(0, 3).map((e, j) => (
                    <View
                      key={j}
                      style={[styles.eventDot, { backgroundColor: paletteFor(e.color) }]}
                    />
                  ))}
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <SelectedDayPanel
        selectedKey={selectedKey}
        events={selectedEvents}
        onOpenEvent={onOpenEvent}
      />

      <Legend />
    </>
  );
}

function SelectedDayPanel({
  selectedKey,
  events,
  onOpenEvent,
}: {
  selectedKey: string;
  events: CalendarEvent[];
  onOpenEvent: (id: string) => void;
}) {
  const parts = selectedKey.split("-").map((p) => parseInt(p, 10));
  const date = new Date(parts[0]!, (parts[1] || 1) - 1, parts[2] || 1);
  const label = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  return (
    <View style={styles.dayPanel}>
      <View style={styles.dayPanelHeader}>
        <Text style={styles.dayPanelTitle}>{label}</Text>
        <Text style={styles.dayPanelMeta}>
          {events.length === 0
            ? "No events"
            : `${events.length} event${events.length === 1 ? "" : "s"}`}
        </Text>
      </View>
      {events.length === 0 ? (
        <Text style={styles.dayPanelEmpty}>Nothing scheduled.</Text>
      ) : (
        events.map((e) => {
          const accent = paletteFor(e.color);
          const start = new Date(e.startsAt);
          const time = start.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" });
          const sub = `${time}${e.location ? ` · ${e.location}` : ""}${
            e.capacity ? ` · ${e.rsvpYesCount}/${e.capacity} going` : ""
          }`;
          const badge = rsvpBadge(e.myRsvp);
          return (
            <Pressable
              key={e.id}
              onPress={() => onOpenEvent(e.id)}
              style={[styles.dayEventCard, { borderLeftColor: accent }]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                {e.categoryLabel ? (
                  <View style={styles.dayEventTagRow}>
                    <View style={[styles.dayEventTag, { backgroundColor: `${accent}22` }]}>
                      <Text style={[styles.dayEventTagText, { color: accent }]}>
                        {e.categoryLabel.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                ) : null}
                <Text style={styles.dayEventTitle}>{e.title}</Text>
                <Text style={styles.dayEventSub}>{sub}</Text>
              </View>
              {badge ? (
                <View style={[styles.dayEventBadge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.dayEventBadgeText, { color: badge.fg }]}>{badge.label}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })
      )}
    </View>
  );
}

function Legend() {
  const items: Array<{ color: string; label: string }> = [
    { color: palette.accent, label: "Meeting" },
    { color: palette.ember, label: "Outing" },
    { color: palette.teal, label: "Service" },
    { color: palette.plum, label: "PLC" },
    { color: palette.raspberry, label: "BoR" },
  ];
  return (
    <View style={styles.legend}>
      {items.map((it, i) => (
        <View key={i} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: it.color }]} />
          <Text style={styles.legendText}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

function AgendaView({
  events,
  onOpenEvent,
}: {
  events: CalendarEvent[];
  onOpenEvent: (id: string) => void;
}) {
  const groups: Array<{ month: string; items: CalendarEvent[] }> = [];
  for (const e of events) {
    const d = new Date(e.startsAt);
    const month = `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.items.push(e);
    else groups.push({ month, items: [e] });
  }
  return (
    <>
      {groups.map((g) => (
        <View key={g.month} style={{ marginBottom: spacing.lg }}>
          <Text style={styles.groupLabel}>{g.month}</Text>
          {g.items.map((e, i) => {
            const d = new Date(e.startsAt);
            const dateLabel = `${d.toLocaleString("en-US", { weekday: "short" })} · ${d.toLocaleString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}`;
            const accent = paletteFor(e.color);
            const badge = rsvpBadge(e.myRsvp);
            return (
              <Pressable
                key={e.id}
                onPress={() => onOpenEvent(e.id)}
                style={[
                  styles.eventRow,
                  i < g.items.length - 1 && {
                    borderBottomColor: palette.lineSoft,
                    borderBottomWidth: 1,
                  },
                ]}
              >
                <View style={[styles.dateBlock, { backgroundColor: accent }]}>
                  <Text style={styles.dateMonth}>{MONTH_SHORT[d.getMonth()]}</Text>
                  <Text style={styles.dateDay}>{d.getDate()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventTitle}>{e.title}</Text>
                  <Text style={styles.eventSub}>
                    {dateLabel}{e.location ? ` · ${e.location}` : ""}
                  </Text>
                  <View style={styles.eventMetaRow}>
                    {e.categoryLabel ? (
                      <View style={[styles.catTag, { backgroundColor: accent }]}>
                        <Text style={styles.catTagText}>{e.categoryLabel}</Text>
                      </View>
                    ) : null}
                    <Text style={styles.eventMeta}>
                      {e.rsvpYesCount} going{e.capacity ? ` / ${e.capacity}` : ""}
                    </Text>
                  </View>
                </View>
                {badge ? (
                  <View style={[styles.rsvpBadge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.rsvpBadgeText, { color: badge.fg }]}>{badge.label}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </>
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
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
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
  viewSwitch: {
    flexDirection: "row",
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.cardSm,
    padding: 2,
  },
  viewSwitchOpt: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: "center",
  },
  viewSwitchOptActive: {
    backgroundColor: palette.ink,
  },
  viewSwitchText: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    fontWeight: "600",
    color: palette.inkSoft,
  },
  viewSwitchTextActive: { color: "#fff" },
  filterRow: {
    flexDirection: "row",
    gap: 6,
    paddingRight: spacing.md,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
  },
  filterChipActive: {
    backgroundColor: palette.ink,
    borderColor: palette.ink,
  },
  filterText: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: "600",
    color: palette.inkSoft,
  },
  filterTextActive: { color: "#fff" },
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

  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  monthLabelRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  monthName: {
    fontFamily: fontFamilies.display,
    fontSize: 22,
    color: palette.ink,
    letterSpacing: -0.3,
  },
  monthYear: {
    fontFamily: fontFamilies.display,
    fontSize: 18,
    fontStyle: "italic",
    color: palette.inkMuted,
  },
  monthNavBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  monthNavBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  monthNavGlyph: {
    fontFamily: fontFamilies.ui,
    fontSize: 22,
    color: palette.inkSoft,
    fontWeight: "600",
    lineHeight: 24,
  },
  todayBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  todayText: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.accent,
    fontWeight: "600",
  },

  dowRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  dowText: {
    flex: 1,
    textAlign: "center",
    fontFamily: fontFamilies.ui,
    fontSize: 10,
    fontWeight: "700",
    color: palette.inkMuted,
    letterSpacing: 0.4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  gridCell: {
    width: `${100 / 7}%`,
    height: 44,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 6,
  },
  dayCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCircleToday: {
    backgroundColor: `${palette.accent}22`,
  },
  dayCircleSelected: {
    backgroundColor: palette.ink,
  },
  dayNumber: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    fontWeight: "500",
    color: palette.ink,
  },
  dayNumberMute: { color: palette.lineSoft },
  dayNumberToday: { color: palette.accent, fontWeight: "700" },
  dayNumberSelected: { color: "#fff", fontWeight: "700" },
  dotRow: {
    flexDirection: "row",
    gap: 2,
    marginTop: 3,
  },
  eventDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },

  dayPanel: {
    marginTop: spacing.md,
  },
  dayPanelHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 10,
  },
  dayPanelTitle: {
    fontFamily: fontFamilies.display,
    fontSize: 18,
    color: palette.ink,
    letterSpacing: -0.2,
  },
  dayPanelMeta: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    fontWeight: "500",
  },
  dayPanelEmpty: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.inkMuted,
    fontStyle: "italic",
    paddingVertical: 8,
  },
  dayEventCard: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderLeftWidth: 3,
    borderRadius: 10,
    marginBottom: 8,
    alignItems: "center",
  },
  dayEventTagRow: { flexDirection: "row", marginBottom: 4 },
  dayEventTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    alignSelf: "flex-start",
  },
  dayEventTagText: {
    fontFamily: fontFamilies.ui,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  dayEventTitle: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    fontWeight: "600",
    color: palette.ink,
    lineHeight: 18,
  },
  dayEventSub: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkSoft,
    marginTop: 3,
  },
  dayEventBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  dayEventBadgeText: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
  },

  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopColor: palette.lineSoft,
    borderTopWidth: 1,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontFamily: fontFamilies.ui,
    fontSize: 10,
    color: palette.inkSoft,
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
