// Delete the account from inside the app (App Store rule). Collapsed on
// Profile until tapped; asks for the account's email like the website's
// /account/delete. What goes and what the troop keeps:
// src/lib/account/delete.ts on the server.

import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useAuth } from "../state/AuthContext";
import { ApiError } from "../api/client";
import { fontFamilies, palette, radius, spacing } from "../theme/tokens";

export function DeleteAccountSection({ email }: { email: string }) {
  const { deleteAccount } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  async function onDelete() {
    setBusy(true);
    setProblems([]);
    try {
      const blockers = await deleteAccount(typed.trim());
      if (blockers) setProblems(blockers);
    } catch (e) {
      setProblems([
        e instanceof ApiError && e.code === "demo_locked"
          ? "The demo's accounts can't be deleted."
          : "Couldn't delete the account. Check your connection and try again.",
      ]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button">
        <Text style={styles.link}>Delete my account</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.box}>
      <Text style={styles.label}>Delete account</Text>
      <Text style={styles.body}>
        This signs you out everywhere and can&apos;t be undone. Your name, email and sign-ins are
        removed and you leave every unit and chat. Your troop keeps its records, like messages you
        sent (shown from &quot;Former member&quot;), RSVPs and sign-offs.
      </Text>
      <Text style={styles.body}>Type {email} to confirm.</Text>
      <TextInput
        value={typed}
        onChangeText={setTyped}
        placeholder={email}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        style={styles.input}
        accessibilityLabel="Your email, to confirm"
      />
      {problems.map((p) => (
        <Text key={p} style={styles.problem}>{p}</Text>
      ))}
      <View style={styles.row}>
        <Pressable
          onPress={onDelete}
          disabled={!matches || busy}
          style={[styles.btn, styles.btnDanger, (!matches || busy) && { opacity: 0.5 }]}
        >
          {busy ? (
            <ActivityIndicator color={palette.bg} />
          ) : (
            <Text style={[styles.btnText, { color: palette.bg }]}>Delete my account</Text>
          )}
        </Pressable>
        <Pressable onPress={() => setOpen(false)} disabled={busy} style={styles.btn}>
          <Text style={styles.btnText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  link: { fontFamily: fontFamilies.ui, fontSize: 14, color: palette.danger, textDecorationLine: "underline" },
  label: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: palette.danger,
    textTransform: "uppercase",
  },
  body: { fontFamily: fontFamilies.ui, fontSize: 14, color: palette.ink, lineHeight: 20 },
  input: {
    fontFamily: fontFamilies.ui,
    fontSize: 15,
    color: palette.ink,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: palette.surface,
  },
  problem: { fontFamily: fontFamilies.ui, fontSize: 13, color: palette.danger },
  row: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  btn: {
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    minWidth: 96,
    alignItems: "center",
  },
  btnDanger: { backgroundColor: palette.danger, borderColor: palette.danger },
  btnText: { fontFamily: fontFamilies.ui, fontSize: 14, fontWeight: "600", color: palette.ink },
});
