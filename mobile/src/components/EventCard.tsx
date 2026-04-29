// Event summary card. Two variants:
//   - "next"  → big dominant card on the home screen with optional warning
//   - "row"   → compact list row with date block + meta
//
// Color is per-event-type (uses the secondary spectrum from tokens).

import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle, StyleProp } from 'react-native';

import { Icon } from '../theme/atoms';
import { fontFamilies, palette, radius, spacing } from '../theme/tokens';

export type EventCardVariant = 'next' | 'row';

export type EventCardProps = {
  variant?: EventCardVariant;
  month: string;
  day: string;
  title: string;
  subtitle: string;
  meta?: string;
  color?: string;
  warning?: string;
  rsvpStatus?: 'going' | 'maybe' | 'rsvp';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function EventCard({
  variant = 'row',
  month,
  day,
  title,
  subtitle,
  meta,
  color = palette.primary,
  warning,
  rsvpStatus,
  onPress,
  style,
}: EventCardProps) {
  if (variant === 'next') {
    return (
      <Pressable onPress={onPress} style={[styles.next, style]}>
        <Text style={styles.nextEyebrow}>NEXT UP · {month} {day}</Text>
        <Text style={styles.nextTitle}>{title}</Text>
        <Text style={styles.nextSubtitle}>{subtitle}</Text>
        {warning ? (
          <View style={styles.warning}>
            <Icon name="bell" size={16} color={palette.butter} strokeWidth={2} />
            <Text style={styles.warningText}>{warning}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress} style={[styles.row, style]}>
      <View style={[styles.dateBlock, { backgroundColor: `${color}1f`, borderColor: `${color}55` }]}>
        <Text style={[styles.dateMonth, { color }]}>{month}</Text>
        <Text style={[styles.dateDay, { color }]}>{day}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.rowHeader}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {rsvpStatus ? <RsvpBadge status={rsvpStatus} /> : null}
        </View>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
    </Pressable>
  );
}

function RsvpBadge({ status }: { status: 'going' | 'maybe' | 'rsvp' }) {
  const map = {
    going: { label: 'Going', bg: `${palette.success}22`, fg: palette.success },
    maybe: { label: 'Maybe', bg: `${palette.ember}22`, fg: palette.ember },
    rsvp: { label: 'RSVP', bg: palette.accent, fg: palette.ink },
  } as const;
  const t = map[status];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.badgeText, { color: t.fg }]}>{t.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  next: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sheet,
    padding: spacing.lg,
    overflow: 'hidden',
  },
  nextEyebrow: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: palette.accent,
    marginBottom: spacing.sm,
  },
  nextTitle: {
    fontFamily: fontFamilies.display,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.4,
    color: '#ffffff',
    marginBottom: 4,
  },
  nextSubtitle: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: spacing.md,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    backgroundColor: 'rgba(243,197,74,0.15)',
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: 'rgba(243,197,74,0.45)',
  },
  warningText: {
    flex: 1,
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    fontWeight: '600',
    color: palette.butter,
    lineHeight: 16,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  dateBlock: {
    width: 56,
    paddingVertical: 6,
    borderRadius: radius.input,
    borderWidth: 1,
    alignItems: 'center',
  },
  dateMonth: {
    fontFamily: fontFamilies.ui,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  dateDay: {
    fontFamily: fontFamilies.display,
    fontSize: 22,
    fontWeight: '500',
    lineHeight: 24,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flex: 1,
    fontFamily: fontFamilies.ui,
    fontSize: 15,
    fontWeight: '600',
    color: palette.ink,
  },
  subtitle: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkSoft,
    marginTop: 2,
  },
  meta: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    marginTop: 4,
    lineHeight: 15,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.button,
  },
  badgeText: {
    fontFamily: fontFamilies.ui,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
