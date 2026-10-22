import { displayName } from '@/utils/displayName';

export type FileNameResult =
  { ok: true; name: string } | { ok: false; reason: 'empty' | 'invalidChars' | 'tooLong' };

const FORBIDDEN = /[/\\:*?"<>|\u0000-\u001f\u007f]/;
const MAX_NAME_BYTES = 255; // mirrors FileNames.MAX_NAME_BYTES in the native module

/** Mirrors native FileNames.isValidName (plus Windows-reserved characters) so the UI catches bad names first. */
export function validatePdfFileName(input: string): FileNameResult {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };
  if (FORBIDDEN.test(trimmed) || trimmed.startsWith('.'))
    return { ok: false, reason: 'invalidChars' };
  const name = /\.pdf$/i.test(trimmed) ? trimmed : `${trimmed}.pdf`;
  if (new TextEncoder().encode(name).length > MAX_NAME_BYTES)
    return { ok: false, reason: 'tooLong' };
  return { ok: true, name };
}

const MAX_BASE_BYTES = 200;

/** Base name for generated output files: display-safe, no .pdf, no path or reserved characters. */
export function outputBaseName(name: string): string {
  const base = displayName(name)
    .replace(/\.pdf$/i, '')
    .replace(/[/\\:*?"<>|]/g, '_')
    .trim()
    .replace(/^\.+/, '');
  const encoder = new TextEncoder();
  let bytes = 0;
  let out = '';
  for (const ch of base) {
    bytes += encoder.encode(ch).length;
    if (bytes > MAX_BASE_BYTES) break;
    out += ch;
  }
  return out.trimEnd() || 'document';
}
