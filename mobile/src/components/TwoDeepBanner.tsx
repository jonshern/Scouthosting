// Persistent green banner shown at the top of any youth-containing
// channel. Renders both adult leader names and a compliance note.
//
// YPT enforcement is server-side; this banner is the user-visible
// reflection of that policy.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '../theme/atoms';
import { fontFamilies, palette, radius, spacing } from '../theme/tokens';

export type TwoDeepBannerProps = {
  leaderOne: string;
  leaderTwo: string;
  variant?: 'compact' | 'full';
  // Optional override copy for the secondary line in `full` variant.
  detail?: string;
};

export function TwoDeepBanner({
  leaderOne,
  leaderTwo,
  variant = 'full',
  detail,
}: TwoDeepBannerProps) {
  if (variant === 'compact') {
    return (
      <View style={styles.compact}>
        <Icon name="shield" size={14} color={palette.success} strokeWidth={2.2} />
        <Text style={styles.compactText} numberOfLines={1}>
          <Text style={styles.compactStrong}>TWO-DEEP</Text>
          <Text style={styles.compactSoft}>
            {`  · ${leaderOne} & ${leaderTwo} watching · scouts can chat freely`}
          </Text>
        </Text>
      </View>
    );
  }

  const detailLine =
    detail ??
    `This thread is auto-CC'd to ${leaderTwo} and logged for review. Required for any youth-adult conversation.`;

  return (
    <View style={styles.full}>
      <Icon name="shield" size={16} color={palette.success} strokeWidth={2} />
      <View style={{ flex: 1 }}>
        <Text style={styles.fullTitle}>
          TWO-DEEP LEADERSHIP <Text style={styles.fullTitleSoft}>· YPT compliant</Text>
        </Text>
        <Text style={styles.fullDetail}>
          {`${leaderOne} & ${leaderTwo} watching. ${detailLine}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: `${palette.success}1f`,
    borderBottomWidth: 1,
    borderBottomColor: `${palette.success}55`,
  },
  compactText: {
    flexShrink: 1,
    fontFamily: fontFamilies.ui,
    fontSize: 11,
  },
  compactStrong: {
    color: palette.success,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  compactSoft: {
    color: palette.inkSoft,
    fontWeight: '500',
  },
  full: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    backgroundColor: `${palette.success}18`,
    borderBottomWidth: 1,
    borderBottomColor: `${palette.success}44`,
  },
  fullTitle: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: palette.success,
    marginBottom: 2,
  },
  fullTitleSoft: {
    fontWeight: '500',
    letterSpacing: 0.4,
  },
  fullDetail: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkSoft,
    lineHeight: 15,
  },
  // unused, but kept so radius is referenced from tokens for consistency
  _radiusRef: { borderRadius: radius.pill },
});
