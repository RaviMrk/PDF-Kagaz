import { act, fireEvent } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import path from 'path';

import { queryFiles } from '@/services/files/fileQuery';
import { makeRow } from '@/test-utils/fileRows';
import { fakePdf } from '@/test-utils/fakePdf';
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

const rows = [
  makeRow({ name: 'Zebra.pdf', modifiedAt: Date.UTC(2026, 0, 10), sizeBytes: 3000 }),
  makeRow({ name: 'Apple.pdf', modifiedAt: Date.UTC(2026, 0, 12), sizeBytes: 1000 }),
  makeRow({ name: 'अहवाल.pdf', modifiedAt: Date.UTC(2026, 0, 11), sizeBytes: 2000 }),
  makeRow({
    name: 'Fav.pdf',
    isFavorite: true,
    folder: 'Documents',
    parentUri: 'file:///storage/emulated/0/Documents',
    modifiedAt: Date.UTC(2026, 0, 9),
  }),
];

const refresh = jest.fn(() => Promise.resolve());
const markOpened = jest.fn();

async function renderFiles() {
  await renderRouter(APP_DIR, { initialUrl: '/files' });
}

describe('Files tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSettings.setState({
      onboardingDone: true,
      filesSortKey: 'date',
      filesSortDir: 'desc',
    });
    useStorage.setState({ mode: 'full', roots: [], canRequestFullAccess: true });
    useFiles.setState({
      files: rows,
      status: 'idle',
      progress: null,
      notice: null,
      error: null,
      refresh,
      markOpened,
      requestThumb: jest.fn(),
    });
  });

  it('lists all files and filters as you type', async () => {
    await renderFiles();
    for (const n of ['Zebra.pdf', 'Apple.pdf', 'अहवाल.pdf', 'Fav.pdf']) {
      expect(screen.getByText(n)).toBeTruthy();
    }
    await fireEvent.changeText(screen.getByPlaceholderText('Search PDFs'), 'अहवाल');
    expect(screen.getByText('अहवाल.pdf')).toBeTruthy();
    expect(screen.queryByText('Zebra.pdf')).toBeNull();
    await fireEvent.changeText(screen.getByPlaceholderText('Search PDFs'), 'zzz');
    expect(screen.getByText('No PDFs match "zzz"')).toBeTruthy();
  });

  it('shows only favourites in the Favourites segment', async () => {
    await renderFiles();
    await fireEvent.press(screen.getByRole('tab', { name: 'Favourites' }));
    expect(screen.getByText('Fav.pdf')).toBeTruthy();
    expect(screen.queryByText('Zebra.pdf')).toBeNull();
  });

  it('shows folders with counts and drills into one with a back chip', async () => {
    await renderFiles();
    await fireEvent.press(screen.getByRole('tab', { name: 'Folders' }));
    expect(screen.getByText('Download')).toBeTruthy();
    expect(screen.getByText('3 PDFs')).toBeTruthy();
    expect(screen.getByText('1 PDF')).toBeTruthy();
    await fireEvent.press(screen.getByText('Download'));
    expect(screen.getByText('Zebra.pdf')).toBeTruthy();
    expect(screen.queryByText('Fav.pdf')).toBeNull();
    await fireEvent.press(screen.getByText('Back to folders'));
    expect(screen.getByText('Documents')).toBeTruthy();
  });

  it('hardware back leaves a folder for the folder list (F8)', async () => {
    type BackListener = Parameters<typeof BackHandler.addEventListener>[1];
    const handlers = new Set<BackListener>();
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.add(handler);
      return { remove: () => handlers.delete(handler) };
    });
    // Like Android: the newest handler runs first; true stops the event.
    const pressBack = () =>
      [...handlers].reverse().some((h) => h({} as Parameters<BackListener>[0]) === true);
    await renderFiles();
    await fireEvent.press(screen.getByRole('tab', { name: 'Folders' }));
    await fireEvent.press(screen.getByText('Download'));
    expect(screen.getByText('Zebra.pdf')).toBeTruthy();
    let handled = false;
    await act(async () => {
      handled = pressBack();
    });
    expect(handled).toBe(true);
    expect(screen.getByText('Documents')).toBeTruthy();
    expect(screen.queryByText('Zebra.pdf')).toBeNull();
    jest.restoreAllMocks();
  });

  it('hardware back closes the reader, not the folder drill-in, while the reader is on top (R1)', async () => {
    type BackListener = Parameters<typeof BackHandler.addEventListener>[1];
    const handlers = new Set<BackListener>();
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.add(handler);
      return { remove: () => handlers.delete(handler) };
    });
    const pressBack = () =>
      [...handlers].reverse().some((h) => h({} as Parameters<BackListener>[0]) === true);
    await renderFiles();
    await fireEvent.press(screen.getByRole('tab', { name: 'Folders' }));
    await fireEvent.press(screen.getByText('Download'));
    await fireEvent.press(screen.getByText('Zebra.pdf'));
    // toHavePathname is unavailable under RNTL v14; the reader's viewer tells where we are.
    expect(screen.getByTestId('pdf-native')).toBeTruthy();
    await act(async () => {
      pressBack();
    });
    expect(screen.queryByTestId('pdf-native')).toBeNull();
    expect(screen.getByText('Zebra.pdf')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to folders' })).toBeTruthy();
    jest.restoreAllMocks();
  });

  it('shows the scanning text, not "No PDFs found yet", during the first scan (F10)', async () => {
    useFiles.setState({ files: [], status: 'scanning', progress: null });
    await renderFiles();
    expect(screen.getByText('Looking for PDFs…')).toBeTruthy();
    expect(screen.queryByText('No PDFs found yet')).toBeNull();
  });

  it('sorts by name ascending and persists the choice', async () => {
    const real = useSettings.getState().setFilesSort;
    const setFilesSort = jest.fn(real);
    useSettings.setState({ setFilesSort });
    await renderFiles();
    await fireEvent.press(screen.getByLabelText('Sort by'));
    await fireEvent.press(screen.getByRole('radio', { name: 'Name' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Ascending' }));
    expect(setFilesSort).toHaveBeenLastCalledWith('name', 'asc');
    expect(useSettings.getState().filesSortKey).toBe('name');
    expect(useSettings.getState().filesSortDir).toBe('asc');
  });

  it('orders rows A to Z for name ascending', async () => {
    useSettings.setState({ filesSortKey: 'name', filesSortDir: 'asc' });
    await renderFiles();
    const names = screen.getAllByTestId('file-row-name').map((n) => n.props.children);
    expect(names).toEqual(['Apple.pdf', 'Fav.pdf', 'Zebra.pdf', 'अहवाल.pdf']);
  });

  it('renders a display-safe name for a row with bidi controls', async () => {
    useFiles.setState({ files: [makeRow({ name: '\u202Efdp.exe.pdf' })] });
    await renderFiles();
    expect(screen.getByText('fdp.exe.pdf')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^fdp\.exe\.pdf,/ })).toBeTruthy();
  });

  it('refreshes fully on pull-to-refresh', async () => {
    await renderFiles();
    await fireEvent(screen.getByTestId('files-list'), 'refresh');
    expect(refresh).toHaveBeenCalledWith('full');
  });

  it('shows the scan progress banner', async () => {
    useFiles.setState({ status: 'scanning', progress: { found: 12 } as never });
    await renderFiles();
    expect(screen.getByText('Scanning… 12 PDFs found')).toBeTruthy();
  });

  it('shows the storage explainer instead of the list without access', async () => {
    useStorage.setState({ mode: 'none' });
    await renderFiles();
    expect(screen.getByText(/needs access to your files/)).toBeTruthy();
    expect(screen.queryByText('Zebra.pdf')).toBeNull();
  });

  it('opens a file in the reader and marks it opened once it has loaded', async () => {
    await renderFiles();
    await fireEvent.press(screen.getByText('Zebra.pdf'));
    await act(async () => {});
    expect(screen.getByTestId('pdf-native')).toBeTruthy();
    expect(markOpened).not.toHaveBeenCalled();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await act(async () => {
      fakePdf.lastProps().onLoadComplete(3, '/p', { width: 1, height: 1 }, []);
    });
    expect(markOpened).toHaveBeenCalledTimes(1);
    expect(markOpened).toHaveBeenCalledWith('id-Zebra.pdf');
    jest.restoreAllMocks();
  });

  it('shows an index error banner with retry', async () => {
    useFiles.setState({ error: 'scan' });
    await renderFiles();
    await fireEvent.press(screen.getByLabelText('Retry'));
    expect(refresh).toHaveBeenCalledWith('full');
  });

  it('filters 1,000 files in under 100 ms', () => {
    const many = Array.from({ length: 1000 }, (_, i) => makeRow({ name: `File ${i}.pdf` }));
    const start = performance.now();
    const out = queryFiles(many, {
      segment: 'all',
      sortKey: 'name',
      sortDir: 'asc',
      search: 'file 99',
    });
    expect(performance.now() - start).toBeLessThan(100);
    expect(out).toHaveLength(11);
  });
});
