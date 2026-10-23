import { create } from 'zustand';

import type { KeyValueStore } from '@/services/prefs/KeyValueStore';
import type { SortDir, SortKey } from '@/services/files/fileQuery';
import { IMAGE_QUALITIES, type ImageQuality } from '@/services/tools/limits';
import { mmkvStore } from '@/services/prefs/mmkvStore';

export type ThemePref = 'system' | 'light' | 'dark';

export type ReaderTheme = 'normal' | 'night' | 'sepia';

const READER_THEMES: readonly ReaderTheme[] = ['normal', 'night', 'sepia'];
const THEMES: readonly ThemePref[] = ['system', 'light', 'dark'];
const SORT_KEYS: readonly SortKey[] = ['name', 'date', 'size'];
const SORT_DIRS: readonly SortDir[] = ['asc', 'desc'];

export type SettingsState = {
  theme: ThemePref;
  language: string | null;
  onboardingDone: boolean;
  filesSortKey: SortKey;
  filesSortDir: SortDir;
  readerTheme: ReaderTheme;
  readerKeepAwake: boolean;
  readerHorizontal: boolean;
  imageQuality: ImageQuality;
  setImageQuality: (quality: ImageQuality) => void;
  setTheme: (theme: ThemePref) => void;
  setReaderTheme: (theme: ReaderTheme) => void;
  setReaderKeepAwake: (on: boolean) => void;
  setReaderHorizontal: (on: boolean) => void;
  setLanguage: (language: string | null) => void;
  setOnboardingDone: (done: boolean) => void;
  setFilesSort: (key: SortKey, dir: SortDir) => void;
};

function readTheme(kv: KeyValueStore): ThemePref {
  const stored = kv.getString('theme');
  return THEMES.find((t) => t === stored) ?? 'system';
}

function readReaderTheme(kv: KeyValueStore): ReaderTheme {
  const stored = kv.getString('readerTheme');
  return READER_THEMES.find((t) => t === stored) ?? 'normal';
}

function readImageQuality(kv: KeyValueStore): ImageQuality {
  const stored = kv.getString('imageQuality');
  return IMAGE_QUALITIES.find((q) => q === stored) ?? 'standard';
}

function readSortKey(kv: KeyValueStore): SortKey {
  const stored = kv.getString('filesSortKey');
  return SORT_KEYS.find((k) => k === stored) ?? 'date';
}

function readSortDir(kv: KeyValueStore): SortDir {
  const stored = kv.getString('filesSortDir');
  return SORT_DIRS.find((d) => d === stored) ?? 'desc';
}

export function createSettingsStore(kv: KeyValueStore) {
  return create<SettingsState>()((set) => ({
    theme: readTheme(kv),
    language: kv.getString('language') ?? null,
    onboardingDone: kv.getBoolean('onboardingDone') ?? false,
    filesSortKey: readSortKey(kv),
    filesSortDir: readSortDir(kv),
    readerTheme: readReaderTheme(kv),
    readerKeepAwake: kv.getBoolean('readerKeepAwake') ?? false,
    readerHorizontal: kv.getBoolean('readerHorizontal') ?? false,
    imageQuality: readImageQuality(kv),
    setImageQuality: (imageQuality) => {
      kv.set('imageQuality', imageQuality);
      set({ imageQuality });
    },
    setReaderTheme: (readerTheme) => {
      kv.set('readerTheme', readerTheme);
      set({ readerTheme });
    },
    setReaderKeepAwake: (readerKeepAwake) => {
      kv.set('readerKeepAwake', readerKeepAwake);
      set({ readerKeepAwake });
    },
    setReaderHorizontal: (readerHorizontal) => {
      kv.set('readerHorizontal', readerHorizontal);
      set({ readerHorizontal });
    },
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
    setFilesSort: (filesSortKey, filesSortDir) => {
      kv.set('filesSortKey', filesSortKey);
      kv.set('filesSortDir', filesSortDir);
      set({ filesSortKey, filesSortDir });
    },
  }));
}

export const useSettings = createSettingsStore(mmkvStore);
