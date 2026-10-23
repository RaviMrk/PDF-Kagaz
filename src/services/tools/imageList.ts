import { move } from './reorder';
import type { ImageItem } from './imageSession';

/** Pure list operations for the image session list (Images to PDF and the scan review). */

export function appendItems(list: ImageItem[], added: ImageItem[]): ImageItem[] {
  return [...list, ...added];
}

/** The list in the order of `keys`; a different key set (or a duplicate) returns `list` itself. */
export function reorderByKeys(list: ImageItem[], keys: string[]): ImageItem[] {
  if (keys.length !== list.length) return list;
  const byKey = new Map(list.map((i) => [i.key, i]));
  if (byKey.size !== list.length || new Set(keys).size !== keys.length) return list;
  const out: ImageItem[] = [];
  for (const key of keys) {
    const found = byKey.get(key);
    if (!found) return list;
    out.push(found);
  }
  return out;
}

export function removeKey(list: ImageItem[], key: string): ImageItem[] {
  return list.filter((i) => i.key !== key);
}

export function moveKey(list: ImageItem[], key: string, delta: -1 | 1): ImageItem[] {
  const at = list.findIndex((i) => i.key === key);
  return at < 0 ? list : move(list, at, at + delta);
}

/** The next unused source index: after the highest one in the list, so removals never collide. */
export function nextSourceIndex(list: ImageItem[]): number {
  return list.reduce((max, i) => Math.max(max, i.index + 1), 0);
}
