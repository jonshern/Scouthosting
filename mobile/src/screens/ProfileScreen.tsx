// Profile / settings — wired to the real auth session. Shows the
// signed-in user's name + email + active org, lets them switch
// between orgs they're a member of, jump to the support form, and
// sign out.

import React, { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { Avatar, Icon } from "../theme/atoms";
import { useAuth } from "../state/AuthContext";
import { fontFamilies, palette, radius, spacing } from "../theme/tokens";
import type { ProfileStackParamList } from "../navigation/types";

type ProfileNav = NativeStackNavigationProp<ProfileStackParamList, "ProfileRoot">;

export function ProfileScreen() {
  const auth = useAuth();
  const navigation = useNavigation<ProfileNav>();
  const [signingOut, setSigningOut] = useState(false);

  const session = auth.session;
  const profile = auth.state.status === "signed-in" ? auth.state.profile : null;

  if (!session || !profile) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}>
          <Text style={styles.muted}>Not signed in.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const initials = (session.displayName || session.email || "U")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "U";

  const orgs = profile.orgs;

  async function onSignOut() {
    Alert.alert("Sign out?", "You'll need to sign in again to see your unit.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          setSigningOut(true);
          try { await auth.signOut(); } finally { setSigningOut(false); }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.header}>
          <Avatar initials={initials} size={64} bg={palette.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{session.displayName || session.email}</Text>
            <Text style={styles.email}>{session.email}</Text>
            <Text style={styles.troop}>
              {session.orgName} · <Text style={{ color: palette.primary, fontWeight: "700" }}>{session.role}</Text>
            </Text>
          </View>
        </View>

        {orgs.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>YOUR UNITS</Text>
            <View style={styles.list}>
              {orgs.map((o, i) => {
                const active = o.orgId === session.orgId;
                return (
                  <Pressable
                    key={o.orgId}
                    onPress={() => !active && auth.switchOrg(o.orgId)}
                    style={[
                      styles.row,
                      i < orgs.length - 1 && {
                        borderBottomColor: palette.lineSoft,
                        borderBottomWidth: 1,
                      },
                    ]}
                  >
                    <View style={styles.iconWrap}>
                      <Icon name="home" size={18} color={palette.primary} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>{o.orgName}</Text>
                      <Text style={styles.sub}>
                        {o.role}
                        {active ? " · current" : ""}
                      </Text>
                    </View>
                    {active && (
                      <Icon name="check" size={18} color={palette.success} strokeWidth={2.4} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SETTINGS</Text>
          <View style={styles.list}>
            <Pressable
              onPress={() => navigation.navigate("Support")}
              style={[styles.row, { borderBottomColor: palette.lineSoft, borderBottomWidth: 1 }]}
            >
              <View style={styles.iconWrap}>
                <Icon name="chat" size={18} color={palette.primary} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Help &amp; support</Text>
                <Text style={styles.sub}>Contact a Compass operator</Text>
              </View>
              <Icon name="chevron" size={16} color={palette.inkMuted} strokeWidth={2} />
            </Pressable>
            <Pressable
              onPress={onSignOut}
              disabled={signingOut}
              style={[styles.row, signingOut && { opacity: 0.6 }]}
            >
              <View style={styles.iconWrap}>
                <Icon name="lock" size={18} color={palette.danger} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: palette.danger }]}>
                  {signingOut ? "Signing out…" : "Sign out"}
                </Text>
                <Text style={styles.sub}>Active on this device</Text>
              </View>
              <Icon name="chevron" size={16} color={palette.inkMuted} strokeWidth={2} />
            </Pressable>
          </View>
        </View>

        <Text style={styles.footer}>
          Compass — communication and organization for volunteer Scout units.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  muted: { fontFamily: fontFamilies.ui, color: palette.inkMuted },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
  },
  name: {
    fontFamily: fontFamilies.display,
    fontSize: 22,
    color: palette.ink,
    letterSpacing: -0.4,
  },
  email: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.inkMuted,
    marginTop: 2,
  },
  troop: {
    fontFamily: fontFamilies.ui,
    fontSize: 13,
    color: palette.inkSoft,
    marginTop: 4,
  },
  section: { marginTop: spacing.lg },
  sectionLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    fontWeight: "700",
    letterSpacing: 1.2,
    paddingHorizontal: spacing.screen,
    marginBottom: spacing.sm,
  },
  list: {
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: palette.line,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.screen,
    paddingVertical: spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.input,
    backgroundColor: palette.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    fontWeight: "600",
    color: palette.ink,
  },
  sub: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkMuted,
    marginTop: 2,
  },
  footer: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    textAlign: "center",
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
});

export default ProfileScreen;
