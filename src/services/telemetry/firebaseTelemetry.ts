import { getAnalytics, setAnalyticsCollectionEnabled } from '@react-native-firebase/analytics';
import {
  getCrashlytics,
  setCrashlyticsCollectionEnabled,
} from '@react-native-firebase/crashlytics';

import type { TelemetryAdapter } from './telemetry';

/**
 * Firebase backend. Required lazily by telemetry.ts, and only when google-services.json was
 * present at build time (otherwise the native modules are not linked). No custom Crashlytics logs
 * or keys are ever sent.
 */
export const firebaseTelemetry: TelemetryAdapter = {
  async setCollection({ analytics, crashes }) {
    await Promise.all([
      setAnalyticsCollectionEnabled(getAnalytics(), analytics),
      setCrashlyticsCollectionEnabled(getCrashlytics(), crashes),
    ]);
  },
  log(event) {
    // The instance method, unlike the modular logEvent (which discards it), returns the promise,
    // so a native rejection can be swallowed here.
    getAnalytics()
      .logEvent(event.name, event.params)
      .catch(() => {});
  },
};
