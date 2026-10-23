import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';
import { I18nextProvider } from 'react-i18next';

import { FileActionsSheet } from '@/components/FileActionsSheet';
import { initI18n } from '@/i18n';
import { useFiles } from '@/stores/filesStore';
import { makeRow } from '@/test-utils/fileRows';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  // A 3-button navigation bar under an edge-to-edge window.
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 48, left: 0 }),
}));

const file = makeRow({ name: 'Report.pdf' });
const remove = jest.fn(() => Promise.resolve(null));
const rename = jest.fn((): Promise<string | null> => Promise.resolve(null));
const onClose = jest.fn();

function renderSheet(f = file) {
  return render(
    <I18nextProvider i18n={initI18n('en')}>
      <FileActionsSheet file={f} onClose={onClose} />
    </I18nextProvider>,
  );
}

describe('FileActionsSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useFiles.setState({
      remove: remove as never,
      rename: rename as never,
      toggleFavorite: jest.fn(),
      duplicate: jest.fn(() => Promise.resolve(null)),
      moveToAppFolder: jest.fn(() => Promise.resolve(null)),
    });
  });

  it('asks for confirmation and only the destructive button deletes', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderSheet();
    await fireEvent.press(screen.getByLabelText('Delete'));
    expect(alert).toHaveBeenCalledWith(
      'Delete this PDF?',
      '"Report.pdf" will be permanently deleted from your phone.',
      expect.any(Array),
    );
    const buttons = alert.mock.calls[0]![2]!;
    const cancel = buttons.find((b) => b.text === 'Cancel')!;
    const del = buttons.find((b) => b.text === 'Delete')!;
    expect(del.style).toBe('destructive');
    await act(async () => {
      cancel.onPress?.();
    });
    expect(remove).not.toHaveBeenCalled();
    await act(async () => {
      del.onPress?.();
    });
    await waitFor(() => expect(remove).toHaveBeenCalledWith(file.id));
  });

  it('rejects an invalid name without calling rename', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByLabelText('Rename'));
    await fireEvent.changeText(screen.getByLabelText('Rename PDF'), 'a/b');
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(screen.getByText(/Names can't contain/)).toBeTruthy();
    expect(rename).not.toHaveBeenCalled();
  });

  it('renames with a .pdf extension', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByLabelText('Rename'));
    await fireEvent.changeText(screen.getByLabelText('Rename PDF'), 'New');
    await fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() => expect(rename).toHaveBeenCalledWith(file.id, 'New.pdf'));
  });

  it('shows the store error when the name exists', async () => {
    rename.mockResolvedValueOnce('exists');
    await renderSheet();
    await fireEvent.press(screen.getByLabelText('Rename'));
    await fireEvent.changeText(screen.getByLabelText('Rename PDF'), 'New');
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(await screen.findByText('A file with that name already exists')).toBeTruthy();
  });

  it('hides Move to PDFToolkit for files already there', async () => {
    const inApp = makeRow({
      name: 'A.pdf',
      uri: 'file:///storage/emulated/0/Documents/PDFToolkit/A.pdf',
    });
    await renderSheet(inApp);
    expect(screen.queryByLabelText('Move to PDFToolkit folder')).toBeNull();
  });

  it('hides Move for app-folder files without a path: output rows and SAF documents (F2)', async () => {
    const moved = makeRow({
      name: 'B.pdf',
      uri: 'content://media/external/file/42',
      folder: 'Documents/PDFToolkit',
      source: 'output',
    });
    const view = await renderSheet(moved);
    expect(screen.queryByLabelText('Move to PDFToolkit folder')).toBeNull();
    await view.unmount();
    const safDoc = makeRow({
      name: 'C.pdf',
      uri: 'content://com.android.externalstorage.documents/tree/primary%3ADocuments/document/primary%3ADocuments%2FPDFToolkit%2FC.pdf',
      folder: 'Documents/PDFToolkit',
      source: 'saf',
    });
    await renderSheet(safDoc);
    expect(screen.queryByLabelText('Move to PDFToolkit folder')).toBeNull();
  });

  it('still offers Move for files elsewhere', async () => {
    await renderSheet();
    expect(screen.getByLabelText('Move to PDFToolkit folder')).toBeTruthy();
  });

  it('ignores dismissal while an action is pending, then closes when it finishes', async () => {
    let resolve!: (v: null) => void;
    const duplicate = jest.fn(() => new Promise<null>((r) => (resolve = r)));
    useFiles.setState({ duplicate: duplicate as never });
    await renderSheet();
    await fireEvent.press(screen.getByLabelText('Duplicate'));
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Duplicate')).toBeTruthy();
    await act(async () => resolve(null));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('never shows file A result on file B sheet', async () => {
    let resolve!: (v: string) => void;
    const duplicate = jest.fn(() => new Promise<string>((r) => (resolve = r)));
    useFiles.setState({ duplicate: duplicate as never });
    const other = makeRow({ name: 'Other.pdf' });
    const ui = (f: typeof file) => (
      <I18nextProvider i18n={initI18n('en')}>
        <FileActionsSheet file={f} onClose={onClose} />
      </I18nextProvider>
    );
    const view = await render(ui(file));
    await fireEvent.press(screen.getByLabelText('Duplicate'));
    await view.rerender(ui(other));
    await act(async () => resolve('notFound'));
    expect(screen.queryByText('This file no longer exists')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Duplicate').props.accessibilityState.disabled).toBeFalsy();
  });
  it('keeps its actions above the navigation bar', async () => {
    await renderSheet();
    const panel = StyleSheet.flatten(screen.getByTestId('bottom-sheet-panel').props.style);
    expect(panel.paddingBottom).toBe(16 + 48);
  });
});
