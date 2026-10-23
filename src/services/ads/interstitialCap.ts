export const INTERSTITIAL_CAP_MS = 180_000;

/** True when no interstitial was shown yet or the cap has passed; false when the clock moved back. */
export function canShowInterstitial(
  lastShownAt: number | null,
  now: number,
  capMs = INTERSTITIAL_CAP_MS,
): boolean {
  if (lastShownAt === null) return true;
  if (now < lastShownAt) return false;
  return now - lastShownAt >= capMs;
}
