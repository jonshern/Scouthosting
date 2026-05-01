// In-app support screen. Files a SupportTicket via POST /api/v1/support
// and shows a one-line confirmation. Reachable from Profile → Help.
//
// Categories mirror the web /help form so super-admin triage stays
// uniform across surfaces.

import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../state/AuthContext";
import { fontFamilies, palette, radius, spacing } from "../theme/tokens";
import { submitSupportTicket } from "../api/dashboard";

const CATEGORIES: { value: string; label: string }[] = [
  { value: "question", label: "Question" },
  { value: "bug", label: "Something broken" },
  { value: "billing", label: "Billing" },
  { value: "abuse", label: "Safety" },
  { value: "feature", label: "Feature request" },
];

export default function SupportScreen() {
  const auth = useAuth();
  const [category, setCategory] = useState("question");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);

  async function send() {
    if (!auth.session) return;
    if (!subject.trim() || !body.trim()) {
      Alert.alert("Almost there", "We need a subject and a description.");
      return;
    }
    setBusy(true);
    try {
      const res = await submitSupportTicket(
        { orgSlug: auth.session.orgSlug, token: auth.session.token },
        {
          subject: subject.trim(),
          body: body.trim(),
          category,
          orgId: auth.session.orgId,
        },
      );
      setTicketId(res.id);
      setSubject("");
      setBody("");
    } catch (e: unknown) {
      Alert.alert("Couldn't send", e instanceof Error ? e.message : "Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  if (ticketId) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.confirmWrap}>
          <Text style={styles.confirmTitle}>
            We <Text style={styles.confirmAccent}>got it.</Text>
          </Text>
          <Text style={styles.confirmBody}>
            A Compass operator will reply to you within one business day. For urgent youth-safety
            concerns, contact your council directly — we're software, not the BSA.
          </Text>
          <Text style={styles.confirmRef}>Reference: {ticketId}</Text>
          <Pressable style={styles.cta} onPress={() => setTicketId(null)}>
            <Text style={styles.ctaLabel}>Send another</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.headline}>How can we help?</Text>
          <Text style={styles.lede}>
            Tell us what's going on and a Compass operator will reply by email.
          </Text>

          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.categoryRow}>
            {CATEGORIES.map((c) => {
              const active = c.value === category;
              return (
                <Pressable
                  key={c.value}
                  onPress={() => setCategory(c.value)}
                  style={[
                    styles.categoryChip,
                    active && {
                      backgroundColor: palette.primary,
                      borderColor: palette.primary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryChipLabel,
                      active && { color: "#fff" },
                    ]}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>Subject</Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="Short summary"
            placeholderTextColor={palette.inkMuted}
            style={styles.input}
            maxLength={200}
          />

          <Text style={styles.fieldLabel}>What's going on?</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            placeholder="Steps, what you expected, screenshots if you can attach them by email after."
            placeholderTextColor={palette.inkMuted}
            style={[styles.input, styles.bodyInput]}
            maxLength={5000}
          />

          <Pressable
            style={[styles.cta, busy && { opacity: 0.6 }]}
            onPress={send}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaLabel}>Send to Compass support</Text>
            )}
          </Pressable>

          <Text style={styles.hint}>
            We don't track IPs or device IDs. Your email address goes on the ticket so we can
            reply.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  content: { padding: spacing.screen, paddingBottom: 80 },
  headline: {
    fontFamily: fontFamilies.display,
    fontSize: 32,
    letterSpacing: -0.6,
    color: palette.ink,
  },
  lede: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    color: palette.inkMuted,
    marginTop: 8,
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: palette.inkMuted,
    marginTop: spacing.lg,
    marginBottom: 8,
  },
  categoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: palette.line,
    backgroundColor: palette.surface,
  },
  categoryChipLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    fontWeight: "600",
    color: palette.ink,
  },
  input: {
    fontFamily: fontFamilies.ui,
    fontSize: 15,
    color: palette.ink,
    backgroundColor: palette.surface,
    borderWidth: 1.5,
    borderColor: palette.line,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bodyInput: {
    minHeight: 140,
    textAlignVertical: "top",
  },
  cta: {
    marginTop: spacing.xl,
    backgroundColor: palette.primary,
    paddingVertical: 14,
    borderRadius: radius.cardLg,
    alignItems: "center",
  },
  ctaLabel: {
    fontFamily: fontFamilies.ui,
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  hint: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkMuted,
    marginTop: spacing.md,
    textAlign: "center",
  },
  confirmWrap: { flex: 1, padding: spacing.screen, justifyContent: "center" },
  confirmTitle: {
    fontFamily: fontFamilies.display,
    fontSize: 44,
    letterSpacing: -1,
    color: palette.ink,
  },
  confirmAccent: {
    fontStyle: "italic",
    backgroundColor: palette.accent,
  },
  confirmBody: {
    fontFamily: fontFamilies.ui,
    fontSize: 15,
    color: palette.inkSoft,
    marginTop: spacing.md,
    lineHeight: 22,
  },
  confirmRef: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkMuted,
    marginTop: spacing.lg,
  },
});
