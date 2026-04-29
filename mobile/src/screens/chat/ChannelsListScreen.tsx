// Channels list — high fidelity. Grouped channels (Your / Event /
// Leader-only) with unread badges and two-deep markers.
//
// Channel auto-creation is server-managed (one per patrol/den, one per
// pack/troop, one parents-only, one leader-only, one per published
// event with auto-archive). The list here just renders the result.

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ChannelRow } from '../../components/ChannelRow';
import { Icon } from '../../theme/atoms';
import { fontFamilies, palette, radius, spacing } from '../../theme/tokens';
import type { ChatStackParamList } from '../../navigation/types';

type Section = {
  title: string;
  items: ChannelDef[];
};

type ChannelDef = {
  id: string;
  destination: keyof ChatStackParamList;
  name: string;
  member: string;
  last: string;
  t: string;
  n: number;
  color: string;
  glyph: string;
  twoDeep?: boolean;
  isEvent?: boolean;
  isLeaderOnly?: boolean;
};

const SECTIONS: Section[] = [
  {
    title: 'Your channels',
    items: [
      {
        id: 'hawk-patrol',
        destination: 'Thread',
        name: 'Hawk Patrol',
        member: '8 scouts · 2 leaders',
        last: 'Sam: who has the dutch oven?',
        t: '4m',
        n: 5,
        color: palette.primary,
        glyph: 'HP',
        twoDeep: true,
      },
      {
        id: 'troop-12-all',
        destination: 'Poll',
        name: 'Troop 12 — All',
        member: '32 scouts · 18 leaders · 47 parents',
        last: 'Mr. Avery: meeting moves to 7:30',
        t: '1h',
        n: 0,
        color: palette.ink,
        glyph: 'T12',
      },
      {
        id: 'parents-troop-12',
        destination: 'Thread',
        name: 'Parents — Troop 12',
        member: '47 parents',
        last: 'Kris: anyone driving from across town?',
        t: '2h',
        n: 2,
        color: palette.plum,
        glyph: 'P',
      },
    ],
  },
  {
    title: 'Event channels',
    items: [
      {
        id: 'spring-campout',
        destination: 'EventChannel',
        name: 'Spring Campout',
        member: '18 going · ends Sun',
        last: 'Mr. Brooks pinned the packing list',
        t: '14m',
        n: 3,
        color: palette.ember,
        glyph: 'SC',
        isEvent: true,
        twoDeep: true,
      },
      {
        id: 'eagle-jamie',
        destination: 'EventChannel',
        name: 'Eagle Project — Jamie',
        member: '12 going · ends Sat',
        last: 'Jamie: thanks for signing up!',
        t: '2d',
        n: 0,
        color: palette.teal,
        glyph: 'EP',
        isEvent: true,
      },
    ],
  },
  {
    title: 'Leader-only',
    items: [
      {
        id: 'key-three',
        destination: 'LeaderOversight',
        name: 'Key Three + Committee',
        member: '7 leaders',
        last: 'Ms. Carter: budget review attached',
        t: 'Yest',
        n: 1,
        color: palette.raspberry,
        glyph: 'K3',
        isLeaderOnly: true,
      },
    ],
  },
];

export function ChannelsListScreen() {
  const nav = useNavigation<NativeStackNavigationProp<ChatStackParamList>>();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>
            Chat<Text style={{ color: palette.accent }}>.</Text>
          </Text>
          <Pressable style={styles.composeBtn}>
            <Icon name="plus" size={16} color={palette.ink} strokeWidth={2.5} />
          </Pressable>
        </View>
        <View style={styles.search}>
          <Icon name="search" size={14} color={palette.inkMuted} strokeWidth={2} />
          <Text style={styles.searchPlaceholder}>Search channels & messages</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {SECTIONS.map((sec) => (
          <View key={sec.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{sec.title.toUpperCase()}</Text>
            {sec.items.map((ch, j) => (
              <View
                key={ch.id}
                style={[
                  j < sec.items.length - 1 && {
                    borderBottomColor: palette.lineSoft,
                    borderBottomWidth: 1,
                  },
                ]}
              >
                <ChannelRow
                  name={ch.name}
                  memberSummary={ch.member}
                  lastMessage={ch.last}
                  timestamp={ch.t}
                  color={ch.color}
                  glyph={ch.glyph}
                  unread={ch.n}
                  twoDeep={ch.twoDeep}
                  isEvent={ch.isEvent}
                  isLeaderOnly={ch.isLeaderOnly}
                  onPress={() => {
                    if (ch.destination === 'Thread') {
                      nav.navigate('Thread', { channelId: ch.id, channelName: ch.name });
                    } else if (ch.destination === 'EventChannel') {
                      nav.navigate('EventChannel', { channelId: ch.id });
                    } else if (ch.destination === 'Poll') {
                      nav.navigate('Poll', { channelId: ch.id, pollId: 'cook-friday' });
                    } else if (ch.destination === 'LeaderOversight') {
                      nav.navigate('LeaderOversight', { channelId: ch.id });
                    }
                  }}
                />
              </View>
            ))}
          </View>
        ))}

        <Text style={styles.footnote}>
          Channels are auto-created from your roster. Leaders see every channel by
          YPT policy.
        </Text>
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
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: 32,
    color: palette.ink,
    letterSpacing: -0.6,
  },
  composeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.input,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchPlaceholder: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.inkMuted,
  },
  section: { paddingHorizontal: spacing.screen, paddingTop: spacing.md },
  sectionTitle: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: '700',
    color: palette.inkMuted,
    letterSpacing: 1.4,
    paddingVertical: 6,
  },
  footnote: {
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.lg,
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
});

export default ChannelsListScreen;
