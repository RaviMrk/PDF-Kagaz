/** Display folder of the app's own folder (Documents/PDFToolkit on primary storage). */
export const APP_FOLDER_DISPLAY = 'Documents/PDFToolkit';

/** "/Documents/PDFToolkit/" in a file:// path or ":Documents/PDFToolkit/" in a SAF document id. */
const APP_FOLDER_IN_URI = /[/:]Documents\/PDFToolkit\//;

/**
 * Whether a file lives directly or nested in the app folder, judged from its display folder or
 * its decoded uri. MediaStore uris (content://media/…) carry no path: only the folder tells.
 */
export function isInAppFolder(file: { uri: string; folder?: string | null }): boolean {
  if (file.folder === APP_FOLDER_DISPLAY || file.folder?.startsWith(`${APP_FOLDER_DISPLAY}/`)) {
    return true;
  }
  try {
    return APP_FOLDER_IN_URI.test(decodeURIComponent(file.uri));
  } catch {
    return false;
  }
}
