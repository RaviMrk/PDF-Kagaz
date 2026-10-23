import { createFakePdfNative } from '@/test-utils/fakePdfNative';

import { clearAppCache } from '../clearCache';

function setup(active: unknown = null) {
  const native = createFakePdfNative();
  const resetThumbnails = jest.fn();
  return {
    native,
    resetThumbnails,
    deps: {
      native,
      files: { getState: () => ({ resetThumbnails }) },
      jobs: { getState: () => ({ active }) },
    } as unknown as Parameters<typeof clearAppCache>[0],
  };
}

describe('clearAppCache', () => {
  it('is busy while a tool job runs and does not call native', async () => {
    const { deps, native, resetThumbnails } = setup({ jobId: 'j' });
    await expect(clearAppCache(deps)).resolves.toEqual({ ok: false, reason: 'busy' });
    expect(native.clearCaches).not.toHaveBeenCalled();
    expect(resetThumbnails).not.toHaveBeenCalled();
  });

  it('returns the freed bytes and resets thumbnails once', async () => {
    const { deps, native, resetThumbnails } = setup();
    native.clearCaches.mockResolvedValue(1234);
    await expect(clearAppCache(deps)).resolves.toEqual({ ok: true, bytes: 1234 });
    expect(resetThumbnails).toHaveBeenCalledTimes(1);
  });

  it('fails without touching thumbnails when native rejects', async () => {
    const { deps, native, resetThumbnails } = setup();
    native.clearCaches.mockRejectedValue(new Error('x'));
    await expect(clearAppCache(deps)).resolves.toEqual({ ok: false, reason: 'failed' });
    expect(resetThumbnails).not.toHaveBeenCalled();
  });
});
