import { act, fireEvent } from '@testing-library/react-native';
import { Alert, BackHandler, type AlertButton } from 'react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import path from 'path';

import { pdfNative } from '@/services/native/pdfNative';
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

const openMore = () => fireEvent.press(screen.getByRole('button', { name: 'More' }));

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
    expect(disabled('Merge')).toBe(true);
    await openMore();
    expect(disabled('Split')).toBe(false);
    expect(disabled('Organise')).toBe(false);
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
    await openMore();
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

  describe('bulk actions (U2)', () => {
    let alert: jest.SpyInstance;
    const lastAlert = () => alert.mock.calls.at(-1) as [string, string, AlertButton[]];
    const confirmDelete = () =>
      act(async () => {
        lastAlert()[2].find((b) => b.style === 'destructive')!.onPress!();
      });
    /** Like the store: a removed row leaves the list. */
    const removing = (fail: Record<string, 'permission'> = {}) =>
      jest.fn(async (id: string) => {
        if (fail[id]) return fail[id];
        useFiles.setState((s) => ({ files: s.files.filter((f) => f.id !== id) }));
        return null;
      });
    const selectThree = async () => {
      await longPress('Zebra.pdf');
      await press('Apple.pdf');
      await press('Fav.pdf');
      expect(screen.getByText('3 selected')).toBeTruthy();
    };

    beforeEach(() => {
      alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    });

    it('deletes 3 PDFs one by one after confirming, then leaves selection mode', async () => {
      const remove = removing();
      useFiles.setState({ remove });
      await renderFiles();
      await selectThree();
      await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
      expect(lastAlert()[0]).toBe('Delete 3 PDFs?');
      expect(lastAlert()[1]).toBe('They will be permanently deleted from your phone.');
      expect(remove).not.toHaveBeenCalled();
      await confirmDelete();
      expect(remove.mock.calls.map((c) => c[0])).toEqual([
        'id-Zebra.pdf',
        'id-Apple.pdf',
        'id-Fav.pdf',
      ]);
      expect(screen.queryByText('3 selected')).toBeNull();
      expect(screen.getByPlaceholderText('Search PDFs')).toBeTruthy();
      expect(screen.getByText('Deleted 3 PDFs')).toBeTruthy();
      expect(screen.queryByText('Zebra.pdf')).toBeNull();
      expect(screen.getByText('Intent.pdf')).toBeTruthy();
    });

    it('keeps a row that could not be deleted and says how many failed', async () => {
      const remove = removing({ 'id-Apple.pdf': 'permission' });
      useFiles.setState({ remove });
      await renderFiles();
      await selectThree();
      await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
      await confirmDelete();
      expect(remove).toHaveBeenCalledTimes(3);
      expect(screen.getByText("Deleted 2 of 3. 1 couldn't be deleted.")).toBeTruthy();
      expect(screen.getByText('Apple.pdf')).toBeTruthy();
      expect(screen.queryByText('Zebra.pdf')).toBeNull();
      expect(screen.queryByText('1 selected')).toBeNull();
    });

    it('deletes nothing on Cancel', async () => {
      const remove = removing();
      useFiles.setState({ remove });
      await renderFiles();
      await selectThree();
      await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
      const cancel = lastAlert()[2].find((b) => b.style === 'cancel')!;
      expect(cancel.text).toBe('Cancel');
      await act(async () => cancel.onPress?.());
      expect(remove).not.toHaveBeenCalled();
      expect(screen.getByText('3 selected')).toBeTruthy();
    });

    it('uses the one-file copy for a single PDF', async () => {
      useFiles.setState({ remove: removing() });
      await renderFiles();
      await longPress('Zebra.pdf');
      await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
      expect(lastAlert()[0]).toBe('Delete this PDF?');
      expect(lastAlert()[1]).toBe('"Zebra.pdf" will be permanently deleted from your phone.');
      await confirmDelete();
      expect(screen.getByText('Deleted 1 PDF')).toBeTruthy();
    });

    it('disables Delete while a delete runs; a second tap does nothing', async () => {
      let release: (v: null) => void = () => {};
      const remove = jest.fn(() => new Promise<null>((r) => (release = r)));
      useFiles.setState({ remove });
      await renderFiles();
      await longPress('Zebra.pdf');
      await press('Apple.pdf');
      await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
      await confirmDelete();
      expect(remove).toHaveBeenCalledTimes(1);
      expect(disabled('Delete')).toBe(true);
      await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
      expect(alert).toHaveBeenCalledTimes(1);
      await act(async () => release(null));
      await act(async () => release(null));
      expect(remove).toHaveBeenCalledTimes(2);
    });

    it('adds favourites when any selected row is not one, else removes them all', async () => {
      const toggleFavorite = jest.fn();
      useFiles.setState({
        toggleFavorite,
        files: rows.map((r) => (r.name === 'Fav.pdf' ? { ...r, isFavorite: true } : r)),
      });
      await renderFiles();
      await longPress('Zebra.pdf');
      await press('Fav.pdf');
      await openMore();
      await fireEvent.press(screen.getByRole('button', { name: 'Add to favourites' }));
      expect(toggleFavorite.mock.calls).toEqual([['id-Zebra.pdf']]);
      expect(screen.queryByText('2 selected')).toBeNull();

      toggleFavorite.mockClear();
      useFiles.setState({ files: rows.map((r) => ({ ...r, isFavorite: true })) });
      await longPress('Zebra.pdf');
      await press('Fav.pdf');
      await openMore();
      await fireEvent.press(screen.getByRole('button', { name: 'Remove from favourites' }));
      expect(toggleFavorite.mock.calls).toEqual([['id-Zebra.pdf'], ['id-Fav.pdf']]);
    });

    it('shares the selected PDFs in one share sheet', async () => {
      const share = jest.spyOn(pdfNative, 'sharePdfs').mockResolvedValue(undefined);
      await renderFiles();
      await selectThree();
      await fireEvent.press(screen.getByRole('button', { name: 'Share' }));
      expect(share).toHaveBeenCalledTimes(1);
      expect(share).toHaveBeenCalledWith(
        [
          'file:///storage/emulated/0/Download/Zebra.pdf',
          'file:///storage/emulated/0/Download/Apple.pdf',
          'file:///storage/emulated/0/Download/Fav.pdf',
        ],
        'Share PDFs',
      );
    });

    it('opens one share sheet for a double tap while the first is being prepared', async () => {
      let finish: () => void = () => {};
      const share = jest
        .spyOn(pdfNative, 'sharePdfs')
        .mockImplementation(() => new Promise<void>((r) => (finish = r)));
      await renderFiles();
      await selectThree();
      await fireEvent.press(screen.getByRole('button', { name: 'Share' }));
      expect(disabled('Share')).toBe(true);
      await fireEvent.press(screen.getByRole('button', { name: 'Share' }));
      expect(share).toHaveBeenCalledTimes(1);
      await act(async () => finish());
      expect(disabled('Share')).toBe(false);
    });

    it('keeps Delete, Share and Merge on the bar and the rest under More', async () => {
      await renderFiles();
      await longPress('Zebra.pdf');
      for (const name of ['Delete', 'Share', 'Merge', 'More']) {
        expect(screen.getByRole('button', { name })).toBeTruthy();
        expect(screen.getByText(name).props.numberOfLines).toBe(1);
      }
      expect(screen.queryByRole('button', { name: 'Split' })).toBeNull();
      await openMore();
      for (const name of ['Add to favourites', 'Split', 'Organise']) {
        expect(screen.getByRole('button', { name })).toBeTruthy();
      }
    });
  });
});
