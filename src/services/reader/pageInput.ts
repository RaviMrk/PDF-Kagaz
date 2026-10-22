import { toAsciiDigits } from '@/utils/digits';

export function parsePageInput(text: string, pageCount: number): number | null {
  const t = toAsciiDigits(text.trim());
  if (!/^[0-9]+$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= pageCount ? n : null;
}
