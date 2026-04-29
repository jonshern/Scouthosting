// Legacy threads list. NOTE: ChannelsListScreen (under src/screens/chat)
// replaces this surface in the Compass redesign — keep this around only
// for migration / fallback while the rollout completes.
//
// TODO(redesign): delete once ChannelsListScreen is fully shipped and
// telemetry confirms no remaining references.

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '../theme/atoms';
import { fontFamilies, palette, spacing } from '../theme/tokens';

const THREADS = [
  { name: 'Spring Campout — drivers needed', last: 'Mr. Avery: Got two more spots covered.', t: '14m', n: 3, color: palette.ember, initials: 'SC' },
  { name: 'Hawk Patrol', last: 'Sam: knot-tying tonight at 7?', t: '1h', n: 1, color: palette.primary, initials: 'HP' },
  { name: 'Mr. Avery (Scoutmaster)', last: "Quick note about Sam's rank conf…", t: '3h', n: 0, color: palette.plum, initials: 'MA' },
  { name: 'Treasurer · Ms. Carter', last: 'Popcorn payouts processed.', t: 'Yest', n: 0, color: palette.teal, initials: 'MC' },
  { name: 'All Parents', last: 'Kris: Anyone driving from across town?', t: 'Yest', n: 0, color: palette.ink, initials: 'AP' },
];

export function MessagesScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages (legacy)</Text>
        <Text style={styles.note}>
          Replaced by Chat. This screen exists for migration / fallback only.
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {THREADS.map((th, i) => (
          <View
            key={th.name}
            style={[
              styles.row,
              i < THREADS.length - 1 && {
                borderBottomColor: palette.lineSoft,
                borderBottomWidth: 1,
              },
            ]}
          >
            <Avatar initials={th.initials} bg={th.color} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{th.name}</Text>
              <Text style={styles.last} numberOfLines={1}>{th.last}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.time}>{th.t}</Text>
              {th.n > 0 ? (
                <View style={styles.unread}>
                  <Text style={styles.unreadText}>{th.n}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ))}
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
  title: {
    fontFamily: fontFamilies.display,
    fontSize: 28,
    color: palette.ink,
    letterSpacing: -0.5,
  },
  note: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    marginTop: 2,
  },
  list: { paddingHorizontal: spacing.screen },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  name: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    fontWeight: '700',
    color: palette.ink,
  },
  last: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.inkSoft,
    marginTop: 2,
  },
  time: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
  },
  unread: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
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

export default MessagesScreen;
