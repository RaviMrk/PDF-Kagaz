import { renderHook } from '@testing-library/react-native';

import { createFakePdfNative } from '@/test-utils/fakePdfNative';

import {
  APP_STARTED_AT,
  resetToolJobLifecycleForTests,
  useToolJobLifecycle,
} from '../useToolJobLifecycle';

const mockFailInterrupted = jest.fn((..._args: unknown[]): string[] => []);
jest.mock('@/services/tools/toolJobRepo', () => ({
  failInterruptedJobs: (...args: unknown[]) => mockFailInterrupted(...args),
}));

beforeEach(() => {
  mockFailInterrupted.mockReset();
  mockFailInterrupted.mockReturnValue([]);
  resetToolJobLifecycleForTests();
});

describe('useToolJobLifecycle', () => {
  it('fails interrupted jobs and cleans leftovers once on mount', async () => {
    const native = createFakePdfNative();
    const db = {} as never;
    const recoverJob = jest.fn();
    const deps = { getDb: () => db, native, now: () => 42, startedAt: APP_STARTED_AT, recoverJob };
    const hook = await renderHook(() => useToolJobLifecycle(deps));
    await hook.rerender({});
    expect(mockFailInterrupted).toHaveBeenCalledTimes(1);
    expect(mockFailInterrupted).toHaveBeenCalledWith(db, 42);
    expect(native.cleanupToolLeftovers).toHaveBeenCalledTimes(1);
    expect(native.cleanupToolLeftovers).toHaveBeenCalledWith(APP_STARTED_AT);
    expect(typeof APP_STARTED_AT).toBe('number');
    expect(recoverJob).not.toHaveBeenCalled();
  });

  it('surfaces the newest interrupted job, once per process', async () => {
    mockFailInterrupted.mockReturnValue(['newest', 'older']);
    const native = createFakePdfNative();
    const recoverJob = jest.fn();
    const deps = { getDb: () => ({}) as never, native, now: () => 1, startedAt: 5, recoverJob };
    const first = await renderHook(() => useToolJobLifecycle(deps));
    await first.unmount();
    await renderHook(() => useToolJobLifecycle(deps));
    expect(recoverJob).toHaveBeenCalledTimes(1);
    expect(recoverJob).toHaveBeenCalledWith('newest');
  });

  it('ignores a failing recovery', async () => {
    mockFailInterrupted.mockReturnValue(['newest']);
    const native = createFakePdfNative();
    const recoverJob = jest.fn(() => {
      throw new Error('db');
    });
    const deps = { getDb: () => ({}) as never, native, now: () => 1, startedAt: 5, recoverJob };
    await expect(renderHook(() => useToolJobLifecycle(deps))).resolves.toBeDefined();
    expect(native.cleanupToolLeftovers).toHaveBeenCalledTimes(1);
  });

  it('ignores every error', async () => {
    const native = createFakePdfNative();
    native.cleanupToolLeftovers.mockRejectedValue(new Error('io'));
    mockFailInterrupted.mockImplementation(() => {
      throw new Error('db');
    });
    const deps = {
      getDb: () => ({}) as never,
      native,
      now: () => 1,
      startedAt: 5,
      recoverJob: jest.fn(),
    };
    await expect(renderHook(() => useToolJobLifecycle(deps))).resolves.toBeDefined();
    await Promise.resolve();
    expect(native.cleanupToolLeftovers).toHaveBeenCalledWith(5);
  });

  it('ignores a failing database open', async () => {
    const native = createFakePdfNative();
    const deps = {
      getDb: () => {
        throw new Error('closed');
      },
      native,
      now: () => 1,
      startedAt: 5,
      recoverJob: jest.fn(),
    };
    await expect(renderHook(() => useToolJobLifecycle(deps))).resolves.toBeDefined();
    expect(native.cleanupToolLeftovers).toHaveBeenCalledTimes(1);
  });

  it('recovers once per process, even when mounted again', async () => {
    const native = createFakePdfNative();
    const deps = {
      getDb: () => ({}) as never,
      native,
      now: () => 1,
      startedAt: 5,
      recoverJob: jest.fn(),
    };
    const first = await renderHook(() => useToolJobLifecycle(deps));
    await first.unmount();
    await renderHook(() => useToolJobLifecycle(deps));
    expect(mockFailInterrupted).toHaveBeenCalledTimes(1);
    expect(native.cleanupToolLeftovers).toHaveBeenCalledTimes(1);
  });
});
