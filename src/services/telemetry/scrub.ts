/** Longest error message sent with a crash report. */
export const MAX_ERROR_MESSAGE = 200;

const QUOTED = /(["'`])[^"'`\n]*\1/g;
const URI = /\b[a-z][a-z0-9+.-]*:\/\/\S*/gi;
const WINDOWS_PATH = /\b[a-z]:\\\S*/gi;
/** Any token with a path separator: absolute (/storage/…, /data/…, /sdcard/…) or relative. */
const PATH_TOKEN = /[^\s"'`()<>[\]{},;]*[/\\][^\s"'`()<>[\]{},;]*/g;
const FILE_NAME =
  /[^\s"'`()<>[\]{},;/\\]+\.(?:pdf|jpe?g|png|webp|heic|heif|gif|bmp|tiff?|txt|docx?|xlsx?|pptx?|csv|zip|json|xml|html?)\b/gi;

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
  } catch {
    return '<unprintable>';
  }
}

/**
 * An error message with everything that could name the user's files removed: quoted text, URIs,
 * paths and file names with a document or image extension. Truncated to MAX_ERROR_MESSAGE.
 */
export function scrubErrorMessage(value: unknown): string {
  return textOf(value)
    .replace(QUOTED, '<redacted>')
    .replace(URI, '<uri>')
    .replace(WINDOWS_PATH, '<path>')
    .replace(PATH_TOKEN, (token) => (token === '<uri>' ? token : '<path>'))
    .replace(FILE_NAME, '<file>')
    .slice(0, MAX_ERROR_MESSAGE);
}
