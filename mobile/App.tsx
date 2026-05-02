// Compass mobile entry point. Sets up the safe-area provider +
// navigation container, mounts the auth state, and chooses between
// SignInScreen (signed-out) and the bottom tab navigator (signed-in).
//
// We use system fonts for now — when the design system bundles
// Newsreader / Inter Tight, drop the TTFs into ./assets/fonts and
// register them with `useFonts` from expo-font.

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { palette } from './src/theme/tokens';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AuthProvider, useAuth } from './src/state/AuthContext';
import SignInScreen from './src/screens/SignInScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <StatusBar style="dark" />
          <AuthGate />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function AuthGate() {
  const { state } = useAuth();
  if (state.status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={palette.primary} />
      </View>
    );
  }
  if (state.status === 'signed-out') {
    return <SignInScreen />;
  }
  return <RootNavigator />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
