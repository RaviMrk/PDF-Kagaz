import { create } from 'zustand';

import type { KeyValueStore } from '@/services/prefs/KeyValueStore';
import { mmkvStore } from '@/services/prefs/mmkvStore';

export type ThemePref = 'system' | 'light' | 'dark';

const THEMES: readonly ThemePref[] = ['system', 'light', 'dark'];

export type SettingsState = {
  theme: ThemePref;
  language: string | null;
  onboardingDone: boolean;
  setTheme: (theme: ThemePref) => void;
  setLanguage: (language: string | null) => void;
  setOnboardingDone: (done: boolean) => void;
};

function readTheme(kv: KeyValueStore): ThemePref {
  const stored = kv.getString('theme');
  return THEMES.find((t) => t === stored) ?? 'system';
}

export function createSettingsStore(kv: KeyValueStore) {
  return create<SettingsState>()((set) => ({
    theme: readTheme(kv),
    language: kv.getString('language') ?? null,
    onboardingDone: kv.getBoolean('onboardingDone') ?? false,
    setTheme: (theme) => {
      kv.set('theme', theme);
      set({ theme });
    },
    setLanguage: (language) => {
      if (language === null) kv.remove('language');
      else kv.set('language', language);
      set({ language });
    },
    setOnboardingDone: (onboardingDone) => {
      kv.set('onboardingDone', onboardingDone);
      set({ onboardingDone });
    },
  }));
}

export const useSettings = createSettingsStore(mmkvStore);
