// C0/C1 controls, Arabic letter mark, LRM/RLM, bidi embeddings/overrides and isolates.
const UNSAFE = /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/** A file name safe to render or speak: no control or bidi characters. Stored names are unchanged. */
export function displayName(name: string): string {
  return name.replace(UNSAFE, '').trim() || 'document.pdf';
}
