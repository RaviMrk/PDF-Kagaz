import { incomingPdfHref, isOpenRouteLink } from '@/services/intent/incomingLink';

/**
 * Expo Router hook for system links. A raw content:// or file:// VIEW of a PDF goes to /open
 * under a one-time nonce; app links aimed at /open are refused; anything else passes through.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return incomingPdfHref(path) ?? (isOpenRouteLink(path) ? '/' : path);
  } catch {
    return '/';
  }
}
