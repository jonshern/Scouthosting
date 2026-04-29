// Calendar screen — high fidelity. Filter pills + scrolling list of
// events grouped by month, color-coded by event type.

import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventCard } from '../components/EventCard';
import { fontFamilies, palette, radius, spacing } from '../theme/tokens';

type EventRow = {
  id: string;
  month: string;
  day: string;
  title: string;
  subtitle: string;
  meta: string;
  color: string;
  status: 'going' | 'maybe' | 'rsvp';
  category: 'outing' | 'meeting' | 'service' | 'leadership';
};

const EVENTS: EventRow[] = [
  {
    id: 'spring-campout',
    month: 'MAR',
    day: '21',
    title: 'Spring Campout',
    subtitle: 'Birch Lake State Park',
    meta: '2 nights · 18 going · permission slip + $35',
    color: palette.ember,
    status: 'rsvp',
    category: 'outing',
  },
  {
    id: 'troop-meeting-mar25',
    month: 'MAR',
    day: '25',
    title: 'Troop Meeting',
    subtitle: "St. Mark's · 7:00 PM",
    meta: 'Patrol meetings · Knot relay',
    color: palette.primary,
    status: 'going',
    category: 'meeting',
  },
  {
    id: 'eagle-jamie',
    month: 'APR',
    day: '04',
    title: 'Eagle Project — Jamie',
    subtitle: 'Riverside Park · 9:00 AM',
    meta: 'Trail repair · Bring work gloves',
    color: palette.teal,
    status: 'maybe',
    category: 'service',
  },
  {
    id: 'plc-apr12',
    month: 'APR',
    day: '12',
    title: 'PLC Meeting',
    subtitle: 'Online · 8:00 PM',
    meta: 'PL & APL only',
    color: palette.plum,
    status: 'going',
    category: 'leadership',
  },
  {
    id: 'high-adv-briefing',
    month: 'APR',
    day: '26',
    title: 'High-Adventure Briefing',
    subtitle: "St. Mark's · 7:00 PM",
    meta: 'Required for High-Adventure crew',
    color: palette.raspberry,
    status: 'rsvp',
    category: 'meeting',
  },
  {
    id: 'eagle-coh',
    month: 'MAY',
    day: '04',
    title: 'Eagle Court of Honor',
    subtitle: "St. Mark's Hall · 2:00 PM",
    meta: 'Three new Eagles · Reception after',
    color: palette.sky,
    status: 'going',
    category: 'meeting',
  },
];

const FILTERS = ['All', 'My RSVPs', 'Outings', 'Meetings'] as const;
type Filter = typeof FILTERS[number];

function filterEvents(filter: Filter): EventRow[] {
  switch (filter) {
    case 'All':
      return EVENTS;
    case 'My RSVPs':
      return EVENTS.filter((e) => e.status !== 'rsvp');
    case 'Outings':
      return EVENTS.filter((e) => e.category === 'outing' || e.category === 'service');
    case 'Meetings':
      return EVENTS.filter((e) => e.category === 'meeting' || e.category === 'leadership');
    default:
      return EVENTS;
  }
}

export function CalendarScreen() {
  const [filter, setFilter] = useState<Filter>('All');
  const events = filterEvents(filter);

  // Group by month for visual rhythm
  const groups: Array<{ month: string; items: EventRow[] }> = [];
  events.forEach((e) => {
    const last = groups[groups.length - 1];
    if (last && last.month === e.month) {
      last.items.push(e);
    } else {
      groups.push({ month: e.month, items: [e] });
    }
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Calendar</Text>
          <Text style={styles.month}>March 2026</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
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
                <Text
                  style={[
                    styles.filterText,
                    active && { color: '#ffffff' },
                  ]}
                >
                  {f}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {groups.map((g) => (
          <View key={g.month} style={{ marginBottom: spacing.lg }}>
            <Text style={styles.groupLabel}>{g.month}</Text>
            {g.items.map((e, i) => (
              <View
                key={e.id}
                style={[
                  i < g.items.length - 1 && {
                    borderBottomColor: palette.lineSoft,
                    borderBottomWidth: 1,
                  },
                ]}
              >
                <EventCard
                  variant="row"
                  month={e.month}
                  day={e.day}
                  title={e.title}
                  subtitle={e.subtitle}
                  meta={e.meta}
                  color={e.color}
                  rsvpStatus={e.status}
                />
              </View>
            ))}
          </View>
        ))}
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
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: 32,
    color: palette.ink,
    letterSpacing: -0.6,
  },
  month: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    fontWeight: '600',
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
    fontWeight: '700',
    color: palette.inkSoft,
  },
  list: {
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.md,
  },
  groupLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: '700',
    color: palette.inkMuted,
    letterSpacing: 1.4,
    marginBottom: 4,
  },
});

export default CalendarScreen;
