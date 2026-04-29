// Event channel — medium fidelity. Embedded RSVP card (Going / Maybe /
// Can't tally), drivers ask, RSVP confirmation toast, mock read receipt.
//
// TODO(backend): RSVP tallies should subscribe to /channel/:id stream
// and the drivers ask should reuse the Poll primitive.

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Icon } from '../../theme/atoms';
import { TwoDeepBanner } from '../../components/TwoDeepBanner';
import { fontFamilies, palette, radius, spacing } from '../../theme/tokens';

const TALLY: Array<{ label: 'Going' | 'Maybe' | "Can't"; count: number; color: string; active?: boolean }> = [
  { label: 'Going', count: 18, color: palette.success, active: true },
  { label: 'Maybe', count: 4, color: palette.ember },
  { label: "Can't", count: 2, color: palette.inkMuted },
];

export function EventChannelScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable>
          <Icon name="chevronLeft" size={22} color={palette.primary} strokeWidth={2.4} />
        </Pressable>
        <View style={[styles.iconBlock, { backgroundColor: palette.ember }]}>
          <Text style={styles.glyph}>SC</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Spring Campout</Text>
          <Text style={styles.sub}>Event channel · 18 going · ends Sunday</Text>
        </View>
      </View>

      <TwoDeepBanner leaderOne="Mr. Avery" leaderTwo="Mr. Brooks" variant="compact" />

      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        {/* Embedded event card */}
        <View style={styles.eventCard}>
          <View style={styles.eventCardHeader}>
            <Icon name="calendar" size={14} color={palette.ember} strokeWidth={2} />
            <Text style={styles.eventCardEyebrow}>EVENT · auto-posted by Compass</Text>
          </View>
          <View style={styles.eventCardBody}>
            <Text style={styles.eventCardTitle}>Spring Campout — Birch Lake</Text>
            <Text style={styles.eventCardWhen}>
              Fri Mar 21, 5:30 PM → Sun Mar 23, 11:00 AM
            </Text>
            <View style={styles.factsRow}>
              {['$35/scout', 'Permission slip', '2 nights'].map((f) => (
                <View key={f} style={styles.fact}>
                  <Text style={styles.factText}>{f}</Text>
                </View>
              ))}
            </View>
            <View style={styles.tallyRow}>
              {TALLY.map((b) => (
                <View
                  key={b.label}
                  style={[
                    styles.tally,
                    b.active && { backgroundColor: b.color, borderColor: b.color },
                  ]}
                >
                  <Text
                    style={[
                      styles.tallyText,
                      b.active && { color: '#ffffff' },
                    ]}
                  >
                    {b.label} · {b.count}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Drivers ask */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Avatar initials="MB" bg={palette.raspberry} size={28} style={{ marginTop: 18 }} />
          <View>
            <View style={styles.nameLine}>
              <Text style={[styles.name, { color: palette.raspberry }]}>Mr. Brooks</Text>
              <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>ASM</Text></View>
            </View>
            <View style={[styles.bubble, styles.bubbleLeft]}>
              <Text style={styles.bubbleText}>Drivers — who has open seats Friday?</Text>
            </View>
            <Text style={styles.timestamp}>2:14 PM</Text>
          </View>
        </View>

        {/* RSVP toast */}
        <View style={styles.toast}>
          <Icon name="check" size={12} color={palette.success} strokeWidth={3} />
          <Text style={styles.toastText}>
            Alex marked Sam &amp; Max as Going · paid $70
          </Text>
        </View>

        {/* User reply */}
        <View style={{ alignSelf: 'flex-end', maxWidth: '78%' }}>
          <View style={[styles.bubble, styles.bubbleRight]}>
            <Text style={[styles.bubbleText, { color: '#ffffff' }]}>
              I have 3 seats — leaving 5:00 from St. Mark's parking lot.
            </Text>
          </View>
          <Text style={[styles.timestamp, { textAlign: 'right' }]}>
            2:18 PM · read by 14
          </Text>
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
    fontSize: 14,
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
  eventCard: {
    backgroundColor: palette.surface,
    borderWidth: 2,
    borderColor: palette.ember,
    borderRadius: radius.cardLg,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    width: '92%',
  },
  eventCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: `${palette.ember}14`,
    borderBottomWidth: 1,
    borderBottomColor: `${palette.ember}44`,
  },
  eventCardEyebrow: {
    fontFamily: fontFamilies.ui,
    fontSize: 10,
    fontWeight: '700',
    color: palette.ember,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
  },
  eventCardBody: { padding: spacing.md },
  eventCardTitle: {
    fontFamily: fontFamilies.display,
    fontSize: 22,
    color: palette.ink,
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  eventCardWhen: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.inkSoft,
    marginBottom: spacing.sm,
  },
  factsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: spacing.md,
  },
  fact: {
    flex: 1,
    backgroundColor: palette.bg,
    borderRadius: radius.button,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  factText: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkSoft,
  },
  tallyRow: { flexDirection: 'row', gap: 6 },
  tally: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.cardSm,
    backgroundColor: palette.bg,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: 'center',
  },
  tallyText: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    fontWeight: '700',
    color: palette.inkSoft,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 12,
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
    borderRadius: radius.sheet,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleLeft: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderBottomLeftRadius: 4,
  },
  bubbleRight: {
    backgroundColor: palette.primary,
    borderBottomRightRadius: 4,
  },
  bubbleText: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    color: palette.ink,
    lineHeight: 20,
  },
  timestamp: {
    fontFamily: fontFamilies.ui,
    fontSize: 10,
    color: palette.inkMuted,
    marginTop: 3,
    marginHorizontal: 12,
  },
  toast: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: `${palette.success}22`,
  },
  toastText: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: '700',
    color: palette.success,
  },
});

export default EventChannelScreen;
