const INCOMING_URI = /^(content|file):\/\//i;

/** The /open route for a PDF handed to the app by another app ("Open with"); null for app links. */
export function incomingPdfHref(path: string): string | null {
  return INCOMING_URI.test(path) ? `/open?uri=${encodeURIComponent(path)}` : null;
}
