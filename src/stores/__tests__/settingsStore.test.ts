import { createMemoryStore } from '@/services/prefs/memoryStore';
import { createSettingsStore } from '@/stores/settingsStore';

describe('settingsStore', () => {
  it('starts with defaults on an empty store', () => {
    const s = createSettingsStore(createMemoryStore()).getState();
    expect(s.theme).toBe('system');
    expect(s.language).toBeNull();
    expect(s.onboardingDone).toBe(false);
  });

  it('writes through to the key-value store and reloads from it', () => {
    const kv = createMemoryStore();
    const store = createSettingsStore(kv);
    store.getState().setTheme('dark');
    expect(store.getState().theme).toBe('dark');
    expect(kv.getString('theme')).toBe('dark');
    expect(createSettingsStore(kv).getState().theme).toBe('dark');
  });

  it('persists language and onboarding flag', () => {
    const kv = createMemoryStore();
    const store = createSettingsStore(kv);
    store.getState().setLanguage('mr');
    store.getState().setOnboardingDone(true);
    const reloaded = createSettingsStore(kv).getState();
    expect(reloaded.language).toBe('mr');
    expect(reloaded.onboardingDone).toBe(true);
    reloaded.setLanguage(null);
    expect(kv.getString('language')).toBeUndefined();
  });

  it('treats an unknown stored theme as system', () => {
    const kv = createMemoryStore();
    kv.set('theme', 'blue');
    expect(createSettingsStore(kv).getState().theme).toBe('system');
  });
});

describe('settingsStore files sort', () => {
  it('defaults to date desc', () => {
    const s = createSettingsStore(createMemoryStore()).getState();
    expect(s.filesSortKey).toBe('date');
    expect(s.filesSortDir).toBe('desc');
  });

  it('persists setFilesSort', () => {
    const kv = createMemoryStore();
    createSettingsStore(kv).getState().setFilesSort('name', 'asc');
    expect(kv.getString('filesSortKey')).toBe('name');
    const reloaded = createSettingsStore(kv).getState();
    expect(reloaded.filesSortKey).toBe('name');
    expect(reloaded.filesSortDir).toBe('asc');
  });

  it('falls back to defaults for invalid stored values', () => {
    const kv = createMemoryStore();
    kv.set('filesSortKey', 'blue');
    kv.set('filesSortDir', 'sideways');
    const s = createSettingsStore(kv).getState();
    expect(s.filesSortKey).toBe('date');
    expect(s.filesSortDir).toBe('desc');
  });
});

describe('settingsStore reader prefs', () => {
  it('has defaults', () => {
    const s = createSettingsStore(createMemoryStore()).getState();
    expect(s.readerTheme).toBe('normal');
    expect(s.readerKeepAwake).toBe(false);
    expect(s.readerHorizontal).toBe(false);
  });

  it('persists the setters to the key-value store and reloads them', () => {
    const kv = createMemoryStore();
    const store = createSettingsStore(kv);
    store.getState().setReaderTheme('sepia');
    store.getState().setReaderKeepAwake(true);
    store.getState().setReaderHorizontal(true);
    expect(kv.getString('readerTheme')).toBe('sepia');
    expect(kv.getBoolean('readerKeepAwake')).toBe(true);
    expect(kv.getBoolean('readerHorizontal')).toBe(true);
    const reloaded = createSettingsStore(kv).getState();
    expect(reloaded.readerTheme).toBe('sepia');
    expect(reloaded.readerKeepAwake).toBe(true);
    expect(reloaded.readerHorizontal).toBe(true);
  });

  it('treats an unknown stored reader theme as normal', () => {
    const kv = createMemoryStore();
    kv.set('readerTheme', 'purple');
    expect(createSettingsStore(kv).getState().readerTheme).toBe('normal');
  });

  it('defaults the image quality to standard, persists a choice and ignores unknown values', () => {
    const kv = createMemoryStore();
    const store = createSettingsStore(kv);
    expect(store.getState().imageQuality).toBe('standard');
    store.getState().setImageQuality('high');
    expect(kv.getString('imageQuality')).toBe('high');
    expect(createSettingsStore(kv).getState().imageQuality).toBe('high');
    kv.set('imageQuality', 'ultra');
    expect(createSettingsStore(kv).getState().imageQuality).toBe('standard');
  });

  it('defaults analytics and crash reports to on and persists each opt-out separately', () => {
    const kv = createMemoryStore();
    const store = createSettingsStore(kv);
    expect(store.getState().analyticsEnabled).toBe(true);
    expect(store.getState().crashReportsEnabled).toBe(true);
    store.getState().setAnalyticsEnabled(false);
    expect(kv.getBoolean('analyticsEnabled')).toBe(false);
    let reloaded = createSettingsStore(kv).getState();
    expect(reloaded).toMatchObject({ analyticsEnabled: false, crashReportsEnabled: true });
    reloaded.setCrashReportsEnabled(false);
    reloaded.setAnalyticsEnabled(true);
    reloaded = createSettingsStore(kv).getState();
    expect(reloaded).toMatchObject({ analyticsEnabled: true, crashReportsEnabled: false });
  });

  it('getNumber round-trips a number and ignores other types', () => {
    const kv = createMemoryStore();
    expect(kv.getNumber('t')).toBeUndefined();
    kv.set('t', 180000);
    expect(kv.getNumber('t')).toBe(180000);
    kv.set('s', 'x');
    expect(kv.getNumber('s')).toBeUndefined();
  });
});
