import { useEffect } from 'react';

import { useAds } from '@/services/ads/adsStore';
import { useSettings } from '@/stores/settingsStore';

/** Gathers ads consent (and then starts the SDK) once per cold start, after onboarding. */
export function AdsLifecycle() {
  const onboardingDone = useSettings((s) => s.onboardingDone);
  useEffect(() => {
    if (onboardingDone) void useAds.getState().start();
  }, [onboardingDone]);
  return null;
}
