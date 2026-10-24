import { getAnalytics, setAnalyticsCollectionEnabled } from '@react-native-firebase/analytics';
import {
  deleteUnsentReports,
  getCrashlytics,
  recordError,
  setCrashlyticsCollectionEnabled,
} from '@react-native-firebase/crashlytics';

import { pdfNative } from '@/services/native/pdfNative';

import { firebaseTelemetry } from '../firebaseTelemetry';
import type { ToolEvent } from '../toolEvent';

const event: ToolEvent = {
  name: 'tool_finished',
  params: {
    tool: 'split',
    result: 'failed',
    failure: 'io',
    duration_ms: 300,
    inputs: 1,
    pages_bucket: '0',
  },
};

const analytics = () => (getAnalytics as jest.Mock)() as { logEvent: jest.Mock };
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => jest.clearAllMocks());

describe('firebaseTelemetry', () => {
  it('logs the event by name with its params', () => {
    firebaseTelemetry.log(event);
    expect(analytics().logEvent).toHaveBeenCalledWith('tool_finished', event.params);
  });

  it('swallows a rejected logEvent', async () => {
    analytics().logEvent.mockReturnValueOnce(Promise.reject(new Error('offline')));
    expect(() => firebaseTelemetry.log(event)).not.toThrow();
    await flush();
  });

  it('sets analytics and crash collection', async () => {
    await firebaseTelemetry.setCollection({ analytics: true, crashes: true });
    expect(setAnalyticsCollectionEnabled).toHaveBeenCalledWith(expect.anything(), true);
    expect(setCrashlyticsCollectionEnabled).toHaveBeenCalledWith(expect.anything(), true);
    expect(deleteUnsentReports).not.toHaveBeenCalled();
  });

  it('drops reports cached while crash reports are off', async () => {
    await firebaseTelemetry.setCollection({ analytics: false, crashes: false });
    expect(setAnalyticsCollectionEnabled).toHaveBeenCalledWith(expect.anything(), false);
    expect(setCrashlyticsCollectionEnabled).toHaveBeenCalledWith(expect.anything(), false);
    expect(deleteUnsentReports).toHaveBeenCalledTimes(1);
  });

  it('switches native crash collection off in this process before dropping cached reports', async () => {
    const order: string[] = [];
    const disable = jest.spyOn(pdfNative, 'disableCrashlyticsNow').mockImplementation(() => {
      order.push('disableNow');
      return true;
    });
    (deleteUnsentReports as jest.Mock).mockImplementationOnce(() => {
      order.push('deleteUnsent');
      return Promise.resolve();
    });
    await firebaseTelemetry.setCollection({ analytics: true, crashes: false });
    expect(disable).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['disableNow', 'deleteUnsent']);
    disable.mockRestore();
  });

  it('leaves native crash collection alone when crash reports stay on', async () => {
    const disable = jest.spyOn(pdfNative, 'disableCrashlyticsNow');
    await firebaseTelemetry.setCollection({ analytics: false, crashes: true });
    expect(disable).not.toHaveBeenCalled();
    disable.mockRestore();
  });

  it('still drops cached reports when the native switch throws', async () => {
    const disable = jest.spyOn(pdfNative, 'disableCrashlyticsNow').mockImplementation(() => {
      throw new Error('no module');
    });
    await expect(
      firebaseTelemetry.setCollection({ analytics: false, crashes: false }),
    ).resolves.toBeUndefined();
    expect(deleteUnsentReports).toHaveBeenCalledTimes(1);
    disable.mockRestore();
  });

  it('records a non-fatal error with Crashlytics', () => {
    const error = new Error('Invalid PDF structure');
    firebaseTelemetry.recordError(error);
    expect(recordError).toHaveBeenCalledWith(getCrashlytics(), error);
  });
});
