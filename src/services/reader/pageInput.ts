const DEVANAGARI_ZERO = 0x0966;

export function parsePageInput(text: string, pageCount: number): number | null {
  const t = text.trim();
  if (!/^[0-9०-९]+$/.test(t)) return null;
  let n = 0;
  for (const ch of t) {
    const c = ch.charCodeAt(0);
    n = n * 10 + (c >= DEVANAGARI_ZERO ? c - DEVANAGARI_ZERO : c - 48);
    if (n > pageCount) return null;
  }
  return n >= 1 ? n : null;
}
