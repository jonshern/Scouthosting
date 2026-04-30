// Patrol / troop thread screen — wired to the live JSON API. Fetches
// the channel + last 50 messages, polls every 5s for new ones (SSE
// replaces this in PR D), and surfaces server-reported state for the
// suspended-channel banner. The composer is hidden when canPost=false
// (suspended or archived channels).

import React, { useCallback, useEffect, useRef, useState } from 'react';
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

import { MessageBubble } from '../../components/MessageBubble';
import { fontFamilies, palette, radius, spacing } from '../../theme/tokens';
import type { ChatStackParamList } from '../../navigation/types';
import { useAuth } from '../../state/AuthContext';
import { getChannel, sendMessage } from '../../api/channels';
import { ApiError } from '../../api/client';
import type { ChannelDto, MessageDto } from '../../api/types';

const POLL_INTERVAL_MS = 5000;

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

  if (!channel && !error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}><ActivityIndicator color={palette.primary} /></View>
      </SafeAreaView>
    );
  }

  const canPost = channel?.canPost ?? false;
  const youthChannel = !!channel && (channel.kind === 'patrol' || channel.kind === 'troop' || channel.kind === 'event');

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>{channel?.name || route.params.channelName}</Text>
        {channel?.isSuspended ? (
          <Text style={styles.suspended}>
            ⏸ Suspended — {(channel.suspendedReason || 'YPT compliance').replace(/-/g, ' ')}
          </Text>
        ) : youthChannel ? (
          <Text style={styles.twoDeep}>🛡 Two-deep watching</Text>
        ) : null}
      </View>

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
              <MessageBubble
                key={m.id}
                side={isMine ? 'right' : 'left'}
                who={m.author?.displayName || 'system'}
                text={m.deleted ? '(deleted)' : (m.body || '')}
                timestamp={fmtTimestamp(m.createdAt)}
                isMeta={isSystem}
                avatarInitials={initialsFor(m.author?.displayName || 'S')}
              />
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
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
  },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: 22,
    color: palette.ink,
    letterSpacing: -0.4,
  },
  suspended: {
    marginTop: 4,
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.danger,
    fontWeight: '600',
  },
  twoDeep: {
    marginTop: 4,
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.success,
    fontWeight: '600',
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
