// Sign-up slots on an event (drivers, food, badge-day stations). Tap to
// take a slot or give it back; a full slot with a waitlist puts you on it.

import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { releaseSlot, slotStatus, takeSlot, type EventSlot } from "../api/events";
import { ApiError, type ClientOptions } from "../api/client";
import { fontFamilies, palette, radius, spacing } from "../theme/tokens";

export function SlotsSection({
  client,
  eventId,
  slots,
  onChanged,
}: {
  client: ClientOptions;
  eventId: string;
  slots: EventSlot[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!slots.length) return null;

  async function toggle(s: EventSlot) {
    setBusy(s.id);
    try {
      if (s.mine) await releaseSlot(client, eventId, s.id);
      else await takeSlot(client, eventId, s.id);
      onChanged();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      Alert.alert(
        "Couldn't save that",
        code === "slot_full" ? "That slot just filled up." : "Check your connection and try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.label}>SIGN-UPS</Text>
      {slots.map((s) => {
        const full = !s.mine && s.active >= s.capacity && !s.allowWaitlist;
        return (
          <View key={s.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{s.title}</Text>
              {s.description ? <Text style={styles.desc}>{s.description}</Text> : null}
              <Text style={[styles.status, s.mine && { color: palette.success }]}>{slotStatus(s)}</Text>
            </View>
            <Pressable
              onPress={() => toggle(s)}
              disabled={busy !== null || full}
              accessibilityRole="button"
              style={[styles.btn, s.mine ? styles.btnOutline : styles.btnSolid, (busy !== null || full) && { opacity: 0.5 }]}
            >
              {busy === s.id ? (
                <ActivityIndicator color={s.mine ? palette.ink : palette.bg} />
              ) : (
                <Text style={[styles.btnText, !s.mine && { color: palette.bg }]}>
                  {s.mine ? "Give it back" : s.active >= s.capacity ? "Join waitlist" : "Sign up"}
                </Text>
              )}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },
  label: { fontFamily: fontFamilies.ui, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, color: palette.inkMuted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
  },
  title: { fontFamily: fontFamilies.ui, fontSize: 15, fontWeight: "600", color: palette.ink },
  desc: { fontFamily: fontFamilies.ui, fontSize: 13, color: palette.inkSoft, marginTop: 2 },
  status: { fontFamily: fontFamilies.ui, fontSize: 12, color: palette.inkMuted, marginTop: 4 },
  btn: { borderRadius: radius.input, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minWidth: 104, alignItems: "center" },
  btnSolid: { backgroundColor: palette.ink },
  btnOutline: { borderWidth: 1, borderColor: palette.line },
  btnText: { fontFamily: fontFamilies.ui, fontSize: 14, fontWeight: "600", color: palette.ink },
});
