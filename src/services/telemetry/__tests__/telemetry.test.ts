import type { ToolEvent } from '../toolEvent';
import {
  createTelemetry,
  noopTelemetry,
  type CollectionPrefs,
  type TelemetryAdapter,
} from '../telemetry';

const event: ToolEvent = {
  name: 'tool_finished',
  params: {
    tool: 'merge',
    result: 'success',
    failure: 'none',
    duration_ms: 100,
    inputs: 2,
    pages_bucket: '1-10',
  },
};

function fakeAdapter(): jest.Mocked<TelemetryAdapter> {
  return {
    setCollection: jest.fn((_prefs: CollectionPrefs) => Promise.resolve()),
    log: jest.fn((_event: ToolEvent) => {}),
    recordError: jest.fn((_error: Error) => {}),
  };
}

const flush = () => new Promise((r) => setImmediate(r));

describe('createTelemetry', () => {
  it('never loads the adapter when Firebase is not configured', async () => {
    const load = jest.fn(fakeAdapter);
    const telemetry = createTelemetry(false, load);
    await telemetry.setCollection({ analytics: true, crashes: true });
    await telemetry.setAnalyticsConsent(true);
    telemetry.log(event);
    expect(load).not.toHaveBeenCalled();
  });

  it('falls back to a no-op when the adapter cannot be loaded', async () => {
    const telemetry = createTelemetry(true, () => {
      throw new Error('native module missing');
    });
    await expect(telemetry.setCollection({ analytics: true, crashes: true })).resolves.toBe(
      undefined,
    );
    await expect(telemetry.setAnalyticsConsent(true)).resolves.toBe(undefined);
    expect(() => telemetry.log(event)).not.toThrow();
  });

  it('swallows adapter throws and rejections', async () => {
    const adapter = fakeAdapter();
    adapter.log.mockImplementation(() => {
      throw new Error('boom');
    });
    adapter.setCollection.mockRejectedValue(new Error('offline'));
    const telemetry = createTelemetry(true, () => adapter);
    await expect(telemetry.setAnalyticsConsent(true)).resolves.toBe(undefined);
    expect(() => telemetry.log(event)).not.toThrow();
    expect(adapter.log).toHaveBeenCalledTimes(1);
    adapter.setCollection.mockImplementation(() => {
      throw new Error('sync');
    });
    await expect(telemetry.setCollection({ analytics: true, crashes: true })).resolves.toBe(
      undefined,
    );
    await flush();
  });

  it('sends no analytics until consent allows it; crash reports stay on', async () => {
    const adapter = fakeAdapter();
    const telemetry = createTelemetry(true, () => adapter);
    await telemetry.setCollection({ analytics: true, crashes: true });
    expect(adapter.setCollection).toHaveBeenLastCalledWith({ analytics: false, crashes: true });
    telemetry.log(event);
    expect(adapter.log).not.toHaveBeenCalled();

    await telemetry.setAnalyticsConsent(true);
    expect(adapter.setCollection).toHaveBeenLastCalledWith({ analytics: true, crashes: true });
    telemetry.log(event);
    expect(adapter.log).toHaveBeenCalledWith(event);

    await telemetry.setAnalyticsConsent(false);
    expect(adapter.setCollection).toHaveBeenLastCalledWith({ analytics: false, crashes: true });
    adapter.log.mockClear();
    telemetry.log(event);
    expect(adapter.log).not.toHaveBeenCalled();
  });

  it('an analytics opt-out wins over consent; crashes follow only their own opt-out', async () => {
    const adapter = fakeAdapter();
    const telemetry = createTelemetry(true, () => adapter);
    await telemetry.setAnalyticsConsent(true);
    await telemetry.setCollection({ analytics: false, crashes: true });
    expect(adapter.setCollection).toHaveBeenLastCalledWith({ analytics: false, crashes: true });
    telemetry.log(event);
    expect(adapter.log).not.toHaveBeenCalled();

    await telemetry.setCollection({ analytics: true, crashes: false });
    expect(adapter.setCollection).toHaveBeenLastCalledWith({ analytics: true, crashes: false });
    telemetry.log(event);
    expect(adapter.log).toHaveBeenCalledTimes(1);

    await telemetry.setAnalyticsConsent(false);
    expect(adapter.setCollection).toHaveBeenLastCalledWith({ analytics: false, crashes: false });
  });

  it('the no-op telemetry does nothing and never throws', async () => {
    await expect(noopTelemetry.setCollection({ analytics: true, crashes: true })).resolves.toBe(
      undefined,
    );
    await expect(noopTelemetry.setAnalyticsConsent(true)).resolves.toBe(undefined);
    expect(() => noopTelemetry.log(event)).not.toThrow();
  });

  it('records errors only while crash reports are on, never throwing', async () => {
    const adapter = fakeAdapter();
    const telemetry = createTelemetry(true, () => adapter);
    const error = new Error('x');
    telemetry.recordError(error);
    expect(adapter.recordError).toHaveBeenCalledWith(error);
    await telemetry.setCollection({ analytics: true, crashes: false });
    telemetry.recordError(error);
    expect(adapter.recordError).toHaveBeenCalledTimes(1);
    await telemetry.setCollection({ analytics: false, crashes: true });
    adapter.recordError.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => telemetry.recordError(error)).not.toThrow();
    expect(() => noopTelemetry.recordError(error)).not.toThrow();
  });
});
