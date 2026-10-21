import { allowIncomingUri, incomingPdfHref, isOpenRouteLink } from '@/services/intent/incomingLink';

/**
 * Expo Router hook for system links. A raw content:// or file:// VIEW of a PDF goes to /open with
 * a one-shot permit; app links aimed at /open are refused; anything else passes through.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const href = incomingPdfHref(path);
    if (href != null) {
      allowIncomingUri(path);
      return href;
    }
    return isOpenRouteLink(path) ? '/' : path;
  } catch {
    return '/';
  }
}
