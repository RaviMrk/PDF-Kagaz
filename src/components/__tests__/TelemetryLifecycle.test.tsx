import { act, render } from '@testing-library/react-native';

import { TelemetryLifecycle } from '@/components/TelemetryLifecycle';
import { useSettings } from '@/stores/settingsStore';

const mockSetCollection = jest.fn((_prefs: { analytics: boolean; crashes: boolean }) =>
  Promise.resolve(),
);
jest.mock('@/services/telemetry/telemetry', () => ({
  telemetry: {
    setCollection: (prefs: { analytics: boolean; crashes: boolean }) => mockSetCollection(prefs),
  },
}));

describe('TelemetryLifecycle', () => {
  it('applies the opt-outs on mount and whenever either changes', async () => {
    useSettings.getState().setAnalyticsEnabled(true);
    useSettings.getState().setCrashReportsEnabled(true);
    await render(<TelemetryLifecycle />);
    expect(mockSetCollection).toHaveBeenLastCalledWith({ analytics: true, crashes: true });

    await act(async () => useSettings.getState().setAnalyticsEnabled(false));
    expect(mockSetCollection).toHaveBeenLastCalledWith({ analytics: false, crashes: true });

    await act(async () => useSettings.getState().setCrashReportsEnabled(false));
    expect(mockSetCollection).toHaveBeenLastCalledWith({ analytics: false, crashes: false });
    expect(mockSetCollection).toHaveBeenCalledTimes(3);
  });

  it('turns crash reports off in its first commit for a user who opted out', async () => {
    mockSetCollection.mockClear();
    useSettings.getState().setAnalyticsEnabled(true);
    useSettings.getState().setCrashReportsEnabled(false);
    await render(<TelemetryLifecycle />);
    expect(mockSetCollection).toHaveBeenCalledTimes(1);
    expect(mockSetCollection).toHaveBeenCalledWith({ analytics: true, crashes: false });
  });
});
