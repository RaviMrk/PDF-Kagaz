/** A copy of `list` with the item at `from` moved to `to`; out-of-range indexes copy unchanged. */
export function move<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < list.length;
  if (!inRange(from) || !inRange(to)) return out;
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item as T);
  return out;
}
