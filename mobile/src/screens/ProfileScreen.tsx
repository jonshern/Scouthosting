// Profile / settings — light fidelity. Linked scouts, contact prefs,
// and a link out to PhotoPermissions.
//
// TODO(backend): hook to /api/me endpoints and the parental consent
// (COPPA) flow for managing youth accounts.

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Avatar, Icon } from '../theme/atoms';
import { fontFamilies, palette, radius, spacing } from '../theme/tokens';
import type { ProfileStackParamList } from '../navigation/types';

type ProfileNav = NativeStackNavigationProp<ProfileStackParamList, 'ProfileRoot'>;

const ROWS = [
  { label: 'Photo permissions', sub: 'Per-scout privacy controls', icon: 'image' as const, route: 'PhotoPermissions' as const },
  { label: 'Notifications', sub: 'Quiet hours · push categories', icon: 'bell' as const, route: undefined },
  { label: 'Linked scouts', sub: 'Sam · Max · request to add', icon: 'profile' as const, route: undefined },
  { label: 'Pay methods', sub: 'Visa ending 4242 · Apple Pay', icon: 'flag' as const, route: undefined },
  { label: 'Help & support', sub: 'Contact a Compass operator', icon: 'chat' as const, route: 'Support' as const },
  { label: 'Sign out', sub: 'Active on this device', icon: 'lock' as const, route: undefined },
];

export function ProfileScreen() {
  const navigation = useNavigation<ProfileNav>();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.header}>
          <Avatar initials="AK" size={64} bg={palette.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>Alex Kim</Text>
            <Text style={styles.email}>alex@example.com</Text>
            <Text style={styles.troop}>Troop 12 · Anytown, USA</Text>
          </View>
        </View>

        <View style={styles.list}>
          {ROWS.map((r, i) => (
            <Pressable
              key={r.label}
              onPress={() => {
                if (r.route === 'Support') navigation.navigate('Support');
              }}
              style={[
                styles.row,
                i < ROWS.length - 1 && {
                  borderBottomColor: palette.lineSoft,
                  borderBottomWidth: 1,
                },
              ]}
            >
              <View style={styles.iconWrap}>
                <Icon name={r.icon} size={18} color={palette.primary} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{r.label}</Text>
                <Text style={styles.sub}>{r.sub}</Text>
              </View>
              <Icon name="chevron" size={16} color={palette.inkMuted} strokeWidth={2} />
            </Pressable>
          ))}
        </View>

        <Text style={styles.disclaimer}>
          Compass is independent. Not affiliated with Scouting America or BSA.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  header: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    padding: spacing.lg,
  },
  name: {
    fontFamily: fontFamilies.display,
    fontSize: 24,
    color: palette.ink,
    letterSpacing: -0.4,
  },
  email: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.inkMuted,
    marginTop: 2,
  },
  troop: {
    fontFamily: fontFamilies.ui,
    fontSize: 12,
    color: palette.primary,
    fontWeight: '700',
    marginTop: 4,
  },
  list: {
    backgroundColor: palette.surface,
    marginHorizontal: spacing.screen,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: palette.line,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.input,
    backgroundColor: `${palette.primary}11`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    fontWeight: '700',
    color: palette.ink,
  },
  sub: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    marginTop: 2,
  },
  disclaimer: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    color: palette.inkMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xxl,
  },
});

export default ProfileScreen;
