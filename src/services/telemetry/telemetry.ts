import Constants from 'expo-constants';

import type { ToolEvent } from './toolEvent';

export type CollectionPrefs = { analytics: boolean; crashes: boolean };

/** What a backend (Firebase) implements. */
export type TelemetryAdapter = {
  setCollection(prefs: CollectionPrefs): Promise<void>;
  log(event: ToolEvent): void;
};

export type Telemetry = TelemetryAdapter & {
  /**
   * Whether the ads consent state (UMP NOT_REQUIRED or OBTAINED) allows analytics. False until
   * told otherwise; crash reports do not depend on it.
   */
  setAnalyticsConsent(allowed: boolean): Promise<void>;
};

export const noopTelemetry: Telemetry = {
  setCollection: () => Promise.resolve(),
  setAnalyticsConsent: () => Promise.resolve(),
  log: () => {},
};

/**
 * Analytics runs only while consent allows it and the user has not opted out; crash reports
 * follow only the user's crash opt-out (on by default). Nothing here ever throws or rejects.
 */
export function createTelemetry(
  firebaseEnabled: boolean,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  load: () => TelemetryAdapter = () => require('./firebaseTelemetry').firebaseTelemetry,
): Telemetry {
  if (!firebaseEnabled) return noopTelemetry;
  let adapter: TelemetryAdapter | undefined;
  try {
    adapter = load();
  } catch {
    adapter = undefined;
  }
  if (!adapter) return noopTelemetry;
  const backend = adapter;

  let prefs: CollectionPrefs = { analytics: true, crashes: true };
  let consent = false;
  const analyticsOn = () => consent && prefs.analytics;

  async function apply(): Promise<void> {
    try {
      await backend.setCollection({ analytics: analyticsOn(), crashes: prefs.crashes });
    } catch {
      // Collection stays as it was; the next change tries again.
    }
  }

  return {
    setCollection(next) {
      prefs = { analytics: next.analytics, crashes: next.crashes };
      return apply();
    },
    setAnalyticsConsent(allowed) {
      consent = allowed;
      return apply();
    },
    log(event) {
      if (!analyticsOn()) return;
      try {
        backend.log(event);
      } catch {
        // Telemetry never affects the app.
      }
    },
  };
}

export const telemetry = createTelemetry(Constants.expoConfig?.extra?.firebaseEnabled === true);
