import { act, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import path from 'path';

import * as nativeIntent from '../../../app/+native-intent';
import type { PdfFileInfo } from '@/services/native/pdfNative';
import { allowIncomingUri } from '@/services/intent/incomingLink';
import { pdfNative } from '@/services/native/pdfNative';
import { fakePdf } from '@/test-utils/fakePdf';
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
const URI = 'content://x/1';
const ROWS = [
  makeRow({ name: 'x.pdf', id: 'id-x', uri: 'content://x/1', source: 'intent' }),
  makeRow({ name: 'y.pdf', id: 'id-y', uri: 'content://x/2', source: 'intent' }),
  makeRow({ name: 'a.pdf' }),
];

/**
 * A cold-start system VIEW: on device +native-intent rewrites the raw content:// URI once (and
 * grants the permit). renderRouter would run it again on the rewritten path, so that second
 * pass is made an identity here.
 */
function viewUrl(uri: string): string {
  const href = nativeIntent.redirectSystemPath({ path: uri, initial: true });
  jest.spyOn(nativeIntent, 'redirectSystemPath').mockImplementation(({ path }) => path);
  return href;
}

async function render(initialUrl: string) {
  // RNTL v14: renderRouter's getPathname helper lives on the returned thenable itself.
  const pending = renderRouter(APP_DIR, { initialUrl });
  await pending;
  await act(async () => {});
  return { pathname: () => pending.getPathname() };
}

/** Navigation inside the app, which does not go through +native-intent. */
async function openInApp(href: string) {
  await act(async () => {
    router.push(href as Parameters<typeof router.push>[0]);
  });
  await act(async () => {});
}

/** A PDF arriving while the app runs (warm VIEW or SEND). */
async function incoming(uri: string) {
  allowIncomingUri(uri);
  await act(async () => {
    router.push({ pathname: '/open', params: { uri } });
  });
  await act(async () => {});
}

describe('/open', () => {
  let resolve: jest.SpyInstance;
  let registerIncoming: jest.Mock;

  beforeEach(() => {
    fakePdf.reset();
    useSettings.setState({ onboardingDone: true });
    useStorage.setState({ mode: 'full', roots: [], canRequestFullAccess: true });
    registerIncoming = jest.fn((info: PdfFileInfo) => ROWS.find((r) => r.uri === info.uri) ?? null);
    useFiles.setState({
      files: ROWS,
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
    const r = await render(viewUrl(URI));
    expect(resolve).toHaveBeenCalledWith(URI);
    expect(registerIncoming).toHaveBeenCalledTimes(1);
    expect(r.pathname()).toBe('/reader/id-x');
  });

  it('opens the reader even before onboarding is done', async () => {
    useSettings.setState({ onboardingDone: false });
    const r = await render(viewUrl(URI));
    expect(r.pathname()).toBe('/reader/id-x');
  });

  it('sends an app deep link to /open home without touching the file', async () => {
    const r = await render(`pdftoolkit://open?uri=${encodeURIComponent('file:///sdcard/a.pdf')}`);
    expect(resolve).not.toHaveBeenCalled();
    expect(registerIncoming).not.toHaveBeenCalled();
    expect(r.pathname()).toBe('/home');
  });

  it('ignores /open reached in-app without a permit and goes Home', async () => {
    const r = await render('/files');
    await openInApp(`/open?uri=${encodeURIComponent('file:///sdcard/a.pdf')}`);
    expect(resolve).not.toHaveBeenCalled();
    expect(registerIncoming).not.toHaveBeenCalled();
    expect(r.pathname()).toBe('/home');
  });

  it('shows the unknown error for a repeated uri param', async () => {
    allowIncomingUri('content://x/1');
    await render('/home');
    await openInApp('/open?uri=content%3A%2F%2Fx%2F1&uri=content%3A%2F%2Fx%2F2');
    expect(resolve).not.toHaveBeenCalled();
    expect(screen.getByText("Couldn't open this PDF")).toBeTruthy();
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });

  it('shows the unknown error without a uri', async () => {
    await render('/home');
    await openInApp('/open');
    expect(resolve).not.toHaveBeenCalled();
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });

  it('explains a refused file and goes Home', async () => {
    resolve.mockRejectedValue(nativeError('ERR_PERMISSION_DENIED'));
    const r = await render(viewUrl(URI));
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
    await render(viewUrl(URI));
    expect(screen.getByText('This file no longer exists')).toBeTruthy();
  });
});

describe('PDFs arriving while a reader is open', () => {
  beforeEach(() => {
    fakePdf.reset();
    useSettings.setState({ onboardingDone: true });
    useStorage.setState({ mode: 'full', roots: [], canRequestFullAccess: true });
    useFiles.setState({
      files: ROWS,
      status: 'idle',
      requestThumb: jest.fn(),
      markOpened: jest.fn(),
      registerIncoming: jest.fn(
        (info: PdfFileInfo) => ROWS.find((r) => r.uri === info.uri) ?? null,
      ),
    });
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function homeThenReader() {
    const r = await render('/home');
    await act(async () => {
      router.push({ pathname: '/reader/[id]', params: { id: 'id-a.pdf' } });
    });
    await act(async () => {});
    expect(screen.getAllByTestId('pdf-native')).toHaveLength(1);
    return r;
  }

  it('replaces the open reader; back returns to the screen under it', async () => {
    const r = await homeThenReader();
    await incoming('content://x/2');
    expect(r.pathname()).toBe('/reader/id-y');
    expect(screen.getAllByTestId('pdf-native')).toHaveLength(1);
    expect(fakePdf.lastProps().source.uri).toBe('file:///data/cache/reader/copy.pdf');
    await act(async () => {
      router.back();
    });
    expect(r.pathname()).toBe('/home');
    expect(screen.queryByTestId('pdf-native')).toBeNull();
  });

  it('keeps one reader when the same file is shared twice', async () => {
    const r = await homeThenReader();
    await incoming('content://x/2');
    await incoming('content://x/2');
    expect(r.pathname()).toBe('/reader/id-y');
    expect(screen.getAllByTestId('pdf-native')).toHaveLength(1);
    await act(async () => {
      router.back();
    });
    expect(r.pathname()).toBe('/home');
  });
});
