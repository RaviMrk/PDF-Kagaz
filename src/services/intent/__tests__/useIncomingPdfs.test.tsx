import { act, renderHook } from '@testing-library/react-native';

import type { IncomingPdfEvent } from '@/services/native/pdfNative';

import { router } from 'expo-router';

import { takeIncomingUri } from '../incomingLink';
import { navigateToIncoming, useIncomingPdfs } from '../useIncomingPdfs';

let mockNavKey: string | undefined = 'root';
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useRootNavigationState: () => (mockNavKey === undefined ? undefined : { key: mockNavKey }),
}));

function makeDeps(taken: string | null) {
  let listener: ((e: IncomingPdfEvent) => void) | undefined;
  const remove = jest.fn();
  const native = {
    takeIncomingPdf: jest.fn().mockResolvedValue(taken),
    addIncomingPdfListener: jest.fn((cb: (e: IncomingPdfEvent) => void) => {
      listener = cb;
      return { remove };
    }),
  };
  return { native, navigate: jest.fn(), remove, emit: (e: IncomingPdfEvent) => listener?.(e) };
}

describe('useIncomingPdfs', () => {
  beforeEach(() => {
    mockNavKey = 'root';
  });

  it('opens the PDF the app was launched with', async () => {
    const d = makeDeps('content://x/2');
    await renderHook(() => useIncomingPdfs(d));
    await act(async () => {});
    expect(d.navigate).toHaveBeenCalledWith('content://x/2');
  });

  it('does nothing without a launch PDF', async () => {
    const d = makeDeps(null);
    await renderHook(() => useIncomingPdfs(d));
    await act(async () => {});
    expect(d.native.takeIncomingPdf).toHaveBeenCalledTimes(1);
    expect(d.navigate).not.toHaveBeenCalled();
  });

  it('waits for the navigator before taking the launch PDF', async () => {
    mockNavKey = undefined;
    const d = makeDeps('content://x/2');
    const { rerender } = await renderHook(() => useIncomingPdfs(d));
    await act(async () => {});
    expect(d.native.takeIncomingPdf).not.toHaveBeenCalled();
    mockNavKey = 'root';
    await rerender({});
    await act(async () => {});
    expect(d.navigate).toHaveBeenCalledWith('content://x/2');
  });

  it('opens PDFs shared while running and unsubscribes on unmount', async () => {
    const d = makeDeps(null);
    const { unmount } = await renderHook(() => useIncomingPdfs(d));
    await act(async () => {});
    await act(async () => d.emit({ uri: 'content://x/3' }));
    expect(d.navigate).toHaveBeenCalledWith('content://x/3');
    await unmount();
    expect(d.remove).toHaveBeenCalledTimes(1);
  });
});

describe('navigateToIncoming', () => {
  it('pushes /open with a one-time nonce for the raw uri', () => {
    const raw = 'content://x/4%3A%2F';
    navigateToIncoming(raw);
    const call = (router.push as jest.Mock).mock.calls.at(-1)![0];
    expect(call.pathname).toBe('/open');
    expect(Object.keys(call.params)).toEqual(['t']);
    expect(takeIncomingUri(call.params.t)).toBe(raw);
    expect(takeIncomingUri(call.params.t)).toBeNull();
  });
});
