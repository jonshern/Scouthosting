// Photos — medium fidelity. Event-grouped grid using the gradient
// Photo placeholder. Filter pills at the top.
//
// TODO(backend): swap placeholders for real CDN URLs from
// /api/photos?eventId=… and respect per-scout privacy flags.

import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Photo, PhotoSubject } from '../theme/atoms';
import { fontFamilies, palette, radius, spacing } from '../theme/tokens';

const FILTERS = ['By event', 'By scout', 'My uploads'] as const;

const GROUPS: Array<{
  title: string;
  subtitle: string;
  more: number;
  tiles: PhotoSubject[];
}> = [
  {
    title: 'Klondike Derby',
    subtitle: 'Mar 1 · 47 photos · by Mr. Avery',
    more: 41,
    tiles: ['summit', 'campfire', 'troop', 'forest', 'service', 'derby'],
  },
  {
    title: 'Eagle Project — Jamie',
    subtitle: 'Feb 22 · 18 photos · by Jamie',
    more: 15,
    tiles: ['service', 'forest', 'troop'],
  },
  {
    title: 'Court of Honor',
    subtitle: 'Jan 19 · 32 photos · by Ms. Carter',
    more: 28,
    tiles: ['eagle', 'troop', 'forest', 'derby'],
  },
];

export function PhotosScreen() {
  const [filter, setFilter] = useState<typeof FILTERS[number]>('By event');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Photos</Text>
          <Pressable>
            <Text style={styles.dropAction}>+ Drop</Text>
          </Pressable>
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
                  styles.filter,
                  active && { backgroundColor: palette.primary, borderColor: palette.primary },
                ]}
              >
                <Text style={[styles.filterText, active && { color: '#ffffff' }]}>
                  {f}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {GROUPS.map((g) => (
          <View key={g.title} style={{ marginBottom: spacing.xxl }}>
            <Text style={styles.groupTitle}>{g.title}</Text>
            <Text style={styles.groupSub}>{g.subtitle}</Text>
            <View style={styles.grid}>
              {g.tiles.map((t, j) => (
                <View key={j} style={styles.tile}>
                  <Photo subject={t} width="100%" height="100%" rounded={radius.cardSm} showCaption={false} />
                  {j === g.tiles.length - 1 ? (
                    <View style={styles.moreOverlay}>
                      <Text style={styles.moreText}>+{g.more}</Text>
                    </View>
                  ) : null}
                </View>
              ))}
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
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: 32,
    color: palette.ink,
    letterSpacing: -0.6,
  },
  dropAction: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    fontWeight: '700',
    color: palette.primary,
  },
  filter: {
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
  list: { paddingHorizontal: spacing.screen, paddingTop: spacing.md },
  groupTitle: {
    fontFamily: fontFamilies.display,
    fontSize: 22,
    color: palette.ink,
    letterSpacing: -0.3,
  },
  groupSub: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    marginTop: 2,
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  tile: {
    width: '32.5%',
    aspectRatio: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,19,13,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    fontFamily: fontFamilies.ui,
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
});

export default PhotosScreen;
