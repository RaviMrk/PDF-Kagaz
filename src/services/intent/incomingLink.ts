const INCOMING_URI = /^(content|file):\/\//i;
const SCHEME = /^[a-z][a-z0-9+.-]*:(\/\/)?/i;

/**
 * One-shot permits for /open: only URIs that came from a system intent (VIEW via +native-intent,
 * SEND via useIncomingPdfs) may be resolved, so an app deep link to /open cannot import files.
 */
const permits = new Set<string>();
const MAX_PERMITS = 16;

export function allowIncomingUri(uri: string): void {
  permits.delete(uri);
  permits.add(uri);
  // Permits whose /open never mounted are dropped oldest first.
  while (permits.size > MAX_PERMITS) permits.delete(permits.values().next().value as string);
}

/** True once per permitted uri. */
export function takeIncomingPermit(uri: string): boolean {
  return permits.delete(uri);
}

/** The /open route for a PDF handed to the app by another app ("Open with"); null for app links. */
export function incomingPdfHref(path: string): string | null {
  return INCOMING_URI.test(path) ? `/open?uri=${encodeURIComponent(path)}` : null;
}

/** Whether an app link (any scheme, or a bare path) would land on the /open route. */
export function isOpenRouteLink(path: string): boolean {
  const pathname = path.replace(SCHEME, '').split(/[?#]/)[0] ?? '';
  return decodeURIComponent(pathname)
    .split('/')
    .some((segment) => segment.trim().toLowerCase() === 'open');
}
