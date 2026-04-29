// Home screen — high fidelity. Greeting, next-up event card with
// payment warning, three quick-action tiles, and the recent activity
// feed. Anonymized mock data uses Troop 12 / Mr. Avery / Sam / Max.
//
// The display headline uses the signature italic + chartreuse-fill
// treatment from the locked design system.

import React from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Icon, IconName } from '../theme/atoms';
import { EventCard } from '../components/EventCard';
import { fontFamilies, palette, radius, spacing } from '../theme/tokens';

type Activity = {
  title: string;
  subtitle: string;
  color: string;
  icon: IconName;
};

const activity: Activity[] = [
  {
    title: 'Mr. Avery posted 47 photos from Klondike Derby',
    subtitle: '2h ago · Photos',
    color: palette.teal,
    icon: 'image',
  },
  {
    title: 'Eagle Court of Honor scheduled — May 4',
    subtitle: 'Yesterday · Calendar',
    color: palette.sky,
    icon: 'calendar',
  },
  {
    title: 'Treasurer: Popcorn payouts processed',
    subtitle: '2 days ago · Finance',
    color: palette.ember,
    icon: 'flag',
  },
  {
    title: 'Ms. Carter pinned the Spring Campout packing list',
    subtitle: '3 days ago · Hawk Patrol',
    color: palette.plum,
    icon: 'pin',
  },
];

type QuickAction = { label: string; tint: string; icon: IconName };

const quickActions: QuickAction[] = [
  { label: 'RSVP\n& pay', tint: palette.accent, icon: 'check' },
  { label: 'Message\nleaders', tint: palette.ember, icon: 'chat' },
  { label: 'Drop\nphotos', tint: palette.teal, icon: 'image' },
];

export function HomeScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Greeting */}
        <View style={styles.greeting}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dateLabel}>Tuesday, March 18</Text>
            <Text style={styles.heroLine}>
              Hi, <Text style={styles.heroAccent}>Alex</Text>.
            </Text>
            <Text style={styles.heroSub}>
              Two scouts. <Text style={styles.heroItalic}>One troop.</Text>
            </Text>
          </View>
          <Avatar initials="AK" size={44} bg={palette.primary} />
        </View>

        {/* Next-up event */}
        <EventCard
          variant="next"
          month="MAR"
          day="21"
          title={'Spring Campout —\nBirch Lake State Park'}
          subtitle="Fri 5:30 PM departure · Sun 11:00 AM return"
          warning="Permission slip + $35 due by Thursday 9 PM"
          style={{ marginBottom: spacing.xxl }}
        />

        {/* Quick actions */}
        <View style={styles.actionsGrid}>
          {quickActions.map((a) => (
            <Pressable key={a.label} style={styles.actionTile}>
              <View style={[styles.actionIcon, { backgroundColor: a.tint }]}>
                <Icon name={a.icon} size={18} color={palette.ink} strokeWidth={2.2} />
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Activity feed */}
        <Text style={styles.sectionLabel}>RECENTLY</Text>
        {activity.map((a, i) => (
          <View
            key={a.title}
            style={[
              styles.activityRow,
              i < activity.length - 1 && {
                borderBottomColor: palette.lineSoft,
                borderBottomWidth: 1,
              },
            ]}
          >
            <View style={[styles.activityIcon, { backgroundColor: `${a.color}22` }]}>
              <Icon name={a.icon} size={18} color={a.color} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.activityTitle}>{a.title}</Text>
              <Text style={styles.activitySub}>{a.subtitle}</Text>
            </View>
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  content: {
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  greeting: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  dateLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkMuted,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  heroLine: {
    fontFamily: fontFamilies.display,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.8,
    color: palette.ink,
  },
  heroAccent: {
    // Signature italic + accent-fill display treatment
    fontStyle: 'italic',
    backgroundColor: palette.accent,
    color: palette.ink,
  },
  heroSub: {
    fontFamily: fontFamilies.display,
    fontSize: 18,
    lineHeight: 22,
    color: palette.inkSoft,
    marginTop: 4,
  },
  heroItalic: {
    fontStyle: 'italic',
    color: palette.primary,
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xxl,
  },
  actionTile: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: palette.line,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.input,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    fontWeight: '700',
    color: palette.ink,
    textAlign: 'center',
    lineHeight: 14,
  },
  sectionLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: spacing.md,
  },
  activityRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityTitle: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    fontWeight: '600',
    color: palette.ink,
    lineHeight: 18,
  },
  activitySub: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    marginTop: 2,
  },
});

export default HomeScreen;
