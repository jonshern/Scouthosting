// Sign-in landing for unauthenticated mobile users. The user enters
// their unit's subdomain (e.g. "troop12"); we kick off the
// /auth/mobile/begin flow on that org's host.
//
// Visually mirrors the Compass design (Forest & Ember tokens, oversized
// italic headline). Form is intentionally narrow — the heavy lifting
// happens in the in-app browser.

import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { fontFamilies, palette, radius, spacing } from "../theme/tokens";
import { useAuth } from "../state/AuthContext";

export default function SignInScreen() {
  const auth = useAuth();
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    const cleaned = slug.trim().toLowerCase();
    if (!cleaned) {
      Alert.alert("Need your unit's address", "Enter just the subdomain — e.g. \"troop12\".");
      return;
    }
    setBusy(true);
    try {
      await auth.signIn(cleaned);
    } catch (e: any) {
      Alert.alert(
        "Couldn't sign in",
        e?.message?.includes("not_a_member")
          ? "This account isn't on the unit roster yet. Ask a leader to add you."
          : e?.message?.includes("cancelled")
            ? "Sign-in was cancelled."
            : "Something went wrong reaching that unit. Double-check the address and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <View style={styles.body}>
          <Text style={styles.kicker}>Compass</Text>
          <Text style={styles.headline}>
            Sign in to your <Text style={styles.italic}>unit.</Text>
          </Text>
          <Text style={styles.lede}>
            Enter your unit's web address — we'll bounce you through the browser to sign in,
            then bring you back here.
          </Text>

          <Text style={styles.label}>Your unit's site</Text>
          <View style={styles.suffixRow}>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              keyboardType="url"
              placeholder="troop100"
              placeholderTextColor={palette.inkMuted}
              style={styles.input}
              value={slug}
              onChangeText={setSlug}
              editable={!busy}
              onSubmitEditing={onSubmit}
            />
            <View style={styles.suffix}>
              <Text style={styles.suffixText}>.compass.app</Text>
            </View>
          </View>

          <Pressable
            onPress={onSubmit}
            disabled={busy || !slug.trim()}
            style={({ pressed }) => [
              styles.cta,
              (busy || !slug.trim()) && styles.ctaDisabled,
              pressed && styles.ctaPressed,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={palette.bg} />
            ) : (
              <Text style={styles.ctaText}>Continue →</Text>
            )}
          </Pressable>

          <Text style={styles.fine}>
            Don't have a site? Visit compass.app on your laptop to set one up first.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  flex: { flex: 1 },
  body: { flex: 1, padding: spacing.xl, justifyContent: "center" },
  kicker: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.6,
    color: palette.primary,
    marginBottom: spacing.md,
  },
  headline: {
    fontFamily: fontFamilies.display,
    fontSize: 40,
    color: palette.ink,
    lineHeight: 44,
    marginBottom: spacing.md,
  },
  italic: {
    fontStyle: "italic",
    color: palette.primary,
  },
  lede: {
    fontFamily: fontFamilies.ui,
    fontSize: 15,
    color: palette.inkSoft,
    lineHeight: 22,
    marginBottom: spacing.xxl,
  },
  label: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    fontWeight: "600",
    color: palette.ink,
    marginBottom: spacing.sm,
  },
  suffixRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: spacing.lg,
  },
  input: {
    flex: 1,
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.input,
    borderBottomLeftRadius: radius.input,
    borderWidth: 1.5,
    borderColor: palette.line,
    borderRightWidth: 0,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    fontFamily: fontFamilies.ui,
    fontSize: 15,
    color: palette.ink,
  },
  suffix: {
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    backgroundColor: palette.lineSoft,
    borderTopRightRadius: radius.input,
    borderBottomRightRadius: radius.input,
    borderWidth: 1.5,
    borderColor: palette.line,
    borderLeftWidth: 0,
  },
  suffixText: {
    fontFamily: fontFamilies.display,
    fontSize: 14,
    color: palette.inkSoft,
  },
  cta: {
    backgroundColor: palette.ink,
    borderRadius: radius.input,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  ctaDisabled: { opacity: 0.5 },
  ctaPressed: { backgroundColor: palette.primaryHover },
  ctaText: {
    fontFamily: fontFamilies.ui,
    fontSize: 15,
    fontWeight: "600",
    color: palette.bg,
  },
  fine: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkMuted,
    textAlign: "center",
    marginTop: spacing.lg,
  },
});
