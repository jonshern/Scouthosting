// Single channel row used in the channels list (Your / Event /
// Leader-only). Shows icon block, name, member count, last message,
// optional two-deep marker, and unread badge.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '../theme/atoms';
import { fontFamilies, palette, radius, spacing } from '../theme/tokens';

export type ChannelRowProps = {
  name: string;
  memberSummary: string;
  lastMessage: string;
  timestamp: string;
  color: string;
  glyph: string; // Single-character or short string used inside the icon block
  unread?: number;
  twoDeep?: boolean;
  isEvent?: boolean;
  isLeaderOnly?: boolean;
  onPress?: () => void;
};

export function ChannelRow({
  name,
  memberSummary,
  lastMessage,
  timestamp,
  color,
  glyph,
  unread = 0,
  twoDeep = false,
  isEvent = false,
  isLeaderOnly = false,
  onPress,
}: ChannelRowProps) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={[styles.iconBlock, { backgroundColor: color }]}>
        <Text style={styles.glyph}>{glyph}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.headerLine}>
          <View style={styles.nameLine}>
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
            {isEvent ? (
              <View style={styles.eventTag}>
                <Text style={styles.eventTagText}>EVENT</Text>
              </View>
            ) : null}
            {isLeaderOnly ? <Icon name="lock" size={12} color={palette.raspberry} /> : null}
          </View>
          <Text style={styles.timestamp}>{timestamp}</Text>
        </View>
        <Text style={styles.member}>{memberSummary}</Text>
        <View style={styles.subline}>
          {twoDeep ? (
            <View style={styles.twoDeep}>
              <Icon name="check" size={9} color={palette.success} strokeWidth={3} />
              <Text style={styles.twoDeepText}>TWO-DEEP</Text>
            </View>
          ) : null}
          <Text style={styles.lastMessage} numberOfLines={1}>{lastMessage}</Text>
        </View>
      </View>
      {unread > 0 ? (
        <View style={styles.unread}>
          <Text style={styles.unreadText}>{unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
    alignItems: 'flex-start',
  },
  iconBlock: {
    width: 44,
    height: 44,
    borderRadius: radius.cardLg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    color: '#ffffff',
    fontFamily: fontFamilies.ui,
    fontWeight: '700',
    fontSize: 18,
  },
  headerLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  name: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    fontWeight: '600',
    color: palette.ink,
    flexShrink: 1,
  },
  timestamp: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
  },
  member: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    marginTop: 1,
  },
  subline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  twoDeep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: `${palette.success}1f`,
    borderRadius: radius.chip,
  },
  twoDeepText: {
    fontFamily: fontFamilies.ui,
    fontSize: 9,
    fontWeight: '700',
    color: palette.success,
    letterSpacing: 0.6,
  },
  lastMessage: {
    flex: 1,
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.inkSoft,
  },
  eventTag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: `${palette.accent}55`,
    borderRadius: radius.chip,
  },
  eventTagText: {
    fontFamily: fontFamilies.ui,
    fontSize: 9,
    fontWeight: '700',
    color: palette.primary,
    letterSpacing: 0.4,
  },
  unread: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  unreadText: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: '700',
    color: palette.ink,
  },
});
