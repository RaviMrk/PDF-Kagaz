import licenses from '../licenses.json';
import { NATIVE_NOTICES } from '../nativeNotices';

type Entry = { name: string; version: string; license: string };
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
    expect(list.filter((e) => !e.license)).toEqual([]);
  });
});

describe('native notices', () => {
  it('gives every Android library a licence', () => {
    expect(NATIVE_NOTICES.length).toBeGreaterThan(0);
    for (const n of NATIVE_NOTICES) {
      expect(n.name).not.toBe('');
      expect(n.license).not.toBe('');
    }
  });
});
