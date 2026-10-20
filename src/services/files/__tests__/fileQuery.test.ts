import type { FileRow } from '@/db/schema';
import { groupByFolder, normalizeForSearch, queryFiles, recentFiles } from '../fileQuery';

function row(over: Partial<FileRow> & { id: string; name: string }): FileRow {
  return {
    uri: `file:///docs/${over.id}`,
    folder: 'Docs',
    parentUri: 'file:///docs',
    sizeBytes: 100,
    modifiedAt: 1000,
    pageCount: null,
    thumbPath: null,
    isEncrypted: false,
    isFavorite: false,
    lastPage: null,
    lastOpenedAt: null,
    source: 'scan',
    ...over,
  };
}

const FILES: FileRow[] = [
  row({ id: 'a', name: 'अहवाल.pdf', sizeBytes: 500, modifiedAt: 5000, isFavorite: true }),
  row({ id: 'b', name: 'Report 10.pdf', sizeBytes: 300, modifiedAt: 4000, lastOpenedAt: 9000 }),
  row({ id: 'c', name: 'Report 9.pdf', sizeBytes: 900, modifiedAt: 3000, lastOpenedAt: 8000 }),
  row({
    id: 'd',
    name: 'Invoice.pdf',
    sizeBytes: 100,
    modifiedAt: 2000,
    folder: 'Work',
    parentUri: 'file:///work',
    isFavorite: true,
  }),
  row({
    id: 'e',
    name: 'Zeta.pdf',
    sizeBytes: 200,
    modifiedAt: 1000,
    folder: 'Work',
    parentUri: 'file:///work',
  }),
  row({ id: 'f', name: 'Alpha.pdf', sizeBytes: 700, modifiedAt: 6000 }),
];

const base = { segment: 'all', sortKey: 'name', sortDir: 'asc', search: '' } as const;
const ids = (rows: FileRow[]) => rows.map((r) => r.id);

describe('queryFiles', () => {
  it('sorts names naturally (9 before 10)', () => {
    const r = ids(queryFiles(FILES, base));
    expect(r.indexOf('c')).toBeLessThan(r.indexOf('b'));
  });

  it('sorts by size desc and date desc', () => {
    expect(ids(queryFiles(FILES, { ...base, sortKey: 'size', sortDir: 'desc' }))[0]).toBe('c');
    expect(ids(queryFiles(FILES, { ...base, sortKey: 'date', sortDir: 'desc' }))).toEqual([
      'f',
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });

  it('favorites only', () => {
    expect(ids(queryFiles(FILES, { ...base, segment: 'favorites' })).sort()).toEqual(['a', 'd']);
  });

  it('recent puts opened rows first, newest open first, then pads by modifiedAt', () => {
    expect(ids(queryFiles(FILES, { ...base, segment: 'recent' }))).toEqual([
      'b',
      'c',
      'f',
      'a',
      'd',
      'e',
    ]);
    expect(ids(recentFiles(FILES, 3))).toEqual(['b', 'c', 'f']);
  });

  it('search is case-insensitive substring', () => {
    expect(ids(queryFiles(FILES, { ...base, search: 'report' })).sort()).toEqual(['b', 'c']);
  });

  it('search matches across Unicode normalization forms', () => {
    const nfd = 'अहवाल'.normalize('NFD');
    expect(ids(queryFiles(FILES, { ...base, search: nfd }))).toEqual(['a']);
    expect(normalizeForSearch('ABC')).toBe('abc');
  });

  it('filters by parentUri', () => {
    expect(ids(queryFiles(FILES, { ...base, parentUri: 'file:///work' }))).toEqual(['d', 'e']);
  });

  it('breaks ties by id', () => {
    const tied = [row({ id: 'y', name: 'x.pdf' }), row({ id: 'x', name: 'x.pdf' })];
    expect(ids(queryFiles(tied, base))).toEqual(['x', 'y']);
  });

  it('searches 1,000 rows in under 100 ms', () => {
    const many = Array.from({ length: 1000 }, (_, i) =>
      row({ id: `id${i}`, name: `File ${i}.pdf` }),
    );
    const q = { ...base, search: '7' };
    queryFiles(many, q);
    const t0 = performance.now();
    const out = queryFiles(many, q);
    expect(performance.now() - t0).toBeLessThan(100);
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('groupByFolder', () => {
  it('counts per folder with latest modifiedAt', () => {
    expect(groupByFolder(FILES, '')).toEqual([
      { parentUri: 'file:///docs', folder: 'Docs', count: 4, latestModifiedAt: 6000 },
      { parentUri: 'file:///work', folder: 'Work', count: 2, latestModifiedAt: 2000 },
    ]);
  });

  it('search matches folder name', () => {
    expect(groupByFolder(FILES, 'wor').map((g) => g.folder)).toEqual(['Work']);
  });
});

describe('legacy rows without parentUri', () => {
  const legacy = row({
    id: 'L',
    name: 'Old.pdf',
    folder: 'Old',
    parentUri: null,
    modifiedAt: 7000,
  });
  const sameNameA = row({
    id: 'S1',
    name: 's1.pdf',
    folder: 'Shared',
    parentUri: 'file:///a/Shared',
  });
  const sameNameB = row({
    id: 'S2',
    name: 's2.pdf',
    folder: 'Shared',
    parentUri: 'file:///b/Shared',
  });

  it('groups them under a stable legacy key and queryFiles can open that group', () => {
    const groups = groupByFolder([...FILES, legacy], '');
    const g = groups.find((x) => x.folder === 'Old');
    expect(g).toEqual({ parentUri: 'legacy:Old', folder: 'Old', count: 1, latestModifiedAt: 7000 });
    expect(ids(queryFiles([...FILES, legacy], { ...base, parentUri: 'legacy:Old' }))).toEqual([
      'L',
    ]);
  });

  it('keeps same-named folders with different parents separate', () => {
    const groups = groupByFolder([sameNameA, sameNameB], '');
    expect(groups.map((x) => x.parentUri)).toEqual(['file:///a/Shared', 'file:///b/Shared']);
    expect(
      ids(queryFiles([sameNameA, sameNameB], { ...base, parentUri: 'file:///b/Shared' })),
    ).toEqual(['S2']);
  });
});
