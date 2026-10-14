// Permission slip on an event that needs one: shows the slip text and,
// for each of your scouts in this unit who still needs it, a typed-name
// signature. Same rules as the emailed link; the server checks them.

import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { signPermissionSlip } from "../api/events";
import { fetchMyScouts, type MyScout } from "../api/scouts";
import { ApiError, type ClientOptions } from "../api/client";
import { fontFamilies, palette, radius, spacing } from "../theme/tokens";

export function PermissionSlipSection({
  client,
  orgId,
  eventId,
  text,
}: {
  client: ClientOptions;
  orgId: string;
  eventId: string;
  text: string;
}) {
  const [scouts, setScouts] = useState<MyScout[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetchMyScouts(client);
      setScouts(r.scouts.filter((s) => s.orgId === orgId && s.upcoming.some((u) => u.eventId === eventId)));
    } catch {
      setScouts([]);
    }
  }, [client, orgId, eventId]);

  useEffect(() => { void load(); }, [load]);

  async function sign(s: MyScout) {
    if (!name.trim()) return Alert.alert("Type your name", "Your typed name is your signature.");
    setBusy(s.memberId);
    try {
      await signPermissionSlip(client, eventId, { memberId: s.memberId, signedByName: name.trim() });
      await load();
    } catch (e) {
      const msg = e instanceof ApiError && typeof e.extra.message === "string" ? e.extra.message : "Check your connection and try again.";
      Alert.alert("Couldn't sign", msg);
    } finally {
      setBusy(null);
    }
  }

  const needs = (s: MyScout) => s.upcoming.some((u) => u.eventId === eventId && !u.slipSigned);

  return (
    <View style={styles.section}>
      <Text style={styles.label}>PERMISSION SLIP</Text>
      <Text style={styles.body}>{text}</Text>
      {scouts === null ? (
        <ActivityIndicator color={palette.primary} />
      ) : scouts.length === 0 ? (
        <Text style={styles.hint}>Parents sign here for their own scouts. None of yours are on this event's roster.</Text>
      ) : (
        <>
          {scouts.some(needs) && (
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your full name"
              placeholderTextColor={palette.inkMuted}
              autoCapitalize="words"
              style={styles.input}
              accessibilityLabel="Your full name, as your signature"
            />
          )}
          {scouts.map((s) => (
            <View key={s.memberId} style={styles.row}>
              <Text style={styles.scout}>{s.scoutName}</Text>
              {needs(s) ? (
                <Pressable onPress={() => sign(s)} disabled={busy !== null} style={styles.btn} accessibilityRole="button">
                  {busy === s.memberId ? <ActivityIndicator color={palette.bg} /> : <Text style={styles.btnText}>Sign</Text>}
                </Pressable>
              ) : (
                <Text style={styles.signed}>Signed</Text>
              )}
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },
  label: { fontFamily: fontFamilies.ui, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, color: palette.inkMuted },
  body: { fontFamily: fontFamilies.ui, fontSize: 14, lineHeight: 20, color: palette.inkSoft },
  hint: { fontFamily: fontFamilies.ui, fontSize: 13, color: palette.inkMuted },
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
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.xs },
  scout: { fontFamily: fontFamilies.ui, fontSize: 15, color: palette.ink },
  btn: { backgroundColor: palette.ink, borderRadius: radius.input, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minWidth: 80, alignItems: "center" },
  btnText: { fontFamily: fontFamilies.ui, fontSize: 14, fontWeight: "600", color: palette.bg },
  signed: { fontFamily: fontFamilies.ui, fontSize: 14, fontWeight: "600", color: palette.success },
});
