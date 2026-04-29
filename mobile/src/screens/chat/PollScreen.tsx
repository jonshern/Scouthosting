// Poll — medium fidelity. Standalone screen demonstrating the embedded
// PollCard inside a thread context.
//
// TODO(backend): poll state should subscribe to /channel/:id/poll/:id
// and votes should round-trip through the API.

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Icon } from '../../theme/atoms';
import { PollCard } from '../../components/PollCard';
import { fontFamilies, palette, radius, spacing } from '../../theme/tokens';

export function PollScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable>
          <Icon name="chevronLeft" size={22} color={palette.primary} strokeWidth={2.4} />
        </Pressable>
        <View style={[styles.iconBlock, { backgroundColor: palette.primary }]}>
          <Text style={styles.glyph}>T12</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Troop 12 — All</Text>
          <Text style={styles.sub}>32 scouts · 18 leaders · 47 parents</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        {/* Leader prompt */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Avatar initials="MA" bg={palette.plum} size={28} style={{ marginTop: 18 }} />
          <View style={{ maxWidth: '78%' }}>
            <View style={styles.nameLine}>
              <Text style={[styles.name, { color: palette.raspberry }]}>Mr. Avery</Text>
              <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>SM</Text></View>
            </View>
            <View style={styles.bubble}>
              <Text style={styles.bubbleText}>
                Picking dinner for the campout. Vote by Wednesday 8 PM.
              </Text>
            </View>
          </View>
        </View>

        <View style={{ marginLeft: 36 }}>
          <PollCard
            question="What should we cook Friday night?"
            deadline="ends Wed 8 PM"
            options={[
              { label: 'Beef chili', count: 12, color: palette.ember, picked: true },
              { label: 'Chicken & rice', count: 7, color: palette.butter },
              { label: 'Mac & cheese (vegetarian)', count: 5, color: palette.teal },
              { label: 'Tacos', count: 3, color: palette.raspberry },
            ]}
            totalVoters={27}
            voterPool={32}
          />
        </View>
      </ScrollView>
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
  iconBlock: {
    width: 36,
    height: 36,
    borderRadius: radius.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    color: '#ffffff',
    fontFamily: fontFamilies.ui,
    fontWeight: '700',
    fontSize: 13,
  },
  title: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    fontWeight: '700',
    color: palette.ink,
  },
  sub: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 10,
    marginBottom: 3,
  },
  name: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: '700',
  },
  roleBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    backgroundColor: palette.raspberry,
    borderRadius: 2,
  },
  roleBadgeText: {
    fontFamily: fontFamilies.ui,
    fontSize: 9,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.4,
  },
  bubble: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.sheet,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleText: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.ink,
    lineHeight: 18,
  },
});

export default PollScreen;
