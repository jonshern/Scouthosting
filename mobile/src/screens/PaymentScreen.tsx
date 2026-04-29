// Payment screen — medium fidelity. Stripe-style summary, line items
// per scout, processing fee disclosed, Apple Pay default.
//
// TODO(backend): wire to Stripe PaymentSheet and confirmPayment intent.

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '../theme/atoms';
import { fontFamilies, palette, radius, spacing } from '../theme/tokens';

const LINE_ITEMS = [
  { label: 'Sam — campout fee', value: '$35.00', muted: false },
  { label: 'Max — campout fee', value: '$35.00', muted: false },
  { label: 'Processing fee', value: '$2.33', muted: true },
];

export function PaymentScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.headerRow}>
          <Pressable style={styles.iconBtn}>
            <Icon name="chevronLeft" size={18} color={palette.ink} strokeWidth={2.4} />
          </Pressable>
          <Text style={styles.step}>Step 2 of 2</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.body}>
          <Text style={styles.eyebrow}>SPRING CAMPOUT · BIRCH LAKE</Text>
          <Text style={styles.headline}>
            Pay <Text style={styles.headlineAccent}>$72.33</Text> to confirm.
          </Text>

          <View style={styles.summary}>
            {LINE_ITEMS.map((row, i) => (
              <View
                key={row.label}
                style={[
                  styles.lineItem,
                  i < LINE_ITEMS.length - 1 && {
                    borderBottomColor: palette.lineSoft,
                    borderBottomWidth: 1,
                  },
                ]}
              >
                <Text
                  style={[styles.lineLabel, row.muted && { color: palette.inkMuted }]}
                >
                  {row.label}
                </Text>
                <Text
                  style={[styles.lineValue, row.muted && { color: palette.inkMuted }]}
                >
                  {row.value}
                </Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>$72.33</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>PAYMENT</Text>
          <View style={styles.cardRow}>
            <View style={styles.cardChip}>
              <Text style={styles.cardChipText}>VISA</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardName}>Visa ending 4242</Text>
              <Text style={styles.cardDetail}>Default · expires 09/28</Text>
            </View>
            <Icon name="chevron" size={16} color={palette.inkMuted} strokeWidth={2} />
          </View>
          <Text style={styles.disclaimer}>
            Powered by Stripe · receipts emailed to alex@example.com
          </Text>

          <Pressable style={styles.payBtn}>
            <Text style={styles.payBtnText}>Pay $72.33</Text>
          </Pressable>
          <Pressable style={styles.applePay}>
            <Text style={styles.applePayText}>Pay with Apple Pay</Text>
          </Pressable>
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.sm,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  step: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkMuted,
    fontWeight: '600',
  },
  body: {
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.lg,
  },
  eyebrow: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: palette.primary,
    marginBottom: 6,
  },
  headline: {
    fontFamily: fontFamilies.display,
    fontSize: 30,
    color: palette.ink,
    letterSpacing: -0.6,
    lineHeight: 32,
    marginBottom: spacing.lg,
  },
  headlineAccent: {
    fontStyle: 'italic',
    backgroundColor: palette.accent,
  },
  summary: {
    backgroundColor: palette.surface,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: palette.line,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  lineLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.ink,
  },
  lineValue: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.ink,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    borderTopWidth: 1.5,
    borderTopColor: palette.ink,
    marginTop: 4,
  },
  totalLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    fontWeight: '700',
    color: palette.ink,
  },
  totalValue: {
    fontFamily: fontFamilies.display,
    fontSize: 24,
    color: palette.ink,
  },
  sectionLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: '700',
    color: palette.inkMuted,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.cardLg,
    padding: spacing.md,
  },
  cardChip: {
    width: 44,
    height: 30,
    borderRadius: 5,
    backgroundColor: '#1a1f36',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardChipText: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 1.2,
  },
  cardName: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    fontWeight: '700',
    color: palette.ink,
  },
  cardDetail: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
  },
  disclaimer: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: spacing.lg,
  },
  payBtn: {
    backgroundColor: palette.primary,
    paddingVertical: 16,
    borderRadius: radius.cardLg,
    alignItems: 'center',
  },
  payBtnText: {
    fontFamily: fontFamilies.ui,
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  applePay: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  applePayText: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.inkSoft,
    fontWeight: '500',
  },
});

export default PaymentScreen;
