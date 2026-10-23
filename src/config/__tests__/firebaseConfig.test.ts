/** @jest-environment node */
import fs from 'node:fs';
import path from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports */
const ROOT = path.join(__dirname, '..', '..', '..');
const { FIREBASE_PACKAGES, googleServicesPath, isFirebaseEnabled } = require(
  path.join(ROOT, 'firebaseConfig'),
);

type RnConfig = { dependencies: Record<string, { platforms: Record<string, null> }> };

function loadRnConfig(fileExists: boolean): RnConfig {
  const spy = jest.spyOn(fs, 'existsSync').mockReturnValue(fileExists);
  try {
    let config: RnConfig | undefined;
    jest.isolateModules(() => {
      config = require(path.join(ROOT, 'react-native.config'));
    });
    return config!;
  } finally {
    spy.mockRestore();
  }
}

describe('firebaseConfig', () => {
  const saved = process.env.GOOGLE_SERVICES_JSON;
  beforeEach(() => delete process.env.GOOGLE_SERVICES_JSON);
  afterAll(() => {
    if (saved === undefined) delete process.env.GOOGLE_SERVICES_JSON;
    else process.env.GOOGLE_SERVICES_JSON = saved;
  });

  it('is off without google-services.json', () => {
    expect(isFirebaseEnabled({}, () => false)).toBe(false);
  });

  it('follows GOOGLE_SERVICES_JSON when it is set', () => {
    expect(
      isFirebaseEnabled({ GOOGLE_SERVICES_JSON: '/x/g.json' }, (p: string) => p === '/x/g.json'),
    ).toBe(true);
    expect(googleServicesPath({ GOOGLE_SERVICES_JSON: '/x/g.json' })).toBe('/x/g.json');
  });

  it('defaults to google-services.json at the project root', () => {
    expect(googleServicesPath({})).toBe(path.join(ROOT, 'google-services.json'));
    const seen: string[] = [];
    isFirebaseEnabled({}, (p: string) => (seen.push(p), true));
    expect(seen).toEqual([path.join(ROOT, 'google-services.json')]);
  });

  it('lists the three Firebase packages', () => {
    expect(FIREBASE_PACKAGES).toEqual([
      '@react-native-firebase/app',
      '@react-native-firebase/crashlytics',
      '@react-native-firebase/analytics',
    ]);
  });
});

describe('react-native.config', () => {
  it('unlinks every Firebase package when the file is missing', () => {
    const { dependencies } = loadRnConfig(false);
    expect(dependencies['@react-native-firebase/crashlytics']?.platforms.android).toBeNull();
    for (const p of FIREBASE_PACKAGES as string[]) {
      expect(dependencies[p]?.platforms).toEqual({ android: null, ios: null });
    }
  });

  it('links them normally when the file exists', () => {
    expect(loadRnConfig(true).dependencies).toEqual({});
  });
});
