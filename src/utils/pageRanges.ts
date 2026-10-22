import { toAsciiDigits } from '@/utils/digits';

export type PageRangeError = 'empty' | 'syntax' | 'outOfRange' | 'reversed';

export type PageRangeResult =
  { ok: true; groups: number[][] } | { ok: false; error: PageRangeError };

const ITEM = /^(\d+)(?:[-–—](\d+))?$/;

/** Parses "1-3, 5, 8-10" into ascending page groups in input order (1-based). */
export function parsePageRanges(text: string, pageCount: number): PageRangeResult {
  const items = toAsciiDigits(text)
    .replace(/\s+/g, '')
    .split(',')
    .filter((s) => s !== '');
  if (items.length === 0) return { ok: false, error: 'empty' };
  const groups: number[][] = [];
  for (const item of items) {
    const m = ITEM.exec(item);
    if (!m) return { ok: false, error: 'syntax' };
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    if (a < 1 || b > pageCount || a > pageCount) return { ok: false, error: 'outOfRange' };
    if (b < a) return { ok: false, error: 'reversed' };
    const group: number[] = [];
    for (let p = a; p <= b; p++) group.push(p);
    groups.push(group);
  }
  return { ok: true, groups };
}

export function uniqueSortedPages(groups: number[][]): number[] {
  return [...new Set(groups.flat())].sort((x, y) => x - y);
}

/** Sorted, unique pages with consecutive runs collapsed: "1-3, 5, 8-10". */
export function formatPageRanges(pages: readonly number[]): string {
  const sorted = [...new Set(pages)].sort((x, y) => x - y);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    parts.push(j > i ? `${sorted[i]}-${sorted[j]}` : `${sorted[i]}`);
    i = j + 1;
  }
  return parts.join(', ');
}

export function everyNGroups(pageCount: number, n: number): number[][] {
  if (!Number.isInteger(n) || n < 1) return [];
  const groups: number[][] = [];
  for (let start = 1; start <= pageCount; start += n) {
    const group: number[] = [];
    for (let p = start; p < start + n && p <= pageCount; p++) group.push(p);
    groups.push(group);
  }
  return groups;
}
