// Thread — high fidelity. Persistent green TWO-DEEP banner, message
// bubbles with leader-name raspberry coloring + role badges, reactions,
// pinned packing list, and a mock compose row.
//
// The display headline at the top of the screen uses the signature
// italic + chartreuse-fill treatment.

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';

import { Avatar, Icon } from '../../theme/atoms';
import { TwoDeepBanner } from '../../components/TwoDeepBanner';
import { MessageBubble } from '../../components/MessageBubble';
import { fontFamilies, palette, radius, spacing } from '../../theme/tokens';

type Msg = React.ComponentProps<typeof MessageBubble>;

const MESSAGES: Msg[] = [
  {
    side: 'left',
    who: 'Mr. Avery',
    role: 'SM',
    isLeader: true,
    text: 'Hey Hawks — packing list for Friday is pinned. Sleeping bag rated 30°F minimum.',
    timestamp: '3:14 PM',
    avatarColor: palette.plum,
  },
  {
    side: 'left',
    who: 'Sam',
    age: 14,
    text: 'who has the dutch oven from last time?',
    timestamp: '3:42 PM',
    avatarColor: palette.sky,
  },
  {
    side: 'left',
    who: 'Max',
    age: 12,
    text: "i thought Jamie did?",
    timestamp: '3:43 PM',
    avatarColor: palette.teal,
    reactions: [{ emoji: '👍', count: 2 }],
  },
  {
    side: 'left',
    who: 'Jamie',
    age: 13,
    text: "yeah it's in my garage. i'll bring it Friday",
    timestamp: '3:51 PM',
    avatarColor: palette.ember,
    reactions: [{ emoji: '🙏', count: 4 }],
  },
  {
    side: 'left',
    who: 'Sam',
    age: 14,
    timestamp: '4:02 PM',
    avatarColor: palette.sky,
    photoSubject: 'forest',
    photoCaption: 'spotted at the trailhead',
  },
  {
    side: 'right',
    who: 'Alex (you)',
    text: 'Friday looks great — 60 and sunny.',
    timestamp: '4:08 PM',
  },
  {
    side: 'left',
    who: 'Mr. Brooks',
    role: 'ASM',
    isLeader: true,
    text: '@Sam can you confirm whether Henry\'s patrol is borrowing our trail stove?',
    timestamp: '4:11 PM',
    avatarColor: palette.raspberry,
  },
];

export function ThreadScreen() {
  const route = useRoute();
  const params = route.params as { channelName?: string } | undefined;
  const channelName = params?.channelName ?? 'Hawk Patrol';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable>
          <Icon name="chevronLeft" size={22} color={palette.primary} strokeWidth={2.4} />
        </Pressable>
        <Avatar initials="HP" size={36} bg={palette.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.topTitle}>{channelName}</Text>
          <Text style={styles.topSub}>8 scouts · 2 leaders · Troop 12</Text>
        </View>
      </View>

      {/* Hero headline */}
      <View style={styles.heroBlock}>
        <Text style={styles.heroEyebrow}>PATROL · TROOP 12</Text>
        <Text style={styles.heroLine}>
          Pack <Text style={styles.heroAccent}>tight</Text>, sleep <Text style={styles.heroAccent}>warm</Text>.
        </Text>
      </View>

      {/* Two-deep banner */}
      <TwoDeepBanner
        leaderOne="Mr. Avery"
        leaderTwo="Mr. Brooks"
        variant="compact"
      />

      {/* Pinned packing list */}
      <View style={styles.pin}>
        <Icon name="pin" size={14} color={palette.ember} strokeWidth={2} />
        <View style={{ flex: 1 }}>
          <Text style={styles.pinTitle}>Pinned: Spring Campout packing list</Text>
          <Text style={styles.pinSub}>Mr. Avery · 2d ago · tap to view</Text>
        </View>
        <Icon name="chevron" size={14} color={palette.inkMuted} strokeWidth={2} />
      </View>

      {/* Messages */}
      <ScrollView contentContainerStyle={styles.messages}>
        {MESSAGES.map((m, i) => (
          <MessageBubble key={i} {...m} />
        ))}
      </ScrollView>

      {/* Compose */}
      <View style={styles.compose}>
        <View style={styles.composeAdd}>
          <Icon name="plus" size={16} color={palette.inkSoft} strokeWidth={2} />
        </View>
        <View style={styles.composeInput}>
          <Text style={styles.composePlaceholder}>Message Hawk Patrol…</Text>
        </View>
        <Pressable style={styles.composeSend}>
          <Icon name="send" size={16} color={palette.ink} strokeWidth={2} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    backgroundColor: palette.surface,
  },
  topTitle: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    fontWeight: '700',
    color: palette.ink,
  },
  topSub: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
  },
  heroBlock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: palette.bg,
  },
  heroEyebrow: {
    fontFamily: fontFamilies.ui,
    fontSize: 10,
    fontWeight: '700',
    color: palette.inkMuted,
    letterSpacing: 1.6,
    marginBottom: 4,
  },
  heroLine: {
    fontFamily: fontFamilies.display,
    fontSize: 22,
    color: palette.ink,
    letterSpacing: -0.3,
  },
  heroAccent: {
    fontStyle: 'italic',
    backgroundColor: palette.accent,
    color: palette.ink,
  },
  pin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: `${palette.butter}33`,
    borderBottomWidth: 1,
    borderBottomColor: `${palette.butter}66`,
  },
  pinTitle: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    fontWeight: '700',
    color: palette.ink,
  },
  pinSub: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkSoft,
    marginTop: 1,
  },
  messages: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  compose: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    backgroundColor: palette.surface,
  },
  composeAdd: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.bg,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composeInput: {
    flex: 1,
    backgroundColor: palette.bg,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  composePlaceholder: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.inkMuted,
  },
  composeSend: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ThreadScreen;
