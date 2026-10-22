import { everyNGroups, formatPageRanges, parsePageRanges, uniqueSortedPages } from '../pageRanges';

describe('parsePageRanges', () => {
  it('parses singles and ranges in input order', () => {
    expect(parsePageRanges('1-3, 5, 8-10', 10)).toEqual({
      ok: true,
      groups: [[1, 2, 3], [5], [8, 9, 10]],
    });
  });
  it('ignores whitespace and accepts en/em dashes', () => {
    expect(parsePageRanges(' 2 – 4 ,7', 10)).toEqual({ ok: true, groups: [[2, 3, 4], [7]] });
    expect(parsePageRanges('2—4', 10)).toEqual({ ok: true, groups: [[2, 3, 4]] });
  });
  it('accepts Devanagari digits', () => {
    expect(parsePageRanges('१-३', 10)).toEqual({ ok: true, groups: [[1, 2, 3]] });
  });
  it.each(['', ' , '])('reports empty for %p', (t) => {
    expect(parsePageRanges(t, 10)).toEqual({ ok: false, error: 'empty' });
  });
  it.each(['1-', 'a', '1--3', '1-2-3', '1.5'])('reports syntax for %p', (t) => {
    expect(parsePageRanges(t, 10)).toEqual({ ok: false, error: 'syntax' });
  });
  it.each(['0', '11', '9-12'])('reports outOfRange for %p', (t) => {
    expect(parsePageRanges(t, 10)).toEqual({ ok: false, error: 'outOfRange' });
  });
  it('reports reversed ranges', () => {
    expect(parsePageRanges('5-3', 10)).toEqual({ ok: false, error: 'reversed' });
  });
});

describe('uniqueSortedPages', () => {
  it('dedupes and sorts', () => {
    expect(uniqueSortedPages([[5], [1, 2], [2]])).toEqual([1, 2, 5]);
  });
});

describe('formatPageRanges', () => {
  it('collapses runs', () => {
    expect(formatPageRanges([10, 1, 2, 3, 5, 8, 9])).toBe('1-3, 5, 8-10');
    expect(formatPageRanges([])).toBe('');
  });
});

describe('everyNGroups', () => {
  it('chunks pages', () => {
    expect(everyNGroups(7, 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });
  it('returns nothing for invalid n', () => {
    expect(everyNGroups(5, 0)).toEqual([]);
    expect(everyNGroups(5, 1.5)).toEqual([]);
  });
});
