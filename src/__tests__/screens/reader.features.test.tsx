import { act, fireEvent } from '@testing-library/react-native';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { renderRouter, screen } from 'expo-router/testing-library';
import path from 'path';
import { AppState, PixelRatio, StyleSheet, type AppStateStatus } from 'react-native';

import { files, type FileRow } from '@/db/schema';
import type { IndexDb } from '@/services/index/fileIndexRepo';
import { pdfNative } from '@/services/native/pdfNative';
import { NIGHT_FILTER, SEPIA_FILTER } from '@/services/reader/readerFilters';
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
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(),
}));

let mockDb: IndexDb;
jest.mock('@/db/client', () => ({
  ...jest.requireActual('@/db/client'),
  getDb: () => mockDb,
}));

const APP_DIR = path.join(__dirname, '../../../app');
const ID = 'id-a.pdf';
const THUMB_WIDTH = Math.min(240, Math.round(64 * PixelRatio.get()));

const OUTLINE = [
  {
    title: 'Chapter 1',
    pageIdx: 0,
    children: [
      { title: 'Section 1.1', pageIdx: 1, children: [] },
      { title: 'Section 1.2', pageIdx: 2, children: [] },
    ],
  },
  { title: 'Chapter 2', pageIdx: 4, children: [] },
  { title: 'Chapter 3', pageIdx: 8, children: [] },
];

const dropMissing = jest.fn();

function makeDb(): IndexDb {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = OFF');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  sqlite.pragma('foreign_keys = ON');
  return db;
}

function useRows(rows: FileRow[]) {
  mockDb = makeDb();
  for (const r of rows) mockDb.insert(files).values(r).run();
  useFiles.setState({
    files: rows,
    status: 'idle',
    requestThumb: jest.fn(),
    setLastPage: jest.fn(),
    dropMissing,
    markOpened: jest.fn(),
    getRow: (id: string) => rows.find((r) => r.id === id) ?? null,
  });
}

async function renderReader() {
  const result = await renderRouter(APP_DIR, { initialUrl: `/reader/${ID}` });
  await act(async () => {});
  return result;
}

async function load(pageCount: number, outline: unknown[] = []) {
  await act(async () => {
    fakePdf.lastProps().onLoadComplete(pageCount, '/p', { width: 1, height: 1 }, outline);
  });
}

async function pageChanged(page: number, pageCount: number) {
  await act(async () => {
    fakePdf.lastProps().onPageChanged(page, pageCount);
  });
}

async function press(
  name: string | RegExp,
  role: 'button' | 'tab' | 'radio' | 'switch' = 'button',
) {
  await fireEvent.press(screen.getByRole(role, { name }));
  await act(async () => {});
}

function viewerFilter() {
  return StyleSheet.flatten(screen.getByTestId('reader-viewer').props.style).filter;
}

describe('Reader screen features', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fakePdf.reset();
    useSettings.setState({
      onboardingDone: true,
      readerTheme: 'normal',
      readerKeepAwake: false,
      readerHorizontal: false,
    });
    useStorage.setState({ mode: 'full', roots: [], canRequestFullAccess: true });
    useRows([makeRow({ name: 'a.pdf', lastPage: 12 })]);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    for (const fn of ['renderReaderThumbnail', 'sharePdf', 'openPdfWith', 'printPdf'] as const) {
      jest.spyOn(pdfNative, fn);
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('thumbnails', () => {
    it('lists page thumbnails from the prepared file and jumps to a page', async () => {
      useRows([makeRow({ name: 'a.pdf', uri: 'content://com.example/doc/7' })]);
      await renderReader();
      await load(10);
      await press('Page thumbnails');
      expect(screen.getByRole('button', { name: 'Page 1' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Page 5' })).toBeTruthy();
      expect(pdfNative.renderReaderThumbnail).toHaveBeenCalledWith(
        'file:///data/cache/reader/copy.pdf',
        1,
        THUMB_WIDTH,
      );
      await press('Page 5');
      expect(fakePdf.setPage).toHaveBeenCalledWith(5);
    });

    it('highlights the current page', async () => {
      useRows([makeRow({ name: 'a.pdf' })]);
      await renderReader();
      await load(10);
      await press('Page thumbnails');
      expect(screen.getByRole('button', { name: 'Page 1' })).toBeSelected();
      expect(screen.getByRole('button', { name: 'Page 2' })).not.toBeSelected();
      await pageChanged(2, 10);
      expect(screen.getByRole('button', { name: 'Page 2' })).toBeSelected();
      expect(screen.getByRole('button', { name: 'Page 1' })).not.toBeSelected();
    });

    it('shows numbered placeholders for an encrypted file with one native call', async () => {
      jest
        .spyOn(pdfNative, 'renderReaderThumbnail')
        .mockRejectedValue(nativeError('ERR_PDF_ENCRYPTED'));
      useRows([makeRow({ name: 'a.pdf' })]);
      await renderReader();
      await load(10);
      await press('Page thumbnails');
      await act(async () => {});
      expect(screen.getByRole('button', { name: 'Page 1' })).toHaveTextContent('1');
      expect(screen.getByRole('button', { name: 'Page 3' })).toHaveTextContent('3');
      expect(pdfNative.renderReaderThumbnail).toHaveBeenCalledTimes(1);
    });
  });

  describe('bookmarks', () => {
    it('bookmarks the current page, lists it, jumps to it and removes it', async () => {
      await renderReader();
      await load(200);
      await pageChanged(57, 200);
      await press('Bookmark this page');
      expect(screen.getByRole('button', { name: 'Remove bookmark' })).toBeTruthy();

      await press('Contents and bookmarks');
      await press('Bookmarks', 'tab');
      await press('Page 57');
      expect(fakePdf.setPage).toHaveBeenCalledWith(57);
      expect(screen.queryByRole('tab', { name: 'Bookmarks' })).toBeNull();

      await press('Contents and bookmarks');
      await press('Bookmarks', 'tab');
      await press('Remove bookmark for page 57');
      expect(screen.getByText('No bookmarks yet. Tap the bookmark icon to add one.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Page 57' })).toBeNull();
    });
  });

  describe('outline', () => {
    it('lists the table of contents and jumps to an entry', async () => {
      await renderReader();
      await load(200, OUTLINE);
      await press('Contents and bookmarks');
      for (const title of ['Chapter 1', 'Section 1.1', 'Section 1.2', 'Chapter 2', 'Chapter 3']) {
        expect(screen.getByRole('button', { name: new RegExp(`^${title}`) })).toBeTruthy();
      }
      await press(/^Chapter 2/);
      expect(fakePdf.setPage).toHaveBeenCalledWith(5);
      expect(screen.queryByRole('tab', { name: 'Contents' })).toBeNull();
    });

    it('explains an empty table of contents', async () => {
      await renderReader();
      await load(200);
      await press('Contents and bookmarks');
      expect(screen.getByText('This PDF has no table of contents')).toBeTruthy();
    });
  });

  describe('appearance', () => {
    it('applies night, sepia and normal page colours without reloading the viewer', async () => {
      await renderReader();
      await load(200);
      const renders = fakePdf.renders;
      expect(viewerFilter()).toBeUndefined();
      await press('More options');
      await press('Night', 'radio');
      expect(useSettings.getState().readerTheme).toBe('night');
      expect(viewerFilter()).toEqual(NIGHT_FILTER);
      await press('Sepia', 'radio');
      expect(useSettings.getState().readerTheme).toBe('sepia');
      expect(viewerFilter()).toEqual(SEPIA_FILTER);
      await press('Normal', 'radio');
      expect(useSettings.getState().readerTheme).toBe('normal');
      expect(viewerFilter()).toBeUndefined();
      expect(fakePdf.renders).toBe(renders);
    });

    it('keeps the screen on while enabled and releases it when off and on unmount', async () => {
      const { unmount } = await renderReader();
      await load(200);
      await press('More options');
      await press('Keep screen on', 'switch');
      expect(useSettings.getState().readerKeepAwake).toBe(true);
      expect(activateKeepAwakeAsync).toHaveBeenCalledWith('reader');
      await press('Keep screen on', 'switch');
      expect(useSettings.getState().readerKeepAwake).toBe(false);
      expect(deactivateKeepAwake).toHaveBeenCalledWith('reader');

      await press('Keep screen on', 'switch');
      (deactivateKeepAwake as jest.Mock).mockClear();
      await act(async () => {
        unmount();
      });
      expect(deactivateKeepAwake).toHaveBeenCalledWith('reader');
    });

    it('releases the screen in the background and keeps it on again when back', async () => {
      const handlers: ((s: AppStateStatus) => void)[] = [];
      jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
        handlers.push(handler as (s: AppStateStatus) => void);
        return { remove: jest.fn() } as never;
      });
      useSettings.setState({ readerKeepAwake: true });
      await renderReader();
      await load(200);
      expect(activateKeepAwakeAsync).toHaveBeenCalledTimes(1);
      await act(async () => handlers.forEach((h) => h('background')));
      expect(deactivateKeepAwake).toHaveBeenCalledWith('reader');
      await act(async () => handlers.forEach((h) => h('active')));
      expect(activateKeepAwakeAsync).toHaveBeenCalledTimes(2);
    });

    it('reloads the viewer sideways at the current page', async () => {
      await renderReader();
      await load(200);
      await pageChanged(57, 200);
      await press('More options');
      await press('Swipe pages sideways', 'switch');
      expect(useSettings.getState().readerHorizontal).toBe(true);
      expect(fakePdf.lastProps().horizontal).toBe(true);
      expect(fakePdf.lastProps().page).toBe(57);
    });
  });

  describe('actions', () => {
    const ROW_URI = 'file:///storage/emulated/0/Download/a.pdf';

    it('shares, opens with and prints the original file', async () => {
      await renderReader();
      await load(200);
      await press('More options');
      await press('Share');
      expect(pdfNative.sharePdf).toHaveBeenCalledWith(ROW_URI, 'Share PDF');
      await press('More options');
      await press('Open with…');
      expect(pdfNative.openPdfWith).toHaveBeenCalledWith(ROW_URI, 'Open with');
      await press('More options');
      await press('Print');
      expect(pdfNative.printPdf).toHaveBeenCalledWith(ROW_URI, 'a');
    });

    it('drops the row when sharing finds the file missing', async () => {
      jest.spyOn(pdfNative, 'sharePdf').mockRejectedValueOnce(nativeError('ERR_FILE_NOT_FOUND'));
      await renderReader();
      await load(200);
      await press('More options');
      await press('Share');
      expect(screen.getByText('This file no longer exists')).toBeTruthy();
      expect(dropMissing).toHaveBeenCalledWith(ID);
    });

    it('keeps the row on a permission error and hides the notice after 4 s', async () => {
      jest
        .spyOn(pdfNative, 'sharePdf')
        .mockRejectedValueOnce(nativeError('ERR_PERMISSION_DENIED', ROW_URI));
      await renderReader();
      await load(200);
      jest.useFakeTimers();
      await press('More options');
      await press('Share');
      const message =
        "PDF Toolkit can't open this file anymore. Open it again from the app you got it from.";
      expect(screen.getByText(message)).toBeTruthy();
      expect(screen.queryByText(/storage|Download/)).toBeNull();
      expect(dropMissing).not.toHaveBeenCalled();
      await act(async () => {
        jest.advanceTimersByTime(4000);
      });
      expect(screen.queryByText(message)).toBeNull();
    });

    it('does not print a document opened with a password', async () => {
      await renderReader();
      await act(async () => {
        fakePdf.lastProps().onError(new Error('Password required or incorrect password.'));
      });
      await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'secret');
      await press('Open');
      await load(3);
      await press('More options');
      await press('Print');
      expect(screen.getByText("Password-protected PDFs can't be printed yet")).toBeTruthy();
      expect(pdfNative.printPdf).not.toHaveBeenCalled();
    });
  });
});
