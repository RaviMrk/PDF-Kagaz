import { act, fireEvent } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import path from 'path';

import { makeRow } from '@/test-utils/fileRows';
import { useFiles } from '@/stores/filesStore';
import { useSettings } from '@/stores/settingsStore';
import { useStorage } from '@/stores/storageStore';

jest.setTimeout(20000);

jest.mock('@/db/useDatabaseReady', () => ({
  useDatabaseReady: () => ({ success: true, error: undefined }),
}));
jest.mock('@/services/files/useFileIndexLifecycle', () => ({ useFileIndexLifecycle: jest.fn() }));

const APP_DIR = path.join(__dirname, '../../../app');

const rows = [
  makeRow({ name: 'Zebra.pdf', modifiedAt: Date.UTC(2026, 0, 10), sizeBytes: 3000 }),
  makeRow({ name: 'Apple.pdf', modifiedAt: Date.UTC(2026, 0, 12), sizeBytes: 1000 }),
  makeRow({
    name: 'Intent.pdf',
    folder: '',
    parentUri: '',
    source: 'intent',
    modifiedAt: Date.UTC(2026, 0, 11),
  }),
  makeRow({
    name: 'Fav.pdf',
    folder: 'Documents',
    parentUri: 'file:///storage/emulated/0/Documents',
    modifiedAt: Date.UTC(2026, 0, 9),
  }),
];

type BackListener = Parameters<typeof BackHandler.addEventListener>[1];
let handlers: Set<BackListener>;
const pressBack = () =>
  [...handlers].reverse().some((h) => h({} as Parameters<BackListener>[0]) === true);

const longPress = (name: string) => fireEvent(screen.getByText(name), 'longPress');
const press = (name: string) => fireEvent.press(screen.getByText(name));
const disabled = (label: string) =>
  screen.getByRole('button', { name: label }).props.accessibilityState?.disabled === true;

let pending: ReturnType<typeof renderRouter>;
const pathname = () => pending.getPathname();
const params = () => pending.getSearchParams();

async function renderFiles() {
  pending = renderRouter(APP_DIR, { initialUrl: '/files' });
  await pending;
}

describe('Files tab selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    handlers = new Set();
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, handler) => {
      handlers.add(handler);
      return { remove: () => handlers.delete(handler) };
    });
    useSettings.setState({ onboardingDone: true, filesSortKey: 'date', filesSortDir: 'desc' });
    useStorage.setState({ mode: 'full', roots: [], canRequestFullAccess: true });
    useFiles.setState({
      files: rows,
      status: 'idle',
      progress: null,
      notice: null,
      error: null,
      refresh: jest.fn(() => Promise.resolve()),
      markOpened: jest.fn(),
      requestThumb: jest.fn(),
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('long-press starts selection with split and organise but not merge', async () => {
    await renderFiles();
    await longPress('Zebra.pdf');
    expect(screen.getByText('1 selected')).toBeTruthy();
    expect(disabled('Split')).toBe(false);
    expect(disabled('Organise')).toBe(false);
    expect(disabled('Merge')).toBe(true);
    expect(screen.queryByPlaceholderText('Search PDFs')).toBeNull();
  });

  it('merges in tap order, including an intent row', async () => {
    await renderFiles();
    await longPress('Zebra.pdf');
    await press('Intent.pdf');
    expect(screen.getByText('2 selected')).toBeTruthy();
    expect(disabled('Merge')).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Merge' }));
    expect(pathname()).toBe('/tool/merge');
    expect(params()).toEqual({
      toolId: 'merge',
      inputs: 'id-Zebra.pdf,id-Intent.pdf',
    });
  });

  it('tapping a selected row deselects it', async () => {
    await renderFiles();
    await longPress('Zebra.pdf');
    await press('Apple.pdf');
    await press('Zebra.pdf');
    expect(screen.getByText('1 selected')).toBeTruthy();
  });

  it('organises a single row', async () => {
    await renderFiles();
    await longPress('Apple.pdf');
    await fireEvent.press(screen.getByRole('button', { name: 'Organise' }));
    expect(pathname()).toBe('/tool/organize/id-Apple.pdf');
  });

  it('hardware back ends selection first and stays on the Files tab', async () => {
    await renderFiles();
    await longPress('Zebra.pdf');
    let handled = false;
    await act(async () => {
      handled = pressBack();
    });
    expect(handled).toBe(true);
    expect(pathname()).toBe('/files');
    expect(screen.getByPlaceholderText('Search PDFs')).toBeTruthy();
    expect(screen.queryByText('1 selected')).toBeNull();
  });

  it('select all covers every visible row', async () => {
    await renderFiles();
    await longPress('Zebra.pdf');
    await fireEvent.press(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByText('4 selected')).toBeTruthy();
  });

  it('cancel selection restores the search bar', async () => {
    await renderFiles();
    await longPress('Zebra.pdf');
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel selection' }));
    expect(screen.getByPlaceholderText('Search PDFs')).toBeTruthy();
  });

  it('works inside a folder and select all stays within it', async () => {
    await renderFiles();
    await fireEvent.press(screen.getByRole('radio', { name: 'Folders' }));
    await fireEvent.press(screen.getByText('Download'));
    await longPress('Zebra.pdf');
    await fireEvent.press(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByText('2 selected')).toBeTruthy();
  });

  it('drops a selected id when its row disappears', async () => {
    await renderFiles();
    await longPress('Zebra.pdf');
    await press('Apple.pdf');
    await act(async () => {
      useFiles.setState({ files: rows.filter((r) => r.name !== 'Apple.pdf') });
    });
    expect(screen.getByText('1 selected')).toBeTruthy();
  });

  it('clears the selection when the tab loses focus', async () => {
    await renderFiles();
    await longPress('Zebra.pdf');
    await fireEvent.press(screen.getByRole('tab', { name: 'Settings' }));
    await fireEvent.press(screen.getByRole('tab', { name: 'Files' }));
    expect(screen.getByPlaceholderText('Search PDFs')).toBeTruthy();
    expect(screen.queryByText('1 selected')).toBeNull();
  });

  it('tapping the checkbox zone toggles the row', async () => {
    await renderFiles();
    await longPress('Zebra.pdf');
    await press('Apple.pdf');
    expect(screen.getByText('2 selected')).toBeTruthy();
    const boxes = screen.getAllByTestId('file-row-checkbox', { includeHiddenElements: true });
    await fireEvent.press(boxes[0]!);
    expect(screen.getByText('1 selected')).toBeTruthy();
  });

  it('back clears selection inside a folder first, then leaves the folder', async () => {
    await renderFiles();
    await fireEvent.press(screen.getByRole('radio', { name: 'Folders' }));
    await fireEvent.press(screen.getByText('Download'));
    await longPress('Zebra.pdf');
    await act(async () => {
      pressBack();
    });
    expect(screen.queryByText('1 selected')).toBeNull();
    expect(screen.getByText('Zebra.pdf')).toBeTruthy();
    await act(async () => {
      pressBack();
    });
    expect(screen.getByText('Documents')).toBeTruthy();
  });

  it('ends selection mode when every selected row vanishes', async () => {
    await renderFiles();
    await longPress('Zebra.pdf');
    await act(async () => {
      useFiles.setState({ files: rows.filter((r) => r.name !== 'Zebra.pdf') });
    });
    expect(screen.getByPlaceholderText('Search PDFs')).toBeTruthy();
  });
});
