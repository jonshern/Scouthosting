// Channels list — wired to the live JSON API. Pulls visible channels
// for the active org, groups them by kind, and renders the same
// ChannelRow component the design scaffold uses. Pull-to-refresh
// re-fetches; suspended channels surface inline so members understand
// why posting is paused.

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ChannelRow } from '../../components/ChannelRow';
import { fontFamilies, palette, spacing } from '../../theme/tokens';
import type { ChatStackParamList } from '../../navigation/types';
import { useAuth } from '../../state/AuthContext';
import { listChannels } from '../../api/channels';
import type { ChannelDto, ChannelKind } from '../../api/types';

type Section = { title: string; kind: ChannelKind | 'leaders'; items: ChannelDto[] };

const KIND_META: Record<ChannelKind, { color: string; glyph: string }> = {
  patrol: { color: palette.sky, glyph: 'P' },
  troop: { color: palette.primary, glyph: 'T' },
  parents: { color: palette.ember, glyph: '👪' },
  leaders: { color: palette.raspberry, glyph: 'L' },
  event: { color: palette.plum, glyph: '📅' },
  custom: { color: palette.butter, glyph: '#' },
};

function summarizeLast(c: ChannelDto): string {
  if (c.archivedAt) return 'archived';
  if (c.isSuspended) return `paused (${(c.suspendedReason || 'YPT compliance').replace(/-/g, ' ')})`;
  return 'tap to open';
}

export default function ChannelsListScreen() {
  const nav = useNavigation<NativeStackNavigationProp<ChatStackParamList>>();
  const auth = useAuth();
  const [channels, setChannels] = useState<ChannelDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  if (auth.state.status !== 'signed-in') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.empty}><Text style={styles.emptyText}>Sign in to see your channels.</Text></View>
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

  // Group + order: troop first, parents, leaders, then per-kind.
  const sections: Section[] = [];
  const byKind = new Map<ChannelKind, ChannelDto[]>();
  for (const c of channels || []) {
    if (!byKind.has(c.kind)) byKind.set(c.kind, []);
    byKind.get(c.kind)!.push(c);
  }
  const pushIf = (title: string, kind: ChannelKind) => {
    const items = byKind.get(kind);
    if (items && items.length) sections.push({ title, kind, items });
  };
  pushIf('All members', 'troop');
  pushIf('Parents', 'parents');
  pushIf('Leaders only', 'leaders');
  pushIf('Patrol channels', 'patrol');
  pushIf('Event channels', 'event');
  pushIf('Custom', 'custom');

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Chat</Text>
        <Text style={styles.subtitle}>{auth.state.activeOrg.orgName}</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.screen }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {sections.length === 0 ? (
          <Text style={styles.emptyText}>No channels yet. Ask a leader to provision the standing channels.</Text>
        ) : null}

        {sections.map((sec) => (
          <View key={sec.kind} style={styles.section}>
            <Text style={styles.sectionTitle}>{sec.title}</Text>
            {sec.items.map((ch, j) => {
              const meta = KIND_META[ch.kind];
              return (
                <View
                  key={ch.id}
                  style={
                    j < sec.items.length - 1
                      ? { borderBottomColor: palette.lineSoft, borderBottomWidth: 1 }
                      : undefined
                  }
                >
                  <ChannelRow
                    name={ch.name}
                    memberSummary={ch.kind === 'patrol' && ch.patrolName ? `${ch.patrolName} patrol` : ch.kind}
                    lastMessage={summarizeLast(ch)}
                    timestamp=""
                    color={meta.color}
                    glyph={meta.glyph}
                    unread={0}
                    twoDeep={ch.kind === 'patrol' || ch.kind === 'troop'}
                    isEvent={ch.kind === 'event'}
                    isLeaderOnly={ch.kind === 'leaders'}
                    onPress={() => nav.navigate('Thread', { channelId: ch.id, channelName: ch.name })}
                  />
                </View>
              );
            })}
          </View>
        ))}

        <Text style={styles.footnote}>
          Channels are auto-created from your roster. YPT-suspended channels are read-only
          until two YPT-current adult leaders are members again.
        </Text>
      </ScrollView>
    </SafeAreaView>
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
  },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: 32,
    color: palette.ink,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkMuted,
    marginTop: 2,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
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
  section: { marginBottom: spacing.lg },
  sectionTitle: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: '700',
    color: palette.inkMuted,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  footnote: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkMuted,
    marginTop: spacing.lg,
    textAlign: 'center',
    lineHeight: 18,
  },
});
