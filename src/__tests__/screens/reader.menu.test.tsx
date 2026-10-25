import { act, fireEvent } from '@testing-library/react-native';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { router } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import path from 'path';
import { Alert, StyleSheet, type AlertButton } from 'react-native';

import { files, type FileRow } from '@/db/schema';
import type { IndexDb } from '@/services/index/fileIndexRepo';
import { pdfNative } from '@/services/native/pdfNative';
import { fakePdf } from '@/test-utils/fakePdf';
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

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
let mockInsets = NO_INSETS;
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => mockInsets,
}));

let mockDb: IndexDb;
jest.mock('@/db/client', () => ({
  ...jest.requireActual('@/db/client'),
  getDb: () => mockDb,
}));

const APP_DIR = path.join(__dirname, '../../../app');
const ID = 'id-a.pdf';

const setLastPage = jest.fn();

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
    setLastPage,
    dropMissing: jest.fn(),
    markOpened: jest.fn(),
    getRow: (id: string) => rows.find((r) => r.id === id) ?? null,
    renames: {},
  });
}

let rendered: ReturnType<typeof renderRouter>;

/** Opens the reader on top of the Files tab, so Back has somewhere to go. */
async function renderReader() {
  rendered = renderRouter(APP_DIR, { initialUrl: '/files' });
  await rendered;
  await act(async () => router.push(`/reader/${ID}`));
  await act(async () => {});
}

async function load(pageCount: number) {
  await act(async () => {
    fakePdf.lastProps().onLoadComplete(pageCount, '/p', { width: 1, height: 1 }, []);
  });
}

async function press(name: string | RegExp) {
  await fireEvent.press(screen.getByRole('button', { name }));
  await act(async () => {});
}

const openMenu = () => press('More options');

describe('Reader menu file actions and tool shortcuts (U3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fakePdf.reset();
    mockInsets = NO_INSETS;
    useSettings.setState({
      onboardingDone: true,
      readerTheme: 'normal',
      readerKeepAwake: false,
      readerHorizontal: false,
    });
    useStorage.setState({ mode: 'full', roots: [], canRequestFullAccess: true });
    useRows([makeRow({ name: 'a.pdf' })]);
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('is a bottom sheet with File and Tools sections that clears the navigation bar', async () => {
    mockInsets = { ...NO_INSETS, bottom: 24 };
    await renderReader();
    await load(10);
    await openMenu();
    const panel = StyleSheet.flatten(screen.getByTestId('bottom-sheet-panel').props.style);
    expect(panel.paddingBottom).toBe(16 + 24);
    expect(screen.getByTestId('reader-menu-scroll')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'File' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Tools' })).toBeTruthy();
    for (const name of [
      'Add to favourites',
      'Rename',
      'Duplicate',
      'Move to PDFToolkit folder',
      'File info',
      'Delete',
      'Share',
      'Print',
      'Open with…',
      'Compress',
      'Merge with…',
    ]) {
      const row = screen.getByRole('button', { name });
      expect(StyleSheet.flatten(row.props.style).minHeight).toBeGreaterThanOrEqual(48);
    }
  });

  it('favourites the file in place and flips the label', async () => {
    await renderReader();
    await load(10);
    await openMenu();
    await press('Add to favourites');
    expect(useFiles.getState().files[0]!.isFavorite).toBe(true);
    expect(screen.getByRole('button', { name: 'Remove from favourites' })).toBeTruthy();
    await press('Remove from favourites');
    expect(useFiles.getState().files[0]!.isFavorite).toBe(false);
    expect(screen.getByRole('button', { name: 'Add to favourites' })).toBeTruthy();
  });

  it('renames the file and follows it to its new id: title, favourite and tools', async () => {
    // Like the store: a rename changes the uri, so the row gets a new id.
    const rename = jest.fn(async (id: string, name: string) => {
      const next = `id-${name}`;
      useFiles.setState((s) => ({
        files: s.files.map((f) => (f.id === id ? { ...f, id: next, name } : f)),
        renames: { ...s.renames, [id]: next },
      }));
      mockDb.update(files).set({ id: next, name }).run();
      return null;
    });
    useFiles.setState({ rename });
    await renderReader();
    await load(10);
    expect(screen.getByText('a.pdf')).toBeTruthy();
    await openMenu();
    await press('Rename');
    await fireEvent.changeText(screen.getByLabelText('Rename PDF'), 'b.pdf');
    await press('Save');
    expect(rename).toHaveBeenCalledWith(ID, 'b.pdf');
    expect(screen.getByText('b.pdf')).toBeTruthy();
    expect(screen.queryByText('a.pdf')).toBeNull();
    // The viewer kept its document: no reload.
    expect(screen.getByTestId('reader-viewer')).toBeTruthy();

    await openMenu();
    await press('Add to favourites');
    expect(useFiles.getState().files[0]).toMatchObject({ id: 'id-b.pdf', isFavorite: true });
    expect(screen.getByRole('button', { name: 'Remove from favourites' })).toBeTruthy();

    const push = jest.spyOn(router, 'push').mockImplementation(() => {});
    await press('Compress');
    expect(push).toHaveBeenCalledWith({
      pathname: '/tool/[toolId]',
      params: { toolId: 'compress', inputs: 'id-b.pdf' },
    });
  });

  it('duplicates through the same store action as the Files tab', async () => {
    const duplicate = jest.fn(() => Promise.resolve(null));
    useFiles.setState({ duplicate });
    await renderReader();
    await load(10);
    await openMenu();
    await press('Duplicate');
    expect(duplicate).toHaveBeenCalledWith(ID);
  });

  it('deletes after confirming, releases the document and goes back', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const remove = jest.fn(async (id: string) => {
      useFiles.setState((s) => ({ files: s.files.filter((f) => f.id !== id) }));
      return null;
    });
    useFiles.setState({ remove });
    let pathAtRelease: string | null = null;
    const release = jest.spyOn(pdfNative, 'releaseReaderDocument').mockImplementation(() => {
      pathAtRelease ??= rendered.getPathname();
      return Promise.resolve();
    });
    await renderReader();
    await load(10);
    expect(rendered.getPathname()).toBe(`/reader/${ID}`);
    await openMenu();
    await press('Delete');
    const [title, , buttons] = alert.mock.calls.at(-1) as [string, string, AlertButton[]];
    expect(title).toBe('Delete this PDF?');
    expect(remove).not.toHaveBeenCalled();
    await act(async () => buttons.find((b) => b.style === 'destructive')!.onPress!());
    expect(remove).toHaveBeenCalledWith(ID);
    // Released while the reader is still the screen, before going back.
    expect(release).toHaveBeenCalled();
    expect(pathAtRelease).toBe(`/reader/${ID}`);
    expect(rendered.getPathname()).toBe('/files');
    expect(screen.queryByTestId('pdf-native')).toBeNull();
  });

  it('stays open and shows why when the delete fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    useFiles.setState({ remove: jest.fn(() => Promise.resolve('permission' as const)) });
    await renderReader();
    await load(10);
    await openMenu();
    await press('Delete');
    const [, , buttons] = alert.mock.calls.at(-1) as [string, string, AlertButton[]];
    await act(async () => buttons.find((b) => b.style === 'destructive')!.onPress!());
    expect(rendered.getPathname()).toBe(`/reader/${ID}`);
    expect(screen.getByText("PDF Toolkit can't change this file")).toBeTruthy();
  });

  it.each([
    ['Compress', 'compress'],
    ['Split', 'split'],
    ['Organise pages', 'organize'],
    ['Add page numbers', 'page-numbers'],
    ['Add watermark', 'watermark'],
    ['Sign PDF', 'sign'],
    ['Protect with password', 'protect'],
    ['PDF to images', 'pdf-to-images'],
    ['Merge with…', 'merge'],
  ])('%s opens the %s tool with this file chosen', async (label, toolId) => {
    await renderReader();
    await load(10);
    const push = jest.spyOn(router, 'push').mockImplementation(() => {});
    await openMenu();
    await press(label);
    expect(push).toHaveBeenCalledWith({
      pathname: '/tool/[toolId]',
      params: { toolId, inputs: ID },
    });
  });

  it('saves the current page before leaving for a tool', async () => {
    await renderReader();
    await load(10);
    await act(async () => fakePdf.lastProps().onPageChanged(6, 10));
    jest.spyOn(router, 'push').mockImplementation(() => {});
    await openMenu();
    await press('Compress');
    expect(setLastPage).toHaveBeenCalledWith(ID, 6);
  });

  it('offers Remove password only for a locked file', async () => {
    await renderReader();
    await load(10);
    await openMenu();
    expect(screen.queryByRole('button', { name: 'Remove password' })).toBeNull();
  });

  it('opens Remove password for a file opened with its password', async () => {
    await renderReader();
    await act(async () => {
      fakePdf.lastProps().onError(new Error('Password required or incorrect password.'));
    });
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'secret');
    await press('Open');
    await load(3);
    const push = jest.spyOn(router, 'push').mockImplementation(() => {});
    await openMenu();
    await press('Remove password');
    expect(push).toHaveBeenCalledWith({
      pathname: '/tool/[toolId]',
      params: { toolId: 'unlock', inputs: ID },
    });
  });

  it('offers Remove password for a file indexed as encrypted', async () => {
    useRows([makeRow({ name: 'a.pdf', isEncrypted: true })]);
    await renderReader();
    await load(3);
    await openMenu();
    expect(screen.getByRole('button', { name: 'Remove password' })).toBeTruthy();
  });
});
