import licenses from '../licenses.json';
import licenseTexts from '../licenseTexts.json';
import { NATIVE_NOTICES } from '../nativeNotices';

type Entry = { name: string; version: string; license: string; text: string };
const list = licenses as Entry[];

describe('generated licence list', () => {
  it('lists production dependencies with their licence', () => {
    expect(list.find((e) => e.name === 'react-native')?.license).toBe('MIT');
    expect(list.some((e) => e.name === '@cantoo/pdf-lib')).toBe(true);
  });

  it('leaves out dev tooling and the in-repo module', () => {
    const names = new Set(list.map((e) => e.name));
    for (const dev of ['jest', 'eslint', 'typescript', 'pdf-native', 'pdf-toolkit']) {
      expect(names.has(dev)).toBe(false);
    }
  });

  it('is sorted by name then version, with unique name@version pairs', () => {
    const keys = list.map((e) => `${e.name}@${e.version}`);
    expect(new Set(keys).size).toBe(keys.length);
    const sorted = [...list].sort(
      (a, b) =>
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
        (a.version < b.version ? -1 : a.version > b.version ? 1 : 0),
    );
    expect(list).toEqual(sorted);
  });

  it('gives every entry a non-empty licence', () => {
    expect(list.filter((e) => !e.license || e.license === 'UNKNOWN')).toEqual([]);
  });

  it('excludes build-time tooling', () => {
    const allowed = new Set(['@babel/runtime', 'metro-runtime']);
    expect(
      list.filter(
        (e) => /^(jest-|@jest\/|@types\/|metro|@babel\/)/.test(e.name) && !allowed.has(e.name),
      ),
    ).toEqual([]);
  });

  it('includes the libraries the app ships', () => {
    const names = new Set(list.map((e) => e.name));
    for (const lib of [
      'react-native-pdf',
      'react-native-mmkv',
      'react-native-google-mobile-ads',
      'react-native-blob-util',
      '@shopify/flash-list',
      '@cantoo/pdf-lib',
      'expo-router',
      '@babel/runtime',
      'metro-runtime',
    ]) {
      expect(names.has(lib)).toBe(true);
    }
  });

  it('has a licence text for every entry, stored once per distinct text', () => {
    const texts = licenseTexts as Record<string, string>;
    for (const e of list) expect(texts[e.text]?.length ?? 0).toBeGreaterThan(50);
    expect(Object.keys(texts).length).toBeLessThan(list.length);
    expect(texts[list.find((e) => e.name === 'react-native')!.text]).toMatch(
      /Permission is hereby granted/,
    );
  });
});

describe('native notices', () => {
  it('gives every Android library a licence', () => {
    expect(NATIVE_NOTICES.length).toBeGreaterThanOrEqual(15);
    const all = NATIVE_NOTICES.map((n) => n.name).join(' ');
    for (const w of ['OkHttp', 'Fresco', 'Mobile Ads', 'UMP', 'Kotlin', 'MMKV'])
      expect(all).toContain(w);
    for (const n of NATIVE_NOTICES) {
      expect(n.name).not.toBe('');
      expect(n.license).not.toBe('');
    }
  });
});
