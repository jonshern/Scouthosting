// Sign-in landing for unauthenticated mobile users. The mobile app is
// org-agnostic at sign-in: tapping "Sign in" opens
// https://compass.app/auth/mobile/begin in an in-app browser. The
// browser flow handles email + password and OAuth (Google, Apple); on
// success the apex server redirects to compass://auth/callback?token=...
// and the app fetches /api/v1/auth/me to discover the user's orgs.
//
// Visually mirrors the Compass design (Forest & Ember tokens, oversized
// italic headline). One button — the heavy lifting happens in the
// in-app browser.

import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { fontFamilies, palette, radius, spacing } from "../theme/tokens";
import { useAuth } from "../state/AuthContext";

export default function SignInScreen() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setBusy(true);
    try {
      await auth.signIn();
    } catch (e: any) {
      Alert.alert(
        "Couldn't sign in",
        e?.message?.includes("not_a_member")
          ? "This account isn't on a unit roster yet. Ask a leader to add you."
          : e?.message?.includes("cancelled")
            ? "Sign-in was cancelled."
            : "Something went wrong. Check your connection and try again.",
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
            We'll open a browser so you can sign in with your email or with
            Google / Apple, then bring you back here.
          </Text>

          <Pressable
            onPress={onSubmit}
            disabled={busy}
            style={({ pressed }) => [
              styles.cta,
              busy && styles.ctaDisabled,
              pressed && styles.ctaPressed,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={palette.bg} />
            ) : (
              <Text style={styles.ctaText}>Sign in →</Text>
            )}
          </Pressable>

          <Text style={styles.fine}>
            Don't have an account? Visit compass.app on your laptop to start a
            unit's site.
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
  cta: {
    backgroundColor: palette.ink,
    borderRadius: radius.input,
    paddingVertical: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  ctaDisabled: { opacity: 0.5 },
  ctaPressed: { opacity: 0.8 },
  ctaText: {
    fontFamily: fontFamilies.ui,
    fontSize: 16,
    fontWeight: "700",
    color: palette.bg,
  },
  fine: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.inkMuted,
    textAlign: "center",
    marginTop: spacing.md,
  },
});
