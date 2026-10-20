import { useColorScheme } from 'react-native';

import { useSettings } from '@/stores/settingsStore';

import { darkColors, lightColors, type ColorTokens } from './colors';

export function useTheme(): { scheme: 'light' | 'dark'; colors: ColorTokens } {
  const pref = useSettings((s) => s.theme);
  const os = useColorScheme();
  const scheme = pref === 'system' ? (os === 'dark' ? 'dark' : 'light') : pref;
  return { scheme, colors: scheme === 'dark' ? darkColors : lightColors };
}
