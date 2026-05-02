// Channels list — restructured to the mobile-chat.jsx layout from the
// design handoff. Adds a sticky title + search field, groups by Your /
// Event / Leader-only sections, and replaces the previous ChannelRow
// with an inline row that shows the channel emoji-block, the
// member-count subline, and a TWO-DEEP badge for youth channels. The
// data source is unchanged (GET /channels) and pull-to-refresh still
// re-fetches.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Icon } from '../../theme/atoms';
import { fontFamilies, palette, radius, spacing } from '../../theme/tokens';
import type { ChatStackParamList } from '../../navigation/types';
import { useAuth } from '../../state/AuthContext';
import { listChannels } from '../../api/channels';
import type { ChannelDto, ChannelKind } from '../../api/types';

type SectionKey = 'yours' | 'events' | 'leaders';
type Section = { key: SectionKey; title: string; items: ChannelDto[] };

type KindMeta = { color: string; glyph: string };

const KIND_META: Record<ChannelKind, KindMeta> = {
  patrol: { color: palette.accent, glyph: '🦅' },
  troop: { color: palette.primary, glyph: '★' },
  parents: { color: palette.plum, glyph: '👥' },
  leaders: { color: palette.raspberry, glyph: '🔒' },
  event: { color: palette.ember, glyph: '⛺' },
  custom: { color: palette.teal, glyph: '#' },
};

function memberSummary(c: ChannelDto): string {
  switch (c.kind) {
    case 'patrol':
      return c.patrolName ? `${c.patrolName} patrol` : 'Patrol channel';
    case 'troop':
      return 'All members · scouts, leaders, parents';
    case 'parents':
      return 'Parents only';
    case 'leaders':
      return 'Leaders only · YPT-current adults';
    case 'event':
      return 'Event channel · auto-archives at end';
    case 'custom':
    default:
      return 'Custom channel';
  }
}

function lastMessageStub(c: ChannelDto): string {
  if (c.archivedAt) return 'archived';
  if (c.isSuspended) {
    return `paused (${(c.suspendedReason || 'YPT compliance').replace(/-/g, ' ')})`;
  }
  return 'tap to open';
}

export default function ChannelsListScreen() {
  const nav = useNavigation<NativeStackNavigationProp<ChatStackParamList>>();
  const auth = useAuth();
  const [channels, setChannels] = useState<ChannelDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const client = auth.client();
    if (!client || auth.state.status !== 'signed-in') return;
    try {
      const data = await listChannels(client, auth.state.activeOrg.orgId);
      setChannels(data.channels);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Could not load channels.');
    }
  }, [auth]);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const sections = useMemo<Section[]>(() => {
    const list = channels || [];
    const filtered = query
      ? list.filter((c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          (c.patrolName || '').toLowerCase().includes(query.toLowerCase()),
        )
      : list;
    const yours: ChannelDto[] = [];
    const events: ChannelDto[] = [];
    const leaders: ChannelDto[] = [];
    for (const c of filtered) {
      if (c.kind === 'event') events.push(c);
      else if (c.kind === 'leaders') leaders.push(c);
      else yours.push(c);
    }
    const out: Section[] = [];
    if (yours.length) out.push({ key: 'yours', title: 'Your channels', items: yours });
    if (events.length) out.push({ key: 'events', title: 'Event channels', items: events });
    if (leaders.length) out.push({ key: 'leaders', title: 'Leader-only', items: leaders });
    return out;
  }, [channels, query]);

  if (auth.state.status !== 'signed-in') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Sign in to see your channels.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (channels === null && !error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}><ActivityIndicator color={palette.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Chat</Text>
          <View style={styles.composeBtn}>
            <Icon name="plus" size={16} color="#fff" strokeWidth={2.5} />
          </View>
        </View>
        <View style={styles.searchBox}>
          <Icon name="search" size={14} color={palette.inkMuted} strokeWidth={2} />
          <TextInput
            placeholder="Search channels & messages"
            placeholderTextColor={palette.inkMuted}
            value={query}
            onChangeText={setQuery}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
        }
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {sections.length === 0 ? (
          <Text style={styles.emptyText}>
            {query
              ? `No channels match "${query}".`
              : 'No channels yet. Ask a leader to provision the standing channels.'}
          </Text>
        ) : null}

        {sections.map((sec) => (
          <View key={sec.key} style={styles.section}>
            <Text style={styles.sectionTitle}>{sec.title}</Text>
            {sec.items.map((ch, j) => (
              <ChannelListRow
                key={ch.id}
                channel={ch}
                isLast={j === sec.items.length - 1}
                onPress={() =>
                  nav.navigate('Thread', { channelId: ch.id, channelName: ch.name })
                }
              />
            ))}
          </View>
        ))}

        <Text style={styles.footnote}>
          Channels are auto-created from your roster. Leaders see every channel by YPT policy.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ChannelListRow({
  channel,
  isLast,
  onPress,
}: {
  channel: ChannelDto;
  isLast: boolean;
  onPress: () => void;
}) {
  const meta = KIND_META[channel.kind];
  const isYouth = channel.kind === 'patrol' || channel.kind === 'troop' || channel.kind === 'event';
  const isEvent = channel.kind === 'event';
  const isLeader = channel.kind === 'leaders';
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.row,
        !isLast && {
          borderBottomColor: palette.lineSoft,
          borderBottomWidth: 1,
        },
      ]}
    >
      <View style={[styles.iconBlock, { backgroundColor: meta.color }]}>
        <Text style={styles.glyph}>{meta.glyph}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.headerLine}>
          <View style={styles.nameLine}>
            <Text style={styles.name} numberOfLines={1}>
              {channel.name}
            </Text>
            {isEvent ? (
              <View style={styles.eventTag}>
                <Text style={styles.eventTagText}>EVENT</Text>
              </View>
            ) : null}
            {isLeader ? <Icon name="lock" size={11} color={palette.raspberry} /> : null}
          </View>
        </View>
        <Text style={styles.member}>{memberSummary(channel)}</Text>
        <View style={styles.subline}>
          {isYouth && !channel.isSuspended ? (
            <View style={styles.twoDeep}>
              <Icon name="check" size={9} color={palette.success} strokeWidth={3} />
              <Text style={styles.twoDeepText}>TWO-DEEP</Text>
            </View>
          ) : null}
          <Text style={styles.lastMessage} numberOfLines={1}>
            {lastMessageStub(channel)}
          </Text>
        </View>
      </View>
    </Pressable>
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
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.ink,
    padding: 0,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.screen },
  emptyText: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    color: palette.inkMuted,
    textAlign: 'center',
  },
  error: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.danger,
    marginBottom: spacing.md,
  },
  list: {
    paddingBottom: spacing.lg,
  },
  section: {
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.md,
  },
  sectionTitle: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: '700',
    color: palette.inkMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
    alignItems: 'flex-start',
  },
  iconBlock: {
    width: 44,
    height: 44,
    borderRadius: radius.cardLg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    color: '#ffffff',
    fontFamily: fontFamilies.ui,
    fontWeight: '700',
    fontSize: 18,
  },
  headerLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  name: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    fontWeight: '600',
    color: palette.ink,
    flexShrink: 1,
  },
  member: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    marginTop: 1,
  },
  subline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  twoDeep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: `${palette.success}1f`,
    borderRadius: radius.chip,
  },
  twoDeepText: {
    fontFamily: fontFamilies.ui,
    fontSize: 9,
    fontWeight: '700',
    color: palette.success,
    letterSpacing: 0.6,
  },
  lastMessage: {
    flex: 1,
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.inkSoft,
  },
  eventTag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: `${palette.accent}33`,
    borderRadius: radius.chip,
  },
  eventTagText: {
    fontFamily: fontFamilies.ui,
    fontSize: 9,
    fontWeight: '700',
    color: palette.accent,
    letterSpacing: 0.4,
  },
  footnote: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.screen,
  },
});
