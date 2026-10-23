import { useEffect } from 'react';

import { telemetry } from '@/services/telemetry/telemetry';
import { useSettings } from '@/stores/settingsStore';

/** Applies the analytics and crash-report opt-outs at startup and whenever either changes. */
export function TelemetryLifecycle() {
  const analytics = useSettings((s) => s.analyticsEnabled);
  const crashes = useSettings((s) => s.crashReportsEnabled);
  useEffect(() => {
    void telemetry.setCollection({ analytics, crashes });
  }, [analytics, crashes]);
  return null;
}
