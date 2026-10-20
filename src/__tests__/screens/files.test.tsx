import { fireEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import path from 'path';

import { queryFiles } from '@/services/files/fileQuery';
import { makeRow } from '@/test-utils/fileRows';
import { useFiles } from '@/stores/filesStore';
import { useSettings } from '@/stores/settingsStore';
import { useStorage } from '@/stores/storageStore';

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

  it('opens a file in the reader and marks it opened', async () => {
    await renderFiles();
    await fireEvent.press(screen.getByText('Zebra.pdf'));
    expect(markOpened).toHaveBeenCalledWith('id-Zebra.pdf');
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
