import { act, fireEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import path from 'path';

import { pdfNative } from '@/services/native/pdfNative';
import { nativeError } from '@/test-utils/fakePdfNative';
import { makeRow } from '@/test-utils/fileRows';
import { useFiles } from '@/stores/filesStore';
import { useSettings } from '@/stores/settingsStore';
import { useStorage } from '@/stores/storageStore';

// Router-rendering suites can exceed jest's 5 s default under load.
jest.setTimeout(20000);

jest.mock('@/db/useDatabaseReady', () => ({
  useDatabaseReady: () => ({ success: true, error: undefined }),
}));
jest.mock('@/services/files/useFileIndexLifecycle', () => ({ useFileIndexLifecycle: jest.fn() }));

const APP_DIR = path.join(__dirname, '../../../app');
const URL = '/open?uri=content%3A%2F%2Fx%2F1';
const ROW = makeRow({ name: 'x.pdf', id: 'id-x', uri: 'content://x/1', source: 'intent' });

async function renderOpen() {
  // RNTL v14: renderRouter's getPathname helper lives on the returned thenable itself.
  const pending = renderRouter(APP_DIR, { initialUrl: URL });
  await pending;
  await act(async () => {});
  return { pathname: () => pending.getPathname() };
}

describe('/open', () => {
  let resolve: jest.SpyInstance;
  let registerIncoming: jest.Mock;

  beforeEach(() => {
    useSettings.setState({ onboardingDone: true });
    useStorage.setState({ mode: 'full', roots: [], canRequestFullAccess: true });
    registerIncoming = jest.fn(() => ROW);
    useFiles.setState({
      files: [ROW],
      status: 'idle',
      requestThumb: jest.fn(),
      markOpened: jest.fn(),
      registerIncoming,
    });
    resolve = jest.spyOn(pdfNative, 'resolveIncomingPdf');
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('registers the shared PDF and opens it in the reader', async () => {
    const r = await renderOpen();
    expect(resolve).toHaveBeenCalledWith('content://x/1');
    expect(registerIncoming).toHaveBeenCalledTimes(1);
    expect(r.pathname()).toBe('/reader/id-x');
  });

  it('opens the reader even before onboarding is done', async () => {
    useSettings.setState({ onboardingDone: false });
    const r = await renderOpen();
    expect(r.pathname()).toBe('/reader/id-x');
  });

  it('explains a refused file and goes Home', async () => {
    resolve.mockRejectedValue(nativeError('ERR_PERMISSION_DENIED'));
    const r = await renderOpen();
    expect(r.pathname()).toBe('/open');
    expect(screen.getByText("Couldn't open this PDF")).toBeTruthy();
    expect(
      screen.getByText("PDF Toolkit wasn't given access to this file. Try sharing it again."),
    ).toBeTruthy();
    expect(screen.queryByText(/content:/)).toBeNull();
    expect(registerIncoming).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Go to Home' }));
    expect(r.pathname()).toBe('/home');
  });

  it('explains a missing file', async () => {
    resolve.mockRejectedValue(nativeError('ERR_FILE_NOT_FOUND'));
    await renderOpen();
    expect(screen.getByText('This file no longer exists')).toBeTruthy();
  });
});
