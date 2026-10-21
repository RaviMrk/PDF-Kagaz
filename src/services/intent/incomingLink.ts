const INCOMING_URI = /^(content|file):\/\//i;
const SCHEME = /^[a-z][a-z0-9+.-]*:(\/\/)?/i;
const MAX_PENDING = 16;

/**
 * Raw URIs handed to the app by a system intent, keyed by a one-time nonce. /open only ever sees
 * the nonce: route params are decoded (twice) by the router, which would alter percent-encoded
 * content:// URIs, and an app deep link to /open cannot name a file. Memory only, never persisted.
 */
const pending = new Map<string, string>();

function newNonce(): string {
  // expo-modules-core's native UUID v4 (java.util.UUID.randomUUID, backed by SecureRandom).
  return globalThis.expo.uuidv4();
}

/** A raw content:// or file:// URI, as delivered by an ACTION_VIEW or ACTION_SEND intent. */
export function isIncomingPdfUri(path: string): boolean {
  return INCOMING_URI.test(path);
}

/** Registers the raw uri and returns its single-use nonce. */
export function registerIncomingUri(uri: string): string {
  const nonce = newNonce();
  pending.set(nonce, uri);
  // Nonces whose /open never mounted are dropped oldest first.
  while (pending.size > MAX_PENDING) pending.delete(pending.keys().next().value as string);
  return nonce;
}

/** The raw uri registered under this nonce, once; null for unknown or used nonces. */
export function takeIncomingUri(nonce: string): string | null {
  const uri = pending.get(nonce);
  if (uri === undefined) return null;
  pending.delete(nonce);
  return uri;
}

/** /open?t=<nonce> for a PDF handed to the app ("Open with"); null for app links. */
export function incomingPdfHref(path: string): string | null {
  return isIncomingPdfUri(path) ? `/open?t=${registerIncomingUri(path)}` : null;
}

/** Whether an app link (any scheme, or a bare path) would land on the /open route. */
export function isOpenRouteLink(path: string): boolean {
  const pathname = path.replace(SCHEME, '').split(/[?#]/)[0] ?? '';
  return decodeURIComponent(pathname)
    .split('/')
    .some((segment) => segment.trim().toLowerCase() === 'open');
}
