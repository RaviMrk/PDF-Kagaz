import { incomingPdfHref } from '@/services/intent/incomingLink';

/** Expo Router hook: ACTION_VIEW content:// and file:// PDFs go to /open; other paths as is. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return incomingPdfHref(path) ?? path;
  } catch {
    return '/';
  }
}
