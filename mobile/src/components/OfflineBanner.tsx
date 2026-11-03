// A small note at the top of the screen while Compass is showing its saved copy (api/offline.ts).
// It floats over the screen instead of pushing it down, and lets taps through.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { offlineMessage, offlineStatus, onOfflineChange } from '../api/offline';
import { palette, fontFamilies } from '../theme/tokens';

export function OfflineBanner() {
  const [status, setStatus] = useState(offlineStatus);
  const insets = useSafeAreaInsets();
  useEffect(() => onOfflineChange(setStatus), []);
  const message = offlineMessage(status);
  if (!message) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 4 }]}>
      <View style={styles.pill} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  pill: {
    backgroundColor: palette.ink,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    maxWidth: '92%',
  },
  text: { color: '#ffffff', fontSize: 13, fontFamily: fontFamilies.ui },
});
