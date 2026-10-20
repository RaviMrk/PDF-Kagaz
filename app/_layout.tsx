import { Stack } from 'expo-router';
import { getLocales } from 'expo-localization';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DbGate } from '@/components/DbGate';
import { IndexLifecycle } from '@/components/IndexLifecycle';
import { initI18n, resolveLanguage } from '@/i18n';
import { useSettings } from '@/stores/settingsStore';
import { useTheme } from '@/theme/useTheme';

function createI18n() {
  const codes = getLocales()
    .map((l) => l.languageCode)
    .filter((c): c is string => c !== null);
  return initI18n(resolveLanguage(useSettings.getState().language, codes));
}

export default function RootLayout() {
  const [i18n] = useState(createI18n);
  const { scheme, colors } = useTheme();
  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: colors.background }]}>
      <I18nextProvider i18n={i18n}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <DbGate>
          <IndexLifecycle />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          />
        </DbGate>
      </I18nextProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
