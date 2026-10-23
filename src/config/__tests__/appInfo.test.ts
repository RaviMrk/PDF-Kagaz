import Constants from 'expo-constants';

import { appVersion, privacyPolicyUrl } from '../appInfo';

jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.0.0',
  nativeBuildVersion: '7',
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: undefined } }));

const mocked = Constants as unknown as { expoConfig: unknown };

describe('appVersion', () => {
  it('reads the installed version and build', () => {
    expect(appVersion()).toEqual({ version: '1.0.0', build: '7' });
  });
});

describe('privacyPolicyUrl', () => {
  it('accepts only https URLs', () => {
    mocked.expoConfig = { extra: { privacyPolicyUrl: 'https://example.org/p' } };
    expect(privacyPolicyUrl()).toBe('https://example.org/p');
    mocked.expoConfig = { extra: { privacyPolicyUrl: 'http://x' } };
    expect(privacyPolicyUrl()).toBeNull();
    mocked.expoConfig = { extra: { privacyPolicyUrl: 'javascript:alert(1)' } };
    expect(privacyPolicyUrl()).toBeNull();
  });

  it('is null when absent, empty or not a string', () => {
    mocked.expoConfig = undefined;
    expect(privacyPolicyUrl()).toBeNull();
    mocked.expoConfig = { extra: { privacyPolicyUrl: null } };
    expect(privacyPolicyUrl()).toBeNull();
    mocked.expoConfig = { extra: { privacyPolicyUrl: '' } };
    expect(privacyPolicyUrl()).toBeNull();
  });
});
