import { createFakePdfNative } from '@/test-utils/fakePdfNative';

import { createFullAccessProvider } from '../FullAccessProvider';

const permissions = {
  PERMISSIONS: {
    READ_EXTERNAL_STORAGE: 'android.permission.READ_EXTERNAL_STORAGE',
    WRITE_EXTERNAL_STORAGE: 'android.permission.WRITE_EXTERNAL_STORAGE',
  },
  RESULTS: { GRANTED: 'granted', DENIED: 'denied', NEVER_ASK_AGAIN: 'never_ask_again' },
  requestMultiple: jest.fn(),
} as never as Parameters<typeof createFullAccessProvider>[0]['permissions'] & {
  requestMultiple: jest.Mock;
};

function setup(apiLevel: number) {
  const native = createFakePdfNative();
  const waitForForeground = jest.fn().mockResolvedValue(undefined);
  const provider = createFullAccessProvider({ native, apiLevel, permissions, waitForForeground });
  return { native, waitForForeground, provider };
}

describe('FullAccessProvider', () => {
  beforeEach(() => permissions.requestMultiple.mockReset());

  it('API 33: opens settings, waits for foreground, returns the re-check', async () => {
    const { native, waitForForeground, provider } = setup(33);
    const order: string[] = [];
    native.openAllFilesAccessSettings.mockImplementation(async () => {
      order.push('open');
    });
    waitForForeground.mockImplementation(async () => {
      order.push('wait');
    });
    native.hasAllFilesAccess.mockImplementation(async () => {
      order.push('check');
      return true;
    });
    await expect(provider.requestAccess()).resolves.toBe(true);
    expect(order).toEqual(['open', 'wait', 'check']);
  });

  it('API 33: returns false when still denied, and never throws', async () => {
    const { native, provider } = setup(33);
    native.hasAllFilesAccess.mockResolvedValue(false);
    await expect(provider.requestAccess()).resolves.toBe(false);
    native.openAllFilesAccessSettings.mockRejectedValue(new Error('no activity'));
    await expect(provider.requestAccess()).resolves.toBe(false);
  });

  it('API 29: uses requestMultiple and never opens settings', async () => {
    const { native, provider } = setup(29);
    permissions.requestMultiple.mockResolvedValue({
      'android.permission.READ_EXTERNAL_STORAGE': 'denied',
      'android.permission.WRITE_EXTERNAL_STORAGE': 'granted',
    });
    await expect(provider.requestAccess()).resolves.toBe(false);
    permissions.requestMultiple.mockResolvedValue({
      'android.permission.READ_EXTERNAL_STORAGE': 'granted',
      'android.permission.WRITE_EXTERNAL_STORAGE': 'denied',
    });
    await expect(provider.requestAccess()).resolves.toBe(true);
    expect(native.openAllFilesAccessSettings).not.toHaveBeenCalled();
  });

  it('fullScan passes null roots and forwards progress events', async () => {
    const { native, provider } = setup(33);
    const remove = jest.fn();
    let listener: (e: { scannedFolders: number; found: number }) => void = () => {};
    native.addScanProgressListener.mockImplementation((cb) => {
      listener = cb;
      return { remove };
    });
    native.scanPdfs.mockImplementation(async () => {
      listener({ scannedFolders: 2, found: 3 });
      return { files: [], scannedRoots: [], failedRoots: [] };
    });
    const cb = jest.fn();
    await provider.fullScan(cb);
    expect(native.scanPdfs).toHaveBeenCalledWith(null);
    expect(cb).toHaveBeenCalledWith({ scannedFolders: 2, found: 3 });
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('fullScan removes the listener after a rejected scan', async () => {
    const { native, provider } = setup(33);
    const remove = jest.fn();
    native.addScanProgressListener.mockReturnValue({ remove });
    native.scanPdfs.mockRejectedValue(new Error('boom'));
    await expect(provider.fullScan(jest.fn())).rejects.toThrow('boom');
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('quickScan returns folder changes; roots are inert', async () => {
    const { native, provider } = setup(33);
    const changes = [{ uri: 'file:///a', exists: true, modifiedAt: 1, files: [] }];
    native.scanChangedFolders.mockResolvedValue(changes);
    await expect(provider.quickScan([{ uri: 'file:///a', modifiedAt: 0 }])).resolves.toEqual({
      kind: 'folders',
      changes,
    });
    await expect(provider.listRoots()).resolves.toEqual([]);
    await expect(provider.addRoot()).resolves.toBeNull();
    await expect(provider.removeRoot('x')).resolves.toBeUndefined();
  });
});
