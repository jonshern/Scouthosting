// Photo permissions — medium fidelity. Per-scout privacy toggles.
//
// TODO(backend): persist toggles to /api/photo-permissions/:scoutId
// and apply blur via on-device pipeline + server-side fallback.

import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Icon } from '../theme/atoms';
import { fontFamilies, palette, radius, spacing } from '../theme/tokens';

type Scout = { id: string; name: string; detail: string; initials: string };

const SCOUTS: Scout[] = [
  { id: 'sam', name: 'Sam', detail: 'Hawk Patrol · age 14', initials: 'S' },
  { id: 'max', name: 'Max', detail: 'Hawk Patrol · age 12', initials: 'M' },
];

const RULES = [
  { key: 'public', label: 'Show on public troop site', sub: 'compass.app/troop12' },
  { key: 'parents', label: 'Show in parent-only feed', sub: 'Visible to verified families' },
  { key: 'tagging', label: 'Allow tagging by name', sub: 'Leaders can tag scout in captions' },
  { key: 'blur', label: 'Auto-blur face on public', sub: 'Recommended for non-public' },
] as const;

type RuleKey = typeof RULES[number]['key'];

export function PhotoPermissionsScreen() {
  const [state, setState] = useState<Record<string, Record<RuleKey, boolean>>>({
    sam: { public: true, parents: true, tagging: true, blur: false },
    max: { public: false, parents: true, tagging: false, blur: true },
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.headerRow}>
          <Pressable style={styles.iconBtn}>
            <Icon name="chevronLeft" size={18} color={palette.ink} strokeWidth={2.4} />
          </Pressable>
          <Text style={styles.crumb}>Settings</Text>
        </View>

        <View style={styles.body}>
          <Text style={styles.eyebrow}>PRIVACY</Text>
          <Text style={styles.headline}>
            Photo <Text style={styles.headlineAccent}>permissions.</Text>
          </Text>
          <Text style={styles.lede}>
            Set what is allowed for each scout in your family. These rules apply
            everywhere — public site, parent feed, and any leader exports.
          </Text>

          {SCOUTS.map((s) => (
            <View key={s.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Avatar
                  initials={s.initials}
                  size={40}
                  bg={`${palette.primary}22`}
                  fg={palette.primary}
                />
                <View>
                  <Text style={styles.scoutName}>{s.name}</Text>
                  <Text style={styles.scoutDetail}>{s.detail}</Text>
                </View>
              </View>

              {RULES.map((r, i) => {
                const on = state[s.id]?.[r.key] ?? false;
                return (
                  <View
                    key={r.key}
                    style={[
                      styles.row,
                      i < RULES.length - 1 && {
                        borderBottomColor: palette.lineSoft,
                        borderBottomWidth: 1,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ruleLabel}>{r.label}</Text>
                      <Text style={styles.ruleSub}>{r.sub}</Text>
                    </View>
                    <Pressable
                      onPress={() =>
                        setState((prev) => ({
                          ...prev,
                          [s.id]: {
                            ...(prev[s.id] ?? {
                              public: false,
                              parents: false,
                              tagging: false,
                              blur: false,
                            }),
                            [r.key]: !on,
                          },
                        }))
                      }
                      style={[
                        styles.toggle,
                        on && { backgroundColor: palette.success },
                      ]}
                    >
                      <View style={[styles.toggleKnob, on && { left: 22 }]} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))}

          <View style={styles.callout}>
            <View style={styles.calloutHeader}>
              <Icon name="bell" size={14} color={palette.ember} strokeWidth={2.2} />
              <Text style={styles.calloutTitle}>Per-photo override</Text>
            </View>
            <Text style={styles.calloutText}>
              Long-press any photo to request a blur or removal. Leaders are notified
              within an hour.
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
  eyebrow: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.primary,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginBottom: 6,
  },
  headline: {
    fontFamily: fontFamilies.display,
    fontSize: 32,
    color: palette.ink,
    letterSpacing: -0.6,
    lineHeight: 34,
    marginBottom: 8,
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
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: palette.line,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.md,
    borderBottomColor: palette.lineSoft,
    borderBottomWidth: 1,
  },
  scoutName: {
    fontFamily: fontFamilies.ui,
    fontSize: 15,
    fontWeight: '700',
    color: palette.ink,
  },
  scoutDetail: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  ruleLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    fontWeight: '500',
    color: palette.ink,
  },
  ruleSub: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    marginTop: 2,
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: palette.line,
    position: 'relative',
  },
  toggleKnob: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ffffff',
  },
  callout: {
    marginTop: spacing.md,
    backgroundColor: `${palette.ember}14`,
    borderColor: `${palette.ember}55`,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  calloutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  calloutTitle: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    fontWeight: '700',
    color: palette.ink,
  },
  calloutText: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkSoft,
    lineHeight: 17,
  },
});

export default PhotoPermissionsScreen;
