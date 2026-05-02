// Patrol / troop thread screen — wired to the live JSON API. Fetches
// the channel + last 50 messages, polls every 5s for new ones (SSE
// replaces this in PR D), and surfaces server-reported state for the
// suspended-channel banner. The composer is hidden when canPost=false
// (suspended or archived channels).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '../../theme/atoms';
import { MessageBubble } from '../../components/MessageBubble';
import { fontFamilies, palette, radius, spacing } from '../../theme/tokens';
import type { ChatStackParamList } from '../../navigation/types';
import { useAuth } from '../../state/AuthContext';
import { getChannel, sendMessage, toggleReaction, votePoll, setRsvpResponse } from '../../api/channels';
import type { RsvpResponse } from '../../api/types';
import { ApiError } from '../../api/client';
import type { ChannelDto, ChannelKind, MessageDto } from '../../api/types';

const POLL_INTERVAL_MS = 5000;

const CHANNEL_GLYPH: Record<ChannelKind, { color: string; glyph: string }> = {
  patrol: { color: palette.accent, glyph: '🦅' },
  troop: { color: palette.primary, glyph: '★' },
  parents: { color: palette.plum, glyph: '👥' },
  leaders: { color: palette.raspberry, glyph: '🔒' },
  event: { color: palette.ember, glyph: '⛺' },
  custom: { color: palette.teal, glyph: '#' },
};

function channelMemberSummary(c: ChannelDto): string {
  switch (c.kind) {
    case 'patrol':
      return c.patrolName ? `${c.patrolName} patrol · two-deep` : 'Patrol channel';
    case 'troop':
      return 'All troop members';
    case 'parents':
      return 'Parents only';
    case 'leaders':
      return 'Leaders only · YPT-current';
    case 'event':
      return 'Event channel · auto-archives at end';
    case 'custom':
    default:
      return 'Custom channel';
  }
}

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderReactions(m: MessageDto, onReact: (id: string, emoji: string) => void) {
  return (
    <View style={chatStyles.reactionsRow}>
      {m.reactions.map((r) => (
        <Pressable
          key={r.emoji}
          onPress={() => onReact(m.id, r.emoji)}
          style={({ pressed }) => [
            chatStyles.reactionChip,
            r.youReacted && chatStyles.reactionChipMine,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={chatStyles.reactionEmoji}>{r.emoji}</Text>
          <Text style={chatStyles.reactionCount}>{r.count}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function renderPhoto(m: MessageDto, hostBaseUrl: string) {
  if (m.attachment?.kind !== 'photo') return null;
  const p = m.attachment;
  if (p.deleted) {
    return (
      <View style={chatStyles.photoDeleted}>
        <Text style={chatStyles.photoDeletedText}>📷 (photo removed)</Text>
      </View>
    );
  }
  const src = p.url.startsWith('http') ? p.url : hostBaseUrl + p.url;
  // We use a JSX <Image> from react-native here; the styling lets it
  // scale to its intrinsic aspect ratio while capping width.
  const Image = require('react-native').Image;
  const aspect = p.width && p.height ? p.width / p.height : 4 / 3;
  return (
    <View style={chatStyles.photoBlock}>
      <Image source={{ uri: src }} style={[chatStyles.photoImg, { aspectRatio: aspect }]} />
      {p.caption ? <Text style={chatStyles.photoCaption}>{p.caption}</Text> : null}
    </View>
  );
}

function renderRsvp(m: MessageDto, onRsvp: (id: string, response: RsvpResponse) => void) {
  if (m.attachment?.kind !== 'rsvp') return null;
  const e = m.attachment;
  if (e.deleted) {
    return (
      <View style={[chatStyles.rsvpCard, chatStyles.rsvpCardDeleted]}>
        <Text style={chatStyles.rsvpTitle}>🗓 Event removed</Text>
        <Text style={chatStyles.rsvpMeta}>The original event was deleted.</Text>
      </View>
    );
  }
  const start = new Date(e.startsAt);
  const dateLine =
    start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' +
    start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const my = e.myResponse;
  const Btn = ({ resp, label, glyph }: { resp: RsvpResponse; label: string; glyph: string }) => {
    const mine = my === resp;
    return (
      <Pressable
        onPress={() => onRsvp(m.id, resp)}
        style={({ pressed }) => [
          chatStyles.rsvpBtn,
          mine && chatStyles.rsvpBtnMine,
          pressed && { opacity: 0.85 },
        ]}
      >
        <Text style={chatStyles.rsvpGlyph}>{glyph}</Text>
        <Text style={[chatStyles.rsvpLabel, mine && chatStyles.rsvpLabelMine]}>{label}</Text>
        <Text style={[chatStyles.rsvpCount, mine && chatStyles.rsvpCountMine]}>{e.tally[resp] || 0}</Text>
      </Pressable>
    );
  };
  return (
    <View style={chatStyles.rsvpCard}>
      <Text style={chatStyles.rsvpTitle}>🗓 {e.title}</Text>
      <Text style={chatStyles.rsvpMeta}>
        {dateLine}
        {e.location ? ' · ' + e.location : ''}
        {e.cost ? ' · $' + e.cost : ''}
      </Text>
      <View style={chatStyles.rsvpActions}>
        <Btn resp="yes" label="Going" glyph="✅" />
        <Btn resp="maybe" label="Maybe" glyph="🤔" />
        <Btn resp="no" label="Can't" glyph="🚫" />
      </View>
    </View>
  );
}

function renderPoll(m: MessageDto, onVote: (id: string, optionId: string) => void) {
  if (m.attachment?.kind !== 'poll') return null;
  const p = m.attachment;
  const total = p.options.reduce((s, o) => s + o.count, 0);
  const closed = p.closesAt && new Date(p.closesAt) < new Date();
  return (
    <View style={chatStyles.pollCard}>
      <Text style={chatStyles.pollQuestion}>📊 {p.question}</Text>
      {p.options.map((o) => {
        const pct = total ? Math.round((o.count / total) * 100) : 0;
        return (
          <Pressable
            key={o.id}
            disabled={!!closed}
            onPress={() => onVote(m.id, o.id)}
            style={({ pressed }) => [
              chatStyles.pollOption,
              o.youVoted && chatStyles.pollOptionMine,
              pressed && { opacity: 0.85 },
            ]}
          >
            <View style={[chatStyles.pollBar, { width: `${pct}%` }, o.youVoted && chatStyles.pollBarMine]} />
            <Text style={chatStyles.pollLabel}>{o.label}</Text>
            <Text style={chatStyles.pollCount}>{o.count}</Text>
          </Pressable>
        );
      })}
      <Text style={chatStyles.pollMeta}>
        {total} vote{total === 1 ? '' : 's'}
        {closed ? ' · closed' : p.closesAt ? ` · closes ${new Date(p.closesAt).toLocaleString()}` : ''}
        {p.allowMulti ? ' · multi-select' : ''}
      </Text>
    </View>
  );
}

function initialsFor(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() || '')
      .join('') || '·'
  );
}

export default function ThreadScreen() {
  const route = useRoute<RouteProp<ChatStackParamList, 'Thread'>>();
  const auth = useAuth();
  const [channel, setChannel] = useState<ChannelDto | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  const channelId = route.params.channelId;
  const myUserId = auth.state.status === 'signed-in' ? auth.state.profile.userId : null;
  // Host base for photo URLs — server returns "/uploads/<filename>"
  // (relative); prepend the active org's host so <Image> can resolve it.
  const hostBaseUrl = auth.state.status === 'signed-in'
    ? `https://${auth.state.activeOrg.orgSlug}.${process.env.EXPO_PUBLIC_COMPASS_APEX || 'compass.app'}`
    : '';

  const refresh = useCallback(async () => {
    const client = auth.client();
    if (!client) return;
    try {
      const data = await getChannel(client, channelId);
      setChannel(data.channel);
      setMessages(data.messages);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Could not load thread.');
    }
  }, [auth, channelId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Lightweight polling. SSE in PR D replaces this with sub-second push.
  useEffect(() => {
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // Auto-scroll to the bottom when the message list grows.
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    return () => clearTimeout(t);
  }, [messages.length]);

  const onSend = useCallback(async () => {
    const client = auth.client();
    const body = draft.trim();
    if (!client || !body || !channel) return;
    setSending(true);
    try {
      const r = await sendMessage(client, channel.id, body);
      setMessages((prev) => [...prev, r.message]);
      setDraft('');
    } catch (e: any) {
      if (e instanceof ApiError && e.code === 'channel_suspended') {
        setError('Channel is paused — a leader needs to restore two-deep before posts can land.');
      } else {
        setError(e?.message || 'Could not send.');
      }
      void refresh();
    } finally {
      setSending(false);
    }
  }, [auth, draft, channel, refresh]);

  // Tap a reaction bucket to toggle. SSE re-broadcast updates the row;
  // here we also patch the local copy in case polling is racing.
  const onReact = useCallback(async (messageId: string, emoji: string) => {
    const client = auth.client();
    if (!client) return;
    try {
      const r = await toggleReaction(client, messageId, emoji);
      setMessages((prev) => prev.map((mm) => (mm.id === r.message.id ? r.message : mm)));
    } catch {
      void refresh();
    }
  }, [auth, refresh]);

  const onVote = useCallback(async (messageId: string, optionId: string) => {
    const client = auth.client();
    if (!client) return;
    try {
      const r = await votePoll(client, messageId, optionId);
      setMessages((prev) => prev.map((mm) => (mm.id === r.message.id ? r.message : mm)));
    } catch {
      void refresh();
    }
  }, [auth, refresh]);

  const onRsvp = useCallback(async (messageId: string, response: RsvpResponse) => {
    const client = auth.client();
    if (!client) return;
    try {
      const r = await setRsvpResponse(client, messageId, response);
      setMessages((prev) => prev.map((mm) => (mm.id === r.message.id ? r.message : mm)));
    } catch {
      void refresh();
    }
  }, [auth, refresh]);

  if (!channel && !error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}><ActivityIndicator color={palette.primary} /></View>
      </SafeAreaView>
    );
  }

  const canPost = channel?.canPost ?? false;
  const youthChannel = !!channel && (channel.kind === 'patrol' || channel.kind === 'troop' || channel.kind === 'event');
  const meta = channel ? CHANNEL_GLYPH[channel.kind] : { color: palette.primary, glyph: '#' };
  const pinned = useMemo(
    () => messages.filter((m) => m.pinned && !m.deleted).slice(-1)[0] || null,
    [messages],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: meta.color }]}>
          <Text style={styles.headerGlyph}>{meta.glyph}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>
            {channel?.name || route.params.channelName}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {channel ? channelMemberSummary(channel) : 'Loading…'}
          </Text>
        </View>
      </View>

      {channel?.isSuspended ? (
        <View style={styles.suspendBanner}>
          <Icon name="lock" size={12} color={palette.danger} />
          <Text style={styles.suspendBannerText}>
            <Text style={{ fontWeight: '700' }}>Suspended</Text>
            {' · '}
            {(channel.suspendedReason || 'YPT compliance').replace(/-/g, ' ')}
          </Text>
        </View>
      ) : youthChannel ? (
        <View style={styles.twoDeepBanner}>
          <Icon name="check" size={12} color={palette.success} strokeWidth={3} />
          <Text style={styles.twoDeepBannerText}>
            <Text style={styles.twoDeepBannerStrong}>TWO-DEEP</Text>
            <Text style={styles.twoDeepBannerSoft}> · leaders are watching · scouts can chat freely</Text>
          </Text>
        </View>
      ) : null}

      {pinned ? (
        <View style={styles.pinBanner}>
          <Icon name="pin" size={14} color={palette.ember} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.pinTitle} numberOfLines={1}>
              Pinned: {pinned.body || 'attachment'}
            </Text>
            <Text style={styles.pinMeta} numberOfLines={1}>
              {pinned.author?.displayName || 'Leader'} · tap to view
            </Text>
          </View>
          <Icon name="chevron" size={12} color={palette.inkMuted} />
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {messages.length === 0 ? (
            <Text style={styles.empty}>No messages yet — say hello.</Text>
          ) : null}
          {messages.map((m) => {
            const isMine = !!m.author && myUserId === m.author.id;
            const isSystem = !m.author;
            return (
              <View key={m.id}>
                <MessageBubble
                  side={isMine ? 'right' : 'left'}
                  who={m.author?.displayName || 'system'}
                  text={m.deleted ? '(deleted)' : (m.body || '')}
                  timestamp={fmtTimestamp(m.createdAt)}
                  isMeta={isSystem}
                  avatarInitials={initialsFor(m.author?.displayName || 'S')}
                />
                {m.attachment?.kind === 'poll' ? renderPoll(m, onVote) : null}
                {m.attachment?.kind === 'rsvp' ? renderRsvp(m, onRsvp) : null}
                {m.attachment?.kind === 'photo' ? renderPhoto(m, hostBaseUrl) : null}
                {m.reactions.length > 0 || !m.deleted ? renderReactions(m, onReact) : null}
              </View>
            );
          })}
        </ScrollView>

        {canPost ? (
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              placeholder="Type a message…"
              placeholderTextColor={palette.inkMuted}
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={10000}
              editable={!sending}
            />
            <Pressable
              onPress={onSend}
              disabled={sending || !draft.trim()}
              style={({ pressed }) => [
                styles.sendBtn,
                (sending || !draft.trim()) && styles.sendBtnDisabled,
                pressed && styles.sendBtnPressed,
              ]}
            >
              {sending ? (
                <ActivityIndicator color={palette.bg} />
              ) : (
                <Text style={styles.sendText}>Send</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <View style={styles.lockedNote}>
            <Text style={styles.lockedText}>
              {channel?.archivedAt
                ? 'This channel has been archived.'
                : 'Posting is paused for now.'}
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    backgroundColor: palette.surface,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerGlyph: {
    color: '#fff',
    fontFamily: fontFamilies.ui,
    fontSize: 16,
    fontWeight: '700',
  },
  title: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    fontWeight: '600',
    color: palette.ink,
  },
  subtitle: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    marginTop: 1,
  },
  twoDeepBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    backgroundColor: `${palette.success}14`,
    borderBottomWidth: 1,
    borderBottomColor: `${palette.success}33`,
  },
  twoDeepBannerText: {
    flex: 1,
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.success,
  },
  twoDeepBannerStrong: { fontWeight: '700' },
  twoDeepBannerSoft: { color: palette.inkSoft, fontWeight: '500' },
  suspendBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    backgroundColor: `${palette.danger}14`,
    borderBottomWidth: 1,
    borderBottomColor: `${palette.danger}33`,
  },
  suspendBannerText: {
    flex: 1,
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.danger,
  },
  pinBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    backgroundColor: `${palette.butter}24`,
    borderBottomWidth: 1,
    borderBottomColor: `${palette.butter}55`,
  },
  pinTitle: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    fontWeight: '600',
    color: palette.ink,
  },
  pinMeta: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkSoft,
    marginTop: 1,
  },
  scrollContent: {
    padding: spacing.screen,
    gap: spacing.md,
  },
  empty: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    color: palette.inkMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  error: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.danger,
    backgroundColor: palette.raspberrySoft,
    padding: spacing.sm,
    borderRadius: radius.cardSm,
    marginBottom: spacing.md,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  composer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopColor: palette.line,
    borderTopWidth: 1,
    backgroundColor: palette.surface,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    color: palette.ink,
    backgroundColor: palette.bg,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: palette.line,
  },
  sendBtn: {
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    backgroundColor: palette.ink,
    borderRadius: radius.input,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnPressed: { backgroundColor: palette.primaryHover },
  sendText: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    fontWeight: '600',
    color: palette.bg,
  },
  lockedNote: {
    padding: spacing.lg,
    backgroundColor: palette.surface,
    borderTopColor: palette.line,
    borderTopWidth: 1,
  },
  lockedText: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.inkMuted,
    textAlign: 'center',
  },
});

const chatStylesBase = StyleSheet.create({
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: spacing.lg,
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: palette.lineSoft,
    borderWidth: 1,
    borderColor: palette.line,
  },
  reactionChipMine: {
    backgroundColor: palette.accentSoft,
    borderColor: palette.accent,
  },
  reactionEmoji: { fontSize: 13 },
  reactionCount: {
    fontSize: 11,
    color: palette.inkSoft,
    fontFamily: fontFamilies.ui,
    fontVariant: ['tabular-nums'],
  },
  pollCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.cardSm,
  },
  pollQuestion: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    fontWeight: '600',
    color: palette.ink,
    marginBottom: spacing.sm,
  },
  pollOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.cardSm,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.lineSoft,
    marginBottom: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  pollOptionMine: {
    borderColor: palette.accent,
    backgroundColor: palette.accentSoft,
  },
  pollBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(200, 233, 74, 0.3)',
  },
  pollBarMine: {
    backgroundColor: 'rgba(200, 233, 74, 0.55)',
  },
  pollLabel: {
    flex: 1,
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.ink,
  },
  pollCount: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkSoft,
    fontVariant: ['tabular-nums'],
    minWidth: 20,
    textAlign: 'right',
  },
  pollMeta: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    marginTop: 4,
  },
});

const rsvpStyles = StyleSheet.create({
  rsvpCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.cardSm,
  },
  rsvpCardDeleted: {
    backgroundColor: palette.lineSoft,
  },
  rsvpTitle: {
    fontFamily: fontFamilies.display,
    fontSize: 17,
    color: palette.ink,
  },
  rsvpMeta: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkSoft,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  rsvpActions: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  rsvpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: palette.lineSoft,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.line,
  },
  rsvpBtnMine: {
    backgroundColor: palette.accentSoft,
    borderColor: palette.accent,
  },
  rsvpGlyph: { fontSize: 14 },
  rsvpLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.ink,
  },
  rsvpLabelMine: {
    color: palette.primary,
    fontWeight: '600',
  },
  rsvpCount: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkSoft,
    fontVariant: ['tabular-nums'],
  },
  rsvpCountMine: { color: palette.primary },
});

const photoStyles = StyleSheet.create({
  photoBlock: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    maxWidth: 360,
  },
  photoImg: {
    width: '100%',
    borderRadius: radius.cardSm,
    borderWidth: 1,
    borderColor: palette.line,
  },
  photoCaption: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkSoft,
    marginTop: 4,
  },
  photoDeleted: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.sm,
    backgroundColor: palette.lineSoft,
    borderRadius: radius.cardSm,
    borderWidth: 1,
    borderColor: palette.line,
    borderStyle: 'dashed',
  },
  photoDeletedText: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.inkMuted,
    fontStyle: 'italic',
  },
});

// chatStyles bundles the three categories so TS infers all keys
// without Object.assign() (which silently loses the merged keys'
// types). RN style props accept either registry IDs or plain
// objects, so the spread works the same at runtime.
const chatStyles = { ...chatStylesBase, ...rsvpStyles, ...photoStyles };
