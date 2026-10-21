import type { ViewStyle } from 'react-native';

import type { ReaderTheme } from '@/stores/settingsStore';

export const NIGHT_FILTER = [{ invert: 1 }, { hueRotate: '180deg' }] as const;
export const SEPIA_FILTER = [{ sepia: 0.7 }] as const;

export function readerFilter(theme: ReaderTheme): ViewStyle['filter'] | undefined {
  if (theme === 'night') return NIGHT_FILTER;
  if (theme === 'sepia') return SEPIA_FILTER;
  return undefined;
}

export function readerBackground(theme: ReaderTheme): string {
  if (theme === 'night') return '#000000';
  if (theme === 'sepia') return '#F1E7D0';
  return '#E8E8E8';
}
