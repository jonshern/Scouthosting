// Poll embedded in a chat thread. Renders horizontal-fill bars per
// option, marks the option the user voted for, and shows total count
// + deadline.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '../theme/atoms';
import { fontFamilies, palette, radius, spacing } from '../theme/tokens';

export type PollOption = {
  label: string;
  count: number;
  color: string;
  picked?: boolean;
};

export type PollCardProps = {
  question: string;
  options: PollOption[];
  deadline: string;
  totalVoters: number;
  voterPool: number;
};

export function PollCard({ question, options, deadline, totalVoters, voterPool }: PollCardProps) {
  const total = options.reduce((sum, o) => sum + o.count, 0) || 1;
  const picked = options.find((o) => o.picked);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Icon name="sparkles" size={14} color={palette.primary} strokeWidth={2.2} />
        <Text style={styles.eyebrow}>POLL · {deadline}</Text>
      </View>
      <Text style={styles.question}>{question}</Text>

      {options.map((o, i) => {
        const pct = (o.count / total) * 100;
        return (
          <View
            key={i}
            style={[
              styles.option,
              { borderColor: o.picked ? o.color : palette.line },
            ]}
          >
            <View style={[styles.optionFill, { width: `${pct}%`, backgroundColor: `${o.color}33` }]} />
            <View style={styles.optionRow}>
              <View style={styles.optionLeft}>
                {o.picked ? (
                  <View style={[styles.checkmark, { backgroundColor: o.color }]}>
                    <Icon name="check" size={10} color="#fff" strokeWidth={3} />
                  </View>
                ) : null}
                <Text style={[styles.optionLabel, o.picked ? styles.optionLabelPicked : null]}>
                  {o.label}
                </Text>
              </View>
              <Text style={styles.optionCount}>{o.count}</Text>
            </View>
          </View>
        );
      })}

      <Text style={styles.footer}>
        {totalVoters} of {voterPool} voted
        {picked ? ` · you picked ${picked.label}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.cardLg,
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  eyebrow: {
    fontFamily: fontFamilies.ui,
    fontSize: 10,
    fontWeight: '700',
    color: palette.primary,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
  },
  question: {
    fontFamily: fontFamilies.display,
    fontSize: 19,
    color: palette.ink,
    lineHeight: 23,
    marginBottom: spacing.md,
    fontStyle: 'italic',
  },
  option: {
    position: 'relative',
    borderWidth: 1,
    borderRadius: radius.input,
    marginBottom: 8,
    overflow: 'hidden',
  },
  optionFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  optionRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  checkmark: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.ink,
    fontWeight: '500',
    flexShrink: 1,
  },
  optionLabelPicked: {
    fontWeight: '700',
  },
  optionCount: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkSoft,
    fontWeight: '700',
  },
  footer: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    marginTop: 8,
  },
});
