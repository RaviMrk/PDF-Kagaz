import { incomingPdfHref, isIncomingPdfUri, isOpenRouteLink } from '@/services/intent/incomingLink';

/**
 * Expo Router hook for system links. A raw content:// or file:// VIEW of a PDF while running goes
 * to /open under a one-time nonce; the launch VIEW is left to takeIncomingPdf (useIncomingPdfs),
 * since expo-router drops an initial URL that arrives late, so it is never opened twice. App links
 * aimed at /open are refused; anything else passes through.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  try {
    if (initial && isIncomingPdfUri(path)) return '/';
    return incomingPdfHref(path) ?? (isOpenRouteLink(path) ? '/' : path);
  } catch {
    return '/';
  }
}
