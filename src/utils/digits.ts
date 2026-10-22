const DEVANAGARI_ZERO = 0x0966;

/** Maps Devanagari digits (U+0966–U+096F) to ASCII 0–9; everything else is unchanged. */
export function toAsciiDigits(text: string): string {
  return text.replace(/[०-९]/g, (ch) => String(ch.charCodeAt(0) - DEVANAGARI_ZERO));
}
