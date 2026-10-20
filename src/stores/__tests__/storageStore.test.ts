import { createFakePdfNative } from '@/test-utils/fakePdfNative';
import { createFullAccessProvider } from '@/services/storage/FullAccessProvider';
import type { ScanRootView, StorageProvider } from '@/services/storage/StorageProvider';

import { createStorageStore } from '../storageStore';

function fakeProvider(mode: 'full' | 'saf', over: Partial<StorageProvider> = {}): StorageProvider {
  return {
    ...createFullAccessProvider({
      native: createFakePdfNative(),
      apiLevel: 33,
      permissions: {} as never,
      waitForForeground: async () => {},
    }),
    mode,
    source: mode === 'full' ? 'scan' : 'saf',
    ...over,
  };
}

const root: ScanRootView = { uri: 'content://t/tree/a', label: 'A', granted: true };

describe('storageStore', () => {
  it('canRequestFullAccess depends on api level and variant', () => {
    const base = { full: fakeProvider('full'), saf: fakeProvider('saf') };
    expect(
      createStorageStore({ ...base, apiLevel: 33, allFilesAccessEnabled: false }).getState()
        .canRequestFullAccess,
    ).toBe(false);
    expect(
      createStorageStore({ ...base, apiLevel: 29, allFilesAccessEnabled: false }).getState()
        .canRequestFullAccess,
    ).toBe(true);
    expect(
      createStorageStore({ ...base, apiLevel: 33, allFilesAccessEnabled: true }).getState()
        .canRequestFullAccess,
    ).toBe(true);
  });

  it('refreshMode sets mode and roots; provider() follows the mode', async () => {
    const full = fakeProvider('full', { hasAccess: async () => false });
    const saf = fakeProvider('saf', { listRoots: async () => [root] });
    const store = createStorageStore({ full, saf, apiLevel: 33, allFilesAccessEnabled: true });
    expect(store.getState().mode).toBe('unknown');
    await expect(store.getState().refreshMode()).resolves.toBe('saf');
    expect(store.getState().roots).toEqual([root]);
    expect(store.getState().provider()).toBe(saf);
  });

  it('provider() is null for none and full wins when granted', async () => {
    const full = fakeProvider('full', { hasAccess: async () => false });
    const saf = fakeProvider('saf', { listRoots: async () => [{ ...root, granted: false }] });
    const store = createStorageStore({ full, saf, apiLevel: 33, allFilesAccessEnabled: true });
    await store.getState().refreshMode();
    expect(store.getState().mode).toBe('none');
    expect(store.getState().provider()).toBeNull();

    const full2 = fakeProvider('full', { hasAccess: async () => true });
    const store2 = createStorageStore({
      full: full2,
      saf,
      apiLevel: 33,
      allFilesAccessEnabled: true,
    });
    await store2.getState().refreshMode();
    expect(store2.getState().provider()).toBe(full2);
  });

  it('actions end with a refresh', async () => {
    let granted = false;
    const full = fakeProvider('full', {
      hasAccess: async () => granted,
      requestAccess: async () => {
        granted = true;
        return true;
      },
    });
    const removeRoot = jest.fn().mockResolvedValue(undefined);
    const saf = fakeProvider('saf', {
      requestAccess: async () => true,
      removeRoot,
      listRoots: async () => [],
    });
    const store = createStorageStore({ full, saf, apiLevel: 33, allFilesAccessEnabled: true });
    await expect(store.getState().requestFullAccess()).resolves.toBe(true);
    expect(store.getState().mode).toBe('full');
    await expect(store.getState().addFolder()).resolves.toBe(true);
    await store.getState().removeFolder('u');
    expect(removeRoot).toHaveBeenCalledWith('u');
  });
});
