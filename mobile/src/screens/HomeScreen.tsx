// Home screen — the next event, a few counts (unread chats, what's
// coming up, permission slips waiting on you), recent posts and the
// rest of the upcoming events. Data from /api/v1/orgs/:orgId/dashboard
// and /api/v1/me/scouts. Pull-to-refresh, friendly error.

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Avatar, Icon, IconName } from '../theme/atoms';
import { EventCard } from '../components/EventCard';
import { useAuth } from '../state/AuthContext';
import { fetchDashboard, greetingFor, type DashboardModel } from '../api/dashboard';
import { fetchMyScouts, type MyScout } from '../api/scouts';
import { fontFamilies, palette, radius, spacing } from '../theme/tokens';
import type { HomeStackParamList } from '../navigation/types';

type HomeNav = NativeStackNavigationProp<HomeStackParamList, 'HomeRoot'>;

const MONTH_SHORT = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

type QuickAction = { label: string; tint: string; icon: IconName; onPress: () => void };

export function HomeScreen() {
  const auth = useAuth();
  const navigation = useNavigation<HomeNav>();
  const [model, setModel] = useState<DashboardModel | null>(null);
  const [scouts, setScouts] = useState<MyScout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!auth.session) return;
    setError(null);
    try {
      const client = { orgSlug: auth.session.orgSlug, token: auth.session.token };
      const [m, mine] = await Promise.all([
        fetchDashboard(client, auth.session.orgId),
        // Slips are a nice-to-have on this screen; don't fail it over them.
        fetchMyScouts(client).catch(() => ({ scouts: [] as MyScout[], emailVerified: false })),
      ]);
      setModel(m);
      setScouts(mine.scouts.filter((sc) => sc.orgId === auth.session?.orgId));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't load the home view.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [auth.session]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  if (loading && !model) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}><ActivityIndicator color={palette.primary} /></View>
      </SafeAreaView>
    );
  }
  if (error || !model) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.errorText}>{error || "Couldn't load the home view."}</Text>
          <Pressable style={styles.retry} onPress={load}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const nextEvent = model.upcomingEvents[0] || null;
  const laterEvents = model.upcomingEvents.slice(1);
  const slipsToSign = scouts.flatMap((sc) =>
    sc.upcoming
      .filter((u) => u.requiresPermissionSlip && !u.slipSigned)
      .map((u) => ({ scoutName: sc.scoutName, ...u })),
  );
  const quickActions: QuickAction[] = [
    {
      label: 'RSVP\nnext event',
      tint: palette.accent,
      icon: 'check',
      onPress: () => nextEvent && navigation.navigate('EventDetail', { eventId: nextEvent.id }),
    },
    {
      label: 'See\nactivity',
      tint: palette.ember,
      icon: 'pin',
      onPress: () => navigation.navigate('Activity'),
    },
    {
      label: 'Open\ncalendar',
      tint: palette.teal,
      icon: 'calendar',
      onPress: () => navigation.getParent()?.navigate('Calendar'),
    },
  ];

  const { day: greeting, phase } = greetingFor(new Date());
  const initials = (auth.session?.displayName || auth.session?.email || 'U')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.greeting}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dateLabel}>{greeting}</Text>
            <Text style={styles.heroLine}>
              <Text style={styles.heroAccent}>{phase}.</Text>
            </Text>
            <Text style={styles.heroSub}>{summaryLine(model, slipsToSign.length)}</Text>
          </View>
          <Avatar initials={initials} size={44} bg={palette.primary} />
        </View>

        {nextEvent ? (
          <Pressable onPress={() => navigation.navigate('EventDetail', { eventId: nextEvent.id })}>
            <EventCard
              variant="next"
              month={MONTH_SHORT[new Date(nextEvent.startsAt).getMonth()]!}
              day={String(new Date(nextEvent.startsAt).getDate()).padStart(2, '0')}
              title={nextEvent.title}
              subtitle={eventWhen(nextEvent.startsAt) + (nextEvent.location ? ` · ${nextEvent.location}` : '')}
              warning={nextEvent.signupRequired ? 'Sign-up needed' : undefined}
              style={{ marginBottom: spacing.xxl }}
            />
          </Pressable>
        ) : (
          <View style={styles.emptyEvent}>
            <Text style={styles.emptyEventText}>No upcoming events.</Text>
          </View>
        )}

        <View style={styles.actionsGrid}>
          {quickActions.map((a) => (
            <Pressable key={a.label} onPress={a.onPress} style={styles.actionTile}>
              <View style={[styles.actionIcon, { backgroundColor: a.tint }]}>
                <Icon name={a.icon} size={18} color={palette.ink} strokeWidth={2.2} />
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.statsRow}>
          {[
            { label: 'UNREAD CHATS', value: model.unreadChannels, color: palette.primary, onPress: () => navigation.getParent()?.navigate('Chat') },
            { label: 'COMING UP', value: model.upcomingEvents.length, color: palette.teal, onPress: () => navigation.getParent()?.navigate('Calendar') },
            { label: 'SLIPS TO SIGN', value: slipsToSign.length, color: slipsToSign.length ? palette.ember : palette.inkMuted, onPress: undefined },
          ].map((stat) => (
            <Pressable key={stat.label} onPress={stat.onPress} disabled={!stat.onPress} style={[styles.statCard, { borderTopColor: stat.color }]}>
              <Text style={[styles.statLabel, { color: stat.color }]}>{stat.label}</Text>
              <Text style={styles.statValue}>{String(stat.value)}</Text>
            </Pressable>
          ))}
        </View>

        {slipsToSign.length > 0 && (
          <View style={{ marginBottom: spacing.xxl }}>
            <Text style={[styles.sectionLabel, { marginBottom: spacing.md }]}>NEEDS YOUR SIGNATURE</Text>
            {slipsToSign.map((u, i) => (
              <Pressable
                key={`${u.eventId}-${u.scoutName}-${i}`}
                onPress={() => navigation.navigate('EventDetail', { eventId: u.eventId })}
                style={styles.activityRow}
              >
                <View style={[styles.activityIcon, { backgroundColor: `${palette.ember}22` }]}>
                  <Icon name="flag" size={18} color={palette.ember} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityTitle}>
                    <Text style={{ fontWeight: '700' }}>{u.scoutName}</Text>{' '}
                    <Text style={{ color: palette.inkSoft }}>· {u.title}</Text>
                  </Text>
                  <Text style={styles.activitySub}>{eventWhen(u.startsAt)} · permission slip</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {laterEvents.length > 0 && (
          <View style={{ marginBottom: spacing.xxl }}>
            <Text style={[styles.sectionLabel, { marginBottom: spacing.md }]}>ALSO COMING UP</Text>
            {laterEvents.map((e) => (
              <EventCard
                key={e.id}
                month={MONTH_SHORT[new Date(e.startsAt).getMonth()]!}
                day={String(new Date(e.startsAt).getDate()).padStart(2, '0')}
                title={e.title}
                subtitle={eventWhen(e.startsAt) + (e.location ? ` · ${e.location}` : '')}
                onPress={() => navigation.navigate('EventDetail', { eventId: e.id })}
                style={{ marginBottom: spacing.sm }}
              />
            ))}
          </View>
        )}

        <Pressable
          onPress={() => navigation.navigate('Activity')}
          style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: spacing.md }}
        >
          <Text style={styles.sectionLabel}>RECENT POSTS</Text>
          <Text style={{ fontFamily: fontFamilies.ui, fontSize: 12, color: palette.primary, fontWeight: '600' }}>
            See all →
          </Text>
        </Pressable>
        {model.recentPosts.length === 0 ? (
          <Text style={styles.muted}>No posts yet.</Text>
        ) : (
          model.recentPosts.map((p, i) => (
            <Pressable
              key={p.id}
              onPress={() => navigation.navigate('Activity')}
              style={[
                styles.activityRow,
                i < model.recentPosts.length - 1 && { borderBottomColor: palette.lineSoft, borderBottomWidth: 1 },
              ]}
            >
              <View style={[styles.activityIcon, { backgroundColor: `${palette.primary}22` }]}>
                <Icon name="pin" size={18} color={palette.primary} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.activityTitle}>{p.title || 'Untitled post'}</Text>
                <Text style={styles.activitySub}>{relativeTime(p.publishedAt)}</Text>
              </View>
            </Pressable>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function summaryLine(model: DashboardModel, slips: number): string {
  const parts: string[] = [];
  const e = model.upcomingEvents[0];
  if (e) {
    const d = new Date(e.startsAt).toLocaleString('en-US', { month: 'short', day: 'numeric' });
    parts.push(`Next up · ${e.title} on ${d}`);
  }
  if (slips) parts.push(`${slips} permission slip${slips === 1 ? '' : 's'} to sign`);
  if (!parts.length) parts.push('A quiet week. Nothing on the calendar yet.');
  return parts.join(' · ');
}

function eventWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 14) return `${day}d ago`;
  return new Date(iso).toLocaleDateString('en-US');
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  content: { paddingHorizontal: spacing.screen, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  errorText: { fontFamily: fontFamilies.ui, color: palette.danger, fontSize: 14 },
  retry: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: palette.primary,
  },
  retryText: { fontFamily: fontFamilies.ui, color: palette.primary, fontWeight: '600' },
  greeting: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  dateLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkMuted,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  heroLine: {
    fontFamily: fontFamilies.display,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.8,
    color: palette.ink,
  },
  heroAccent: {
    fontStyle: 'italic',
    color: palette.primary,
  },
  heroSub: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    lineHeight: 18,
    color: palette.inkSoft,
    marginTop: 6,
  },
  emptyEvent: {
    padding: spacing.lg,
    backgroundColor: palette.surface,
    borderWidth: 1.5,
    borderColor: palette.line,
    borderRadius: radius.cardLg,
    borderStyle: 'dashed',
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  emptyEventText: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    color: palette.inkMuted,
  },
  actionsGrid: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xxl },
  actionTile: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: palette.line,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.input,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    fontWeight: '700',
    color: palette.ink,
    textAlign: 'center',
    lineHeight: 14,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xxl,
  },
  statCard: {
    flexBasis: '30%',
    flexGrow: 1,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderTopWidth: 4,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  statValue: {
    fontFamily: fontFamilies.display,
    fontSize: 28,
    color: palette.ink,
    letterSpacing: -0.4,
  },
  statHint: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkSoft,
    marginTop: 4,
  },
  sectionLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  muted: { fontFamily: fontFamilies.ui, fontSize: 13, color: palette.inkMuted },
  activityRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityTitle: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    color: palette.ink,
    lineHeight: 18,
  },
  activitySub: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    marginTop: 2,
  },
});

export default HomeScreen;
