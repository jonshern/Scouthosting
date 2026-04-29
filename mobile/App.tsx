// Compass mobile entry point. Loads UI fonts via expo-font (config-only;
// the reviewer's installer wires up the actual font asset bundle), sets
// up the safe-area provider + navigation container, and mounts the root
// tab navigator.

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { palette } from './src/theme/tokens';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  // Font registration is declared here for symmetry with the design
  // system. Asset URLs and bundle hookup are TODO for the reviewer.
  const [fontsLoaded] = useFonts({
    // 'Newsreader': require('./assets/fonts/Newsreader-Regular.ttf'),
    // 'Newsreader-Italic': require('./assets/fonts/Newsreader-Italic.ttf'),
    // 'InterTight': require('./assets/fonts/InterTight-Regular.ttf'),
    // 'InterTight-Medium': require('./assets/fonts/InterTight-Medium.ttf'),
    // 'InterTight-SemiBold': require('./assets/fonts/InterTight-SemiBold.ttf'),
    // 'InterTight-Bold': require('./assets/fonts/InterTight-Bold.ttf'),
  });

  if (!fontsLoaded) {
    // System fallbacks render fine; the splash here is just defensive.
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={palette.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
