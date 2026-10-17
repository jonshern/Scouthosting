// Which Compass server the app talks to. Shown on the sign-in screen
// (collapsed) and on Profile. On a phone pointed at Jon's Mac this is
// the Mac's Tailscale name; see docs/phone.md.

import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useAuth } from "../state/AuthContext";
import { needsHttps } from "../api/serverUrl";
import { serverAddress } from "../api/config";
import { fontFamilies, palette, radius, spacing } from "../theme/tokens";

export function ServerSection({ signedIn }: { signedIn: boolean }) {
  const { server } = useAuth();
  const [draft, setDraft] = useState(server.address);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const changed = draft.trim() !== server.address;

  async function save() {
    setBusy(true);
    setNote(null);
    try {
      const err = await server.setAddress(draft);
      if (err) return setNote({ ok: false, text: err });
      const result = await server.check();
      setNote({ ok: result.ok, text: result.message });
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    setBusy(true);
    try {
      const result = await server.check();
      setNote({ ok: result.ok, text: result.message });
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    try {
      await server.resetAddress();
      // server.address catches up on the next render; read it now.
      setDraft(serverAddress());
      setNote(null);
    } finally {
      setBusy(false);
    }
  }
  const insecure = (() => {
    try { return needsHttps(draft.trim()); } catch { return false; }
  })();

  return (
    <View style={styles.box}>
      <Text style={styles.label}>Server</Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://your-mac.your-tailnet.ts.net"
        placeholderTextColor={palette.inkMuted}
        style={styles.input}
        accessibilityLabel="Server address"
      />
      {insecure && (
        <Text style={styles.warn}>Phones block plain http to other machines. Use the https:// name.</Text>
      )}
      {changed && signedIn && (
        <Text style={styles.hint}>Saving a new address signs you out of this one.</Text>
      )}
      <View style={styles.row}>
        <Pressable onPress={changed ? save : check} disabled={busy} style={[styles.btn, styles.btnPrimary]}>
          {busy ? (
            <ActivityIndicator color={palette.bg} />
          ) : (
            <Text style={[styles.btnText, { color: palette.bg }]}>{changed ? "Save address" : "Check"}</Text>
          )}
        </Pressable>
        {!server.builtIn && (
          <Pressable onPress={reset} disabled={busy} style={styles.btn}>
            <Text style={styles.btnText}>Use the built-in address</Text>
          </Pressable>
        )}
      </View>
      {note && <Text style={[styles.note, { color: note.ok ? palette.success : palette.danger }]}>{note.text}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  label: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: palette.inkMuted,
    textTransform: "uppercase",
  },
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
  btnPrimary: { backgroundColor: palette.ink, borderColor: palette.ink },
  btnText: { fontFamily: fontFamilies.ui, fontSize: 14, fontWeight: "600", color: palette.ink },
  hint: { fontFamily: fontFamilies.ui, fontSize: 13, color: palette.inkSoft },
  warn: { fontFamily: fontFamilies.ui, fontSize: 13, color: palette.danger },
  note: { fontFamily: fontFamilies.ui, fontSize: 13 },
});
