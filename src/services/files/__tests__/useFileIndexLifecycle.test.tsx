import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { useFileIndexLifecycle } from '../useFileIndexLifecycle';

type Mode = 'full' | 'saf' | 'none';

const mockStorage: {
  mode: Mode | 'unknown';
  next: Mode;
  refreshMode: jest.Mock<Promise<Mode>, []>;
} = {
  mode: 'none',
  next: 'full',
  refreshMode: jest.fn(async (): Promise<Mode> => {
    mockStorage.mode = mockStorage.next;
    return mockStorage.next;
  }),
};
const calls: string[] = [];
const mockFiles = {
  lastScanAt: null as number | null,
  loadFromCache: jest.fn(() => {
    calls.push('loadFromCache');
  }),
  refresh: jest.fn(async (kind: 'full' | 'quick') => {
    calls.push(`refresh:${kind}`);
  }),
};

jest.mock('@/stores/storageStore', () => ({
  useStorage: { getState: () => mockStorage },
}));
jest.mock('@/stores/filesStore', () => ({
  useFiles: { getState: () => mockFiles },
}));

let appStateHandler: ((s: AppStateStatus) => void) | null = null;
const removeListener = jest.fn();
let now = 100_000;
let spies: jest.SpyInstance[] = [];

beforeEach(() => {
  calls.length = 0;
  mockStorage.mode = 'unknown';
  mockStorage.refreshMode.mockClear();
  mockFiles.loadFromCache.mockClear();
  mockFiles.refresh.mockClear();
  mockFiles.lastScanAt = null;
  removeListener.mockClear();
  appStateHandler = null;
  now = 100_000;
  spies = [
    jest.spyOn(Date, 'now').mockImplementation(() => now),
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      appStateHandler = handler as (s: AppStateStatus) => void;
      return { remove: removeListener } as never;
    }),
  ];
});
afterEach(() => {
  // Not restoreAllMocks: that would also strip the module mocks' implementations.
  for (const spy of spies) spy.mockRestore();
});

async function mount(mode: Mode) {
  mockStorage.next = mode;
  const hook = await renderHook(() => useFileIndexLifecycle());
  await act(async () => {});
  return hook;
}

async function foreground() {
  await act(async () => {
    appStateHandler?.('active');
  });
}

describe('useFileIndexLifecycle', () => {
  it('on mount with full access loads the cache, then runs a full refresh', async () => {
    await mount('full');
    expect(mockStorage.refreshMode).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['loadFromCache', 'refresh:full']);
  });

  it('on mount without access loads the cache but does not scan', async () => {
    await mount('none');
    expect(calls).toEqual(['loadFromCache']);
  });

  it('foreground 11 s after the last scan runs a quick refresh', async () => {
    await mount('full');
    mockFiles.lastScanAt = now;
    now += 11_000;
    calls.length = 0;
    await foreground();
    expect(mockStorage.refreshMode).toHaveBeenCalledTimes(2);
    expect(calls).toEqual(['refresh:quick']);
  });

  it('foreground 3 s after the last scan does nothing', async () => {
    await mount('full');
    mockFiles.lastScanAt = now;
    now += 3_000;
    calls.length = 0;
    await foreground();
    expect(calls).toEqual([]);
  });

  it('ignores background/inactive transitions', async () => {
    await mount('full');
    calls.length = 0;
    await act(async () => {
      appStateHandler?.('background');
    });
    expect(mockStorage.refreshMode).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });

  it('a mode change none -> saf on foreground runs a full refresh', async () => {
    await mount('none');
    mockStorage.next = 'saf';
    calls.length = 0;
    await foreground();
    expect(calls).toEqual(['refresh:full']);
  });

  it('losing access on foreground does not scan', async () => {
    await mount('full');
    mockFiles.lastScanAt = now;
    now += 60_000;
    mockStorage.next = 'none';
    calls.length = 0;
    await foreground();
    expect(calls).toEqual([]);
  });

  it('removes the AppState listener on unmount', async () => {
    const hook = await mount('full');
    await hook.unmount();
    expect(removeListener).toHaveBeenCalledTimes(1);
  });
});
