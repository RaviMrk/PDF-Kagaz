export type NewPasswordError = 'tooShort' | 'tooLong' | 'mismatch';

const MIN_CODE_POINTS = 4;
/** PDF 2.0 (AES-256) passwords are cut at 127 UTF-8 bytes. */
const MAX_UTF8_BYTES = 127;

function utf8Length(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** Why `password` (typed twice) cannot protect a PDF, or null; the match is checked last. */
export function validateNewPassword(password: string, confirm: string): NewPasswordError | null {
  if ([...password].length < MIN_CODE_POINTS) return 'tooShort';
  if (utf8Length(password) > MAX_UTF8_BYTES) return 'tooLong';
  if (password !== confirm) return 'mismatch';
  return null;
}
