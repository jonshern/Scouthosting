// Event detail — high fidelity. Hero, key facts, per-scout RSVP rows
// (one parent → multiple kids), permission slip toggle, payment
// summary, and a primary call-to-action.

import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Icon, Photo } from '../theme/atoms';
import { fontFamilies, palette, radius, spacing } from '../theme/tokens';

type RsvpChoice = 'yes' | 'no' | 'maybe' | null;

type Scout = {
  id: string;
  name: string;
  detail: string;
  initials: string;
};

const SCOUTS: Scout[] = [
  { id: 'sam', name: 'Sam', detail: 'Scout · Hawk Patrol', initials: 'S' },
  { id: 'max', name: 'Max', detail: 'Scout · Hawk Patrol', initials: 'M' },
];

const FACTS: { label: string; value: string }[] = [
  { label: 'When', value: 'Fri Mar 21, 5:30 PM —\nSun Mar 23, 11:00 AM' },
  { label: 'Where', value: 'Birch Lake State Park\n19041 County Hwy 7' },
  { label: 'Cost', value: '$35 per scout · covers food & site' },
  {
    label: 'Bring',
    value: 'Class B uniform, sleeping bag rated 30°F, mess kit, water bottle',
  },
];

export function EventDetailScreen() {
  const [rsvps, setRsvps] = useState<Record<string, RsvpChoice>>({
    sam: 'yes',
    max: null,
  });
  const [slipsSigned, setSlipsSigned] = useState<Record<string, boolean>>({});

  const totalDue = SCOUTS.filter((s) => rsvps[s.id] === 'yes').length * 35;

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {/* Hero */}
        <View style={styles.heroWrap}>
          <Photo subject="forest" width="100%" height={220} rounded={0} showCaption={false} />
          <View style={styles.heroOverlay} />
          <Pressable style={styles.backButton}>
            <Icon name="chevronLeft" size={20} color={palette.ink} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.heroText}>
            <Text style={styles.heroEyebrow}>OUTING · 2 NIGHTS</Text>
            <Text style={styles.heroTitle}>
              Spring Campout —{'\n'}
              <Text style={styles.heroTitleAccent}>Birch Lake.</Text>
            </Text>
          </View>
        </View>

        {/* Key facts */}
        <View style={styles.facts}>
          {FACTS.map((row, i) => (
            <View
              key={row.label}
              style={[
                styles.factRow,
                i > 0 && { borderTopWidth: 1, borderTopColor: palette.lineSoft },
              ]}
            >
              <Text style={styles.factLabel}>{row.label.toUpperCase()}</Text>
              <Text style={styles.factValue}>{row.value}</Text>
            </View>
          ))}
        </View>

        {/* RSVP per scout */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>RSVP FOR</Text>
          {SCOUTS.map((s) => {
            const choice = rsvps[s.id] ?? null;
            return (
              <View key={s.id} style={styles.scoutCard}>
                <Avatar
                  initials={s.initials}
                  size={40}
                  bg={`${palette.primary}22`}
                  fg={palette.primary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.scoutName}>{s.name}</Text>
                  <Text style={styles.scoutDetail}>{s.detail}</Text>
                </View>
                <View style={styles.choiceRow}>
                  {(['yes', 'no', 'maybe'] as const).map((c) => {
                    const active = choice === c;
                    const labelMap = { yes: 'Yes', no: 'No', maybe: 'Maybe' };
                    return (
                      <Pressable
                        key={c}
                        onPress={() =>
                          setRsvps((prev) => ({ ...prev, [s.id]: c }))
                        }
                        style={[
                          styles.choice,
                          active && c === 'yes' && {
                            backgroundColor: palette.success,
                            borderColor: palette.success,
                          },
                          active && c === 'maybe' && {
                            backgroundColor: palette.ember,
                            borderColor: palette.ember,
                          },
                          active && c === 'no' && {
                            backgroundColor: palette.danger,
                            borderColor: palette.danger,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.choiceText,
                            active && { color: '#ffffff' },
                          ]}
                        >
                          {labelMap[c]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}

          {/* Permission slip toggles */}
          <View style={styles.slipBlock}>
            <Text style={styles.slipTitle}>Permission slip</Text>
            <Text style={styles.slipSub}>
              One slip per scout. We pre-fill what we know; sign with your finger and
              we countersign before departure.
            </Text>
            {SCOUTS.map((s) => (
              <View key={s.id} style={styles.slipRow}>
                <Text style={styles.slipName}>{s.name}</Text>
                <Pressable
                  onPress={() =>
                    setSlipsSigned((prev) => ({
                      ...prev,
                      [s.id]: !prev[s.id],
                    }))
                  }
                  style={[
                    styles.toggle,
                    slipsSigned[s.id] && { backgroundColor: palette.success },
                  ]}
                >
                  <View
                    style={[
                      styles.toggleKnob,
                      slipsSigned[s.id] && { left: 22 },
                    ]}
                  />
                </Pressable>
              </View>
            ))}
          </View>

          {/* Payment summary */}
          <View style={styles.paymentBlock}>
            <View style={styles.paymentHeader}>
              <Icon name="bell" size={18} color={palette.ember} strokeWidth={2} />
              <Text style={styles.paymentTitle}>
                Permission slip + ${totalDue} due Thursday
              </Text>
            </View>
            <Text style={styles.paymentDetail}>
              {SCOUTS.filter((s) => rsvps[s.id] === 'yes').length} scout(s) confirmed.
              Card on file: Visa ending 4242.
            </Text>
            <Pressable style={styles.cta}>
              <Text style={styles.ctaText}>Sign &amp; pay ${totalDue} →</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  heroWrap: { height: 220, position: 'relative' },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,19,13,0.45)',
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { position: 'absolute', bottom: 16, left: 20, right: 20 },
  heroEyebrow: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: palette.accent,
    marginBottom: 6,
  },
  heroTitle: {
    fontFamily: fontFamilies.display,
    fontSize: 28,
    lineHeight: 32,
    color: '#ffffff',
    letterSpacing: -0.4,
  },
  heroTitleAccent: {
    fontStyle: 'italic',
    color: palette.accent,
  },
  facts: {
    paddingHorizontal: spacing.screen,
    paddingVertical: spacing.lg,
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
  },
  factRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    gap: spacing.lg,
  },
  factLabel: {
    width: 70,
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    fontWeight: '700',
    letterSpacing: 1.0,
    paddingTop: 2,
  },
  factValue: {
    flex: 1,
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    lineHeight: 20,
    color: palette.ink,
  },
  section: {
    paddingHorizontal: spacing.screen,
    paddingVertical: spacing.lg,
  },
  sectionLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: spacing.md,
  },
  scoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.card,
    marginBottom: spacing.sm,
  },
  scoutName: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    fontWeight: '700',
    color: palette.ink,
  },
  scoutDetail: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 6,
  },
  choice: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.cardSm,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
  },
  choiceText: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: '700',
    color: palette.inkSoft,
  },
  slipBlock: {
    marginTop: spacing.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  slipTitle: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    fontWeight: '700',
    color: palette.ink,
    marginBottom: 4,
  },
  slipSub: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkSoft,
    lineHeight: 16,
    marginBottom: spacing.md,
  },
  slipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  slipName: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    color: palette.ink,
    fontWeight: '500',
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
  paymentBlock: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: `${palette.ember}14`,
    borderWidth: 1,
    borderColor: `${palette.ember}55`,
    borderRadius: radius.card,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  paymentTitle: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    fontWeight: '700',
    color: palette.ink,
  },
  paymentDetail: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkSoft,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  cta: {
    backgroundColor: palette.primary,
    borderRadius: radius.input,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});

export default EventDetailScreen;
