// Message bubble used in the patrol thread and event channel screens.
// Supports left/right alignment, leader role badges (raspberry-tinted
// name), inline reactions, and an optional photo attachment.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar, Photo } from '../theme/atoms';
import { fontFamilies, palette, radius, spacing } from '../theme/tokens';

export type MessageReaction = {
  emoji: string;
  count: number;
};

export type MessageBubbleProps = {
  side: 'left' | 'right';
  who: string;
  text?: string;
  timestamp: string;
  // Visual emphasis for leader posts (raspberry name + role badge).
  isLeader?: boolean;
  role?: string;
  age?: number;
  avatarColor?: string;
  avatarInitials?: string;
  reactions?: MessageReaction[];
  // Optional photo attachment in place of (or beside) text.
  photoSubject?: 'forest' | 'campfire' | 'canoe' | 'troop' | 'summit';
  photoCaption?: string;
  // YPT meta lines (e.g. "↳ Mr. Brooks added by auto-cc")
  isMeta?: boolean;
};

export function MessageBubble(props: MessageBubbleProps) {
  const {
    side,
    who,
    text,
    timestamp,
    isLeader = false,
    role,
    age,
    avatarColor = palette.primary,
    avatarInitials,
    reactions,
    photoSubject,
    photoCaption,
    isMeta = false,
  } = props;

  if (isMeta) {
    return (
      <View style={styles.metaWrap}>
        <Text style={styles.metaText}>↳ {who}{role ? ` (${role})` : ''} added by YPT auto-cc</Text>
      </View>
    );
  }

  const initials = avatarInitials ?? who
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const isRight = side === 'right';

  return (
    <View style={[styles.row, isRight ? styles.rowRight : styles.rowLeft]}>
      {!isRight ? (
        <Avatar
          initials={initials}
          size={32}
          bg={avatarColor}
          style={{ marginTop: 14 }}
        />
      ) : null}
      <View style={{ maxWidth: '76%' }}>
        {!isRight ? (
          <View style={styles.nameLine}>
            <Text style={[styles.name, isLeader ? { color: palette.raspberry } : null]}>
              {who}
            </Text>
            {isLeader && role ? (
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{role}</Text>
              </View>
            ) : null}
            {typeof age === 'number' ? (
              <Text style={styles.ageNote}>· age {age}</Text>
            ) : null}
          </View>
        ) : null}

        {photoSubject ? (
          <View>
            <Photo subject={photoSubject} width={220} height={180} rounded={radius.sheet} />
            {photoCaption ? <Text style={styles.photoCaption}>{photoCaption}</Text> : null}
          </View>
        ) : (
          <View
            style={[
              styles.bubble,
              isRight ? styles.bubbleRight : styles.bubbleLeft,
            ]}
          >
            <Text style={[styles.text, isRight ? styles.textRight : styles.textLeft]}>
              {text}
            </Text>
          </View>
        )}

        {reactions && reactions.length > 0 ? (
          <View style={styles.reactions}>
            {reactions.map((r, i) => (
              <View key={i} style={styles.reactionPill}>
                <Text style={styles.reactionText}>{r.emoji} {r.count}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text
          style={[
            styles.timestamp,
            { textAlign: isRight ? 'right' : 'left' },
          ]}
        >
          {timestamp}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: spacing.md,
  },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
    marginLeft: 12,
  },
  name: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: '700',
    color: palette.inkSoft,
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
  ageNote: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
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
  text: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    lineHeight: 20,
  },
  textLeft: { color: palette.ink },
  textRight: { color: '#ffffff' },
  reactions: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
    marginLeft: 8,
  },
  reactionPill: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  reactionText: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkSoft,
    fontWeight: '500',
  },
  timestamp: {
    fontFamily: fontFamilies.ui,
    fontSize: 10,
    color: palette.inkMuted,
    marginTop: 3,
    marginHorizontal: 12,
  },
  photoCaption: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkSoft,
    fontStyle: 'italic',
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  metaWrap: {
    alignItems: 'center',
    marginVertical: spacing.xs,
  },
  metaText: {
    fontFamily: fontFamilies.ui,
    fontSize: 10,
    color: palette.success,
    fontStyle: 'italic',
  },
});
