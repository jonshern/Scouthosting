// Leader oversight — medium fidelity. Per-channel stats (msgs/30d,
// flags, scouts active), moderation tools, and a YPT compliance
// callout. The "Removing either adult auto-suspends the channel"
// behavior surfaces here as data/behavior — the actual enforcement is
// server-side.

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, IconName } from '../../theme/atoms';
import { fontFamilies, palette, radius, spacing } from '../../theme/tokens';

const STATS = [
  { value: '147', label: 'MSGS (30D)', color: palette.primary },
  { value: '0', label: 'FLAGS', color: palette.success },
  { value: '8/8', label: 'SCOUTS ACTIVE', color: palette.teal },
];

type Tool = { label: string; sub: string; icon: IconName; color: string };

const TOOLS: Tool[] = [
  {
    label: 'Keyword alerts',
    sub: '12 watch terms · last alert: never',
    icon: 'bell',
    color: palette.ember,
  },
  {
    label: 'Export channel log',
    sub: 'CSV / PDF · last 90 days · YPT-redacted version available',
    icon: 'flag',
    color: palette.primary,
  },
  {
    label: 'Mute or remove member',
    sub: 'Soft mute or full remove with archive',
    icon: 'profile',
    color: palette.plum,
  },
  {
    label: 'Auto-archive on event end',
    sub: 'On · Spring Campout will archive Sun 11:59 PM',
    icon: 'calendar',
    color: palette.teal,
  },
];

export function LeaderOversightScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.headerRow}>
          <Pressable style={styles.iconBtn}>
            <Icon name="chevronLeft" size={18} color={palette.ink} strokeWidth={2.4} />
          </Pressable>
          <Text style={styles.crumb}>Hawk Patrol</Text>
        </View>

        <View style={styles.body}>
          <View style={styles.eyebrowPill}>
            <Icon name="lock" size={10} color="#fff" strokeWidth={2.4} />
            <Text style={styles.eyebrowText}>LEADER-ONLY VIEW</Text>
          </View>
          <Text style={styles.headline}>
            Channel <Text style={styles.headlineAccent}>oversight.</Text>
          </Text>
          <Text style={styles.lede}>
            What you can see and do in Hawk Patrol that scouts can't. All actions are
            logged.
          </Text>

          <View style={styles.statsRow}>
            {STATS.map((s) => (
              <View key={s.label} style={[styles.stat, { borderTopColor: s.color }]}>
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionLabel}>MODERATION</Text>
          {TOOLS.map((t, i) => (
            <Pressable
              key={t.label}
              style={[
                styles.toolRow,
                i < TOOLS.length - 1 && {
                  borderBottomColor: palette.lineSoft,
                  borderBottomWidth: 1,
                },
              ]}
            >
              <View style={[styles.toolIcon, { backgroundColor: `${t.color}22` }]}>
                <Icon name={t.icon} size={18} color={t.color} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.toolLabel}>{t.label}</Text>
                <Text style={styles.toolSub}>{t.sub}</Text>
              </View>
              <Icon name="chevron" size={16} color={palette.inkMuted} strokeWidth={2} />
            </Pressable>
          ))}

          <View style={styles.ypt}>
            <View style={styles.yptHeader}>
              <Icon name="shield" size={14} color={palette.success} strokeWidth={2.2} />
              <Text style={styles.yptTitle}>YPT compliance</Text>
            </View>
            <Text style={styles.yptText}>
              Two-deep is automatic. Mr. Avery and Mr. Brooks are both on this
              channel. Removing either adult auto-suspends the channel until
              restored.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.sm,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crumb: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    color: palette.primary,
    fontWeight: '600',
  },
  body: { paddingHorizontal: spacing.screen, paddingTop: spacing.lg },
  eyebrowPill: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: palette.raspberry,
    marginBottom: spacing.sm,
  },
  eyebrowText: {
    fontFamily: fontFamilies.ui,
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 1.4,
  },
  headline: {
    fontFamily: fontFamilies.display,
    fontSize: 32,
    color: palette.ink,
    letterSpacing: -0.6,
    lineHeight: 34,
    marginBottom: 6,
  },
  headlineAccent: {
    fontStyle: 'italic',
    backgroundColor: palette.accent,
  },
  lede: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.inkSoft,
    lineHeight: 18,
    marginBottom: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: spacing.lg,
  },
  stat: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: palette.line,
    borderTopWidth: 3,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: fontFamilies.display,
    fontSize: 22,
    color: palette.ink,
  },
  statLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 10,
    color: palette.inkMuted,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  sectionLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: spacing.sm,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  toolIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    fontWeight: '700',
    color: palette.ink,
  },
  toolSub: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    marginTop: 2,
  },
  ypt: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: `${palette.success}12`,
    borderWidth: 1,
    borderColor: `${palette.success}55`,
    borderRadius: radius.card,
  },
  yptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  yptTitle: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    fontWeight: '700',
    color: palette.success,
    letterSpacing: 0.6,
  },
  yptText: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkSoft,
    lineHeight: 17,
  },
});

export default LeaderOversightScreen;
