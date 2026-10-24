import { useEffect } from 'react';

import { adsEnabled } from '@/services/ads/adsConfig';
import { interstitial } from '@/services/ads/interstitial';
import { useAds } from '@/services/ads/adsStore';
import { useSettings } from '@/stores/settingsStore';
import { useToolJobs } from '@/stores/toolJobStore';

/**
 * Gathers ads consent (and then starts the SDK) once per cold start, after onboarding, and
 * preloads the interstitial whenever a tool job starts (a no-op unless consent allows ads).
 */
export function AdsLifecycle() {
  const onboardingDone = useSettings((s) => s.onboardingDone);
  useEffect(() => {
    if (adsEnabled() && onboardingDone) void useAds.getState().start();
  }, [onboardingDone]);
  useEffect(
    () =>
      !adsEnabled()
        ? undefined
        : useToolJobs.subscribe((state, prev) => {
            if (state.active && !prev.active) interstitial.preload();
          }),
    [],
  );
  return null;
}
