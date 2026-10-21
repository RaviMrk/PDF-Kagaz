import { act, fireEvent } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import path from 'path';

import type { FileRow } from '@/db/schema';
import { pdfNative, type PdfNativeErrorCode } from '@/services/native/pdfNative';
import { fakePdf } from '@/test-utils/fakePdf';
import { nativeError } from '@/test-utils/fakePdfNative';
import { makeRow } from '@/test-utils/fileRows';
import { useFiles } from '@/stores/filesStore';
import { useSettings } from '@/stores/settingsStore';
import { useStorage } from '@/stores/storageStore';

jest.mock('@/db/useDatabaseReady', () => ({
  useDatabaseReady: () => ({ success: true, error: undefined }),
}));
jest.mock('@/services/files/useFileIndexLifecycle', () => ({ useFileIndexLifecycle: jest.fn() }));

const APP_DIR = path.join(__dirname, '../../../app');
const ID = 'id-a.pdf';

const setLastPage = jest.fn();
const dropMissing = jest.fn();

function useRows(rows: FileRow[]) {
  useFiles.setState({
    files: rows,
    status: 'idle',
    requestThumb: jest.fn(),
    setLastPage,
    dropMissing,
    getRow: (id: string) => rows.find((r) => r.id === id) ?? null,
  });
}

async function renderReader(id = ID) {
  // RNTL v14 renders asynchronously: the router helpers live on the returned thenable itself.
  const pending = renderRouter(APP_DIR, { initialUrl: `/reader/${id}` });
  const { unmount } = await pending;
  // Let the prepareReaderFile promise settle.
  await act(async () => {});
  return { unmount, getPathname: () => pending.getPathname() };
}

async function load(pageCount: number) {
  await act(async () => {
    fakePdf.lastProps().onLoadComplete(pageCount, '/p', { width: 1, height: 1 }, []);
  });
}

async function pageChanged(page: number, pageCount: number) {
  await act(async () => {
    fakePdf.lastProps().onPageChanged(page, pageCount);
  });
}

async function pdfError(message: string) {
  await act(async () => {
    fakePdf.lastProps().onError(new Error(message));
  });
}

let prepare: jest.SpyInstance;
let release: jest.SpyInstance;
let log: jest.SpyInstance;

describe('Reader screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fakePdf.reset();
    useSettings.setState({ onboardingDone: true });
    useStorage.setState({ mode: 'full', roots: [], canRequestFullAccess: true });
    useRows([makeRow({ name: 'a.pdf', lastPage: 12 })]);
    prepare = jest.spyOn(pdfNative, 'prepareReaderFile');
    release = jest.spyOn(pdfNative, 'releaseReaderDocument');
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('opens the file at its last page and shows the page indicator', async () => {
    await renderReader();
    expect(fakePdf.lastProps().source.uri).toBe('file:///storage/emulated/0/Download/a.pdf');
    expect(fakePdf.lastProps().page).toBe(12);
    await load(200);
    const indicator = screen.getByRole('button', { name: 'Page 12 of 200. Jump to page' });
    expect(indicator).toHaveTextContent('12 / 200');
    const lines = log.mock.calls.map((c) => String(c[0]));
    const first = lines.filter((l) => /^\[reader\] first page \d+ms 200 pages$/.test(l));
    expect(first).toHaveLength(1);
    expect(lines.some((l) => l.includes('a.pdf'))).toBe(false);
  });

  it('views the prepared copy of a content:// file', async () => {
    useRows([makeRow({ name: 'a.pdf', uri: 'content://com.example/doc/7' })]);
    await renderReader();
    expect(prepare).toHaveBeenCalledWith('content://com.example/doc/7');
    expect(fakePdf.lastProps().source.uri).toBe('file:///data/cache/reader/copy.pdf');
    expect(fakePdf.lastProps().page).toBe(1);
  });

  it('tracks the page and saves it debounced, on background and on unmount', async () => {
    jest.useFakeTimers();
    let onChange: ((s: AppStateStatus) => void) | null = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      onChange = handler as (s: AppStateStatus) => void;
      return { remove: jest.fn() } as never;
    });
    const { unmount } = await renderReader();
    await load(200);
    await pageChanged(57, 200);
    expect(screen.getByRole('button', { name: 'Page 57 of 200. Jump to page' })).toHaveTextContent(
      '57 / 200',
    );
    expect(setLastPage).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(setLastPage).toHaveBeenCalledTimes(1);
    expect(setLastPage).toHaveBeenLastCalledWith(ID, 57);

    await pageChanged(60, 200);
    await act(async () => {
      onChange?.('background');
    });
    expect(setLastPage).toHaveBeenCalledTimes(2);
    expect(setLastPage).toHaveBeenLastCalledWith(ID, 60);

    await pageChanged(61, 200);
    await act(async () => {
      unmount();
    });
    expect(setLastPage).toHaveBeenCalledTimes(3);
    expect(setLastPage).toHaveBeenLastCalledWith(ID, 61);
    expect(release).toHaveBeenCalled();
  });

  it('ignores invalid page numbers from the viewer', async () => {
    jest.useFakeTimers();
    await renderReader();
    await load(200);
    await pageChanged(0, 200);
    await pageChanged(201, 200);
    await pageChanged(2.5, 200);
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('button', { name: 'Page 12 of 200. Jump to page' })).toBeTruthy();
    expect(setLastPage).not.toHaveBeenCalled();
  });

  it('clamps a stored last page beyond the end to the last page', async () => {
    useRows([makeRow({ name: 'a.pdf', lastPage: 250 })]);
    await renderReader();
    await load(200);
    expect(fakePdf.setPage).toHaveBeenCalledWith(200);
    expect(screen.getByRole('button', { name: 'Page 200 of 200. Jump to page' })).toBeTruthy();
  });

  it('jumps to a page and validates the input', async () => {
    await renderReader();
    await load(200);
    await fireEvent.press(screen.getByRole('button', { name: 'Page 12 of 200. Jump to page' }));
    expect(screen.getByText('Go to page')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('Page number'), '201');
    await fireEvent.press(screen.getByRole('button', { name: 'Go' }));
    expect(screen.getByText('Enter a page from 1 to 200')).toBeTruthy();
    expect(fakePdf.setPage).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByPlaceholderText('Page number'), '57');
    await fireEvent.press(screen.getByRole('button', { name: 'Go' }));
    expect(fakePdf.setPage).toHaveBeenCalledWith(57);
    expect(screen.queryByText('Go to page')).toBeNull();
  });

  it('asks for the password, reports a wrong one and opens with the right one', async () => {
    await renderReader();
    await pdfError('Password required or incorrect password.');
    expect(screen.getByText('Password required')).toBeTruthy();
    expect(screen.getByText('"a.pdf" is protected. Enter its password to open it.')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'wrong');
    await fireEvent.press(screen.getByRole('button', { name: 'Open' }));
    expect(fakePdf.lastProps().password).toBe('wrong');
    await pdfError('Password required or incorrect password.');
    expect(screen.getByText('Wrong password. Try again.')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'secret');
    await fireEvent.press(screen.getByRole('button', { name: 'Open' }));
    expect(fakePdf.lastProps().password).toBe('secret');
    await load(1);
    expect(screen.queryByText('Password required')).toBeNull();
    expect(screen.getByRole('button', { name: 'Page 1 of 1. Jump to page' })).toHaveTextContent(
      '1 / 1',
    );
  });

  it('leaves the reader when the password dialog is cancelled', async () => {
    const result = await renderReader();
    await pdfError('Password required or incorrect password.');
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(result.getPathname()).not.toBe(`/reader/${ID}`);
    expect(screen.queryByTestId('pdf-native')).toBeNull();
  });

  it('drops the row only when the file is confirmed missing', async () => {
    prepare.mockRejectedValueOnce(nativeError('ERR_FILE_NOT_FOUND'));
    await renderReader();
    expect(screen.getByText('This file no longer exists')).toBeTruthy();
    expect(dropMissing).toHaveBeenCalledWith(ID);
    expect(screen.queryByTestId('pdf-native')).toBeNull();
  });

  it.each<[PdfNativeErrorCode, string]>([
    ['ERR_VOLUME_UNAVAILABLE', "This file is on storage that isn't available right now"],
    [
      'ERR_PERMISSION_DENIED',
      "PDF Toolkit can't open this file anymore. Open it again from the app you got it from.",
    ],
    ['ERR_IO', "Couldn't open this file. Check free space and try again."],
  ])('keeps the row on %s', async (code, message) => {
    prepare.mockRejectedValueOnce(nativeError(code, '/storage/emulated/0/Download/a.pdf'));
    await renderReader();
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.queryByText(/a\.pdf/)).toBeNull();
    expect(dropMissing).not.toHaveBeenCalled();
  });

  it('retries opening after an I/O error', async () => {
    prepare.mockRejectedValueOnce(nativeError('ERR_IO'));
    await renderReader();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await act(async () => {});
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('pdf-native')).toBeTruthy();
  });

  it('offers no retry for a missing file', async () => {
    prepare.mockRejectedValueOnce(nativeError('ERR_FILE_NOT_FOUND'));
    await renderReader();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('shows a damaged-file message when the viewer cannot open the document', async () => {
    await renderReader();
    await pdfError('cannot create document');
    expect(screen.getByText("This PDF is damaged or isn't a PDF")).toBeTruthy();
    expect(screen.queryByTestId('pdf-native')).toBeNull();
  });

  it('explains an unknown id and closes', async () => {
    const result = await renderReader('id-missing.pdf');
    expect(screen.getByText("This file isn't in your library")).toBeTruthy();
    expect(prepare).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(result.getPathname()).not.toBe('/reader/id-missing.pdf');
  });

  it('toggles the bars on tap without re-rendering the viewer', async () => {
    await renderReader();
    await load(200);
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    await pageChanged(13, 200);
    await act(async () => {
      fakePdf.lastProps().onPageSingleTap(1, 0, 0);
    });
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    await act(async () => {
      fakePdf.lastProps().onPageSingleTap(1, 0, 0);
    });
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    await pageChanged(14, 200);
    expect(fakePdf.renders).toBe(1);
  });
});
