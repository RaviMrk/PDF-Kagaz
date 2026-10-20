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
