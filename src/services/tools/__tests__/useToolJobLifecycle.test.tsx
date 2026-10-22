import { renderHook } from '@testing-library/react-native';

import { createFakePdfNative } from '@/test-utils/fakePdfNative';

import { APP_STARTED_AT, useToolJobLifecycle } from '../useToolJobLifecycle';

const mockFailInterrupted = jest.fn();
jest.mock('@/services/tools/toolJobRepo', () => ({
  failInterruptedJobs: (...args: unknown[]) => mockFailInterrupted(...args),
}));

beforeEach(() => mockFailInterrupted.mockReset());

describe('useToolJobLifecycle', () => {
  it('fails interrupted jobs and cleans leftovers once on mount', async () => {
    const native = createFakePdfNative();
    const db = {} as never;
    const deps = { getDb: () => db, native, now: () => 42, startedAt: APP_STARTED_AT };
    const hook = await renderHook(() => useToolJobLifecycle(deps));
    await hook.rerender({});
    expect(mockFailInterrupted).toHaveBeenCalledTimes(1);
    expect(mockFailInterrupted).toHaveBeenCalledWith(db, 42);
    expect(native.cleanupToolLeftovers).toHaveBeenCalledTimes(1);
    expect(native.cleanupToolLeftovers).toHaveBeenCalledWith(APP_STARTED_AT);
    expect(typeof APP_STARTED_AT).toBe('number');
  });

  it('ignores every error', async () => {
    const native = createFakePdfNative();
    native.cleanupToolLeftovers.mockRejectedValue(new Error('io'));
    mockFailInterrupted.mockImplementation(() => {
      throw new Error('db');
    });
    const deps = { getDb: () => ({}) as never, native, now: () => 1, startedAt: 5 };
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
    };
    await expect(renderHook(() => useToolJobLifecycle(deps))).resolves.toBeDefined();
    expect(native.cleanupToolLeftovers).toHaveBeenCalledTimes(1);
  });
});
