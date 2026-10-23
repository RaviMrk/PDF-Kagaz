import { getAnalytics, setAnalyticsCollectionEnabled } from '@react-native-firebase/analytics';
import {
  deleteUnsentReports,
  getCrashlytics,
  recordError,
  setCrashlyticsCollectionEnabled,
} from '@react-native-firebase/crashlytics';

import type { TelemetryAdapter } from './telemetry';

/**
 * Firebase backend. Required lazily by telemetry.ts, and only when google-services.json was
 * present at build time (otherwise the native modules are not linked). No custom Crashlytics logs
 * or keys are ever sent.
 */
// Creating the Crashlytics instance installs its JS error handler now, before telemetry.ts wraps
// it with the scrubbing handler (firebase.json turns its own JS error reports off).
getCrashlytics();

export const firebaseTelemetry: TelemetryAdapter = {
  async setCollection({ analytics, crashes }) {
    await Promise.all([
      setAnalyticsCollectionEnabled(getAnalytics(), analytics),
      setCrashlyticsCollectionEnabled(getCrashlytics(), crashes),
    ]);
    // Reports cached while opted out are never sent.
    if (!crashes) await deleteUnsentReports(getCrashlytics());
  },
  log(event) {
    // The instance method, unlike the modular logEvent (which discards it), returns the promise,
    // so a native rejection can be swallowed here.
    getAnalytics()
      .logEvent(event.name, event.params)
      .catch(() => {});
  },
  recordError(error) {
    recordError(getCrashlytics(), error);
  },
};
